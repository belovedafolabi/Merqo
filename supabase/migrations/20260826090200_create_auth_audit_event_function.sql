-- Milestone 15 audit finding 1 (HIGH) — see
-- docs/milestones/15-audit/findings-and-fixes.md.
--
-- 20260822093500 granted EXECUTE on record_audit_event(...) to anon, so that
-- callers with no session — a failed sign-in, a rejected webhook — could
-- still write their audit rows. That grant is far wider than the need: every
-- argument of that function is caller-supplied, including
-- p_organization_id, p_user_id, p_action and an arbitrary jsonb
-- p_metadata. Anyone holding the public NEXT_PUBLIC_SUPABASE_ANON_KEY
-- (which ships to every browser, by design) could therefore POST directly
-- to /rest/v1/rpc/record_audit_event and inject unlimited rows attributed to
-- ANY organization and ANY user.
--
-- That defeats the entire point of the append-only audit trail
-- (docs/milestones/03-authentication-and-rbac-foundation.md's Security
-- Requirements): a log an unauthenticated stranger can write to is not
-- evidence of anything. The table's own append-only guarantee was intact —
-- the hole was the breadth of the one function allowed to append.
--
-- The fix is not to remove unauthenticated auditing (a failed-login trail
-- and a rejected-webhook trail are exactly what a security audit log is
-- for) but to give those callers a function shaped to their two legitimate
-- uses, following the narrow-anon-RPC idiom already established by
-- check_login_throttle() (20260822093400) and get_employee_invitation()
-- (20260824091000).
--
-- What this function does NOT let a caller control:
--   * organization_id — hardcoded null. A sessionless event has no org.
--   * user_id — derived from auth.uid(), never an argument (null for anon).
--   * action — allow-listed below, not free text.
--   * resource_type — DERIVED from the action, not passed. Keeping the pair
--     fixed in one place is what stops the two callers' shapes drifting.
--   * metadata — reduced to one lowercased, length-capped identifier
--     string, so it cannot be used as an unbounded blob store.
--
-- The allow-list has exactly two entries, matching the only two sessionless
-- audit writers in the codebase (verified by grepping every
-- createAnonSupabaseClient() caller plus every pre-session path in
-- app/(auth)/actions.ts):
--   * 'auth.sign_in_failed'          — app/(auth)/actions.ts :: signIn
--   * 'subscription.webhook_rejected' — app/api/webhooks/paystack/route.ts
--
-- Two OTHER auth actions look like they belong here and deliberately do not:
--   * 'auth.password_reset' runs inside a live recovery session.
--   * 'auth.sign_in_blocked_subscription' only appeared sessionless because
--     the call sat *after* supabase.auth.signOut(). That call is reordered
--     above the signOut() in the same commit as this migration, which lets
--     it keep its real organizationId/userId through the full
--     record_audit_event() path — strictly better evidence than this
--     narrowed function could produce.
create or replace function public.record_unauthenticated_audit_event(
  p_action text,
  p_identifier text default null,
  p_ip_address inet default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resource_type text;
begin
  -- Allow-list and resource_type derivation in one statement, so a new
  -- action cannot be added without also deciding what it is about.
  v_resource_type := case p_action
    when 'auth.sign_in_failed' then 'user'
    when 'subscription.webhook_rejected' then 'webhook_event'
    else null
  end;

  if v_resource_type is null then
    raise exception 'record_unauthenticated_audit_event: unsupported action %', p_action
      using errcode = '22023';
  end if;

  -- Rate limited in SQL, not in the TypeScript callers, and that placement
  -- is the point. The allow-list above stops an attacker FORGING a row; only
  -- this stops them FLOODING the table with well-formed ones. A check in
  -- lib/auth/audit.ts would be trivially bypassed by calling this RPC
  -- directly with the public anon key — which is precisely the threat this
  -- migration exists to close.
  --
  -- Keep the numbers in sync with RATE_LIMITS.unauth_audit in
  -- lib/rate-limit/config.ts, which documents them alongside the other four
  -- buckets. They are duplicated rather than read from there because this
  -- function must hold regardless of what any caller passes.
  if not public.consume_rate_limit(
    'unauth_audit',
    coalesce(host(p_ip_address), 'unknown'),
    30,
    60
  ) then
    raise exception 'record_unauthenticated_audit_event: rate limited'
      using errcode = '53400';
  end if;

  insert into public.audit_logs (
    organization_id, user_id, action, resource_type, resource_id,
    metadata, ip_address, user_agent
  )
  values (
    null,
    auth.uid(),
    p_action,
    v_resource_type,
    auth.uid(),
    case
      when p_identifier is null then '{}'::jsonb
      else jsonb_build_object('identifier', left(lower(p_identifier), 320))
    end,
    -- IP and user-agent stay caller-supplied: they are request metadata the
    -- database cannot observe for itself, and they are spoofable no matter
    -- which layer reads them. Recorded for correlation, never trusted as
    -- identity — nothing above keys off them.
    p_ip_address,
    p_user_agent
  );
end;
$$;

revoke execute on function public.record_unauthenticated_audit_event(text, text, inet, text) from public;
grant execute on function public.record_unauthenticated_audit_event(text, text, inet, text) to anon, authenticated;

-- The actual fix. `authenticated` keeps its grant: every remaining caller of
-- record_audit_event() runs inside a live session, and those callers
-- legitimately need the full argument surface (an inventory adjustment's
-- audit row genuinely does carry an organization_id and a resource_id the
-- database cannot derive on its own).
revoke execute on function public.record_audit_event(
  uuid, uuid, text, text, uuid, jsonb, inet, text
) from anon;
