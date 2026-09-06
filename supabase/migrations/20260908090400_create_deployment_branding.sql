-- The sign-in / sign-up / password-reset screens render before any session
-- exists, so they can't use getCurrentOrganizationId() / getOrganizationBranding()
-- to know the deployment's brand colours — and organizations_select
-- (20260822093700) hides the row from anon anyway. This platform ships one
-- organization per deployment (docs/milestones/DECISIONS_AND_CONFLICTS.md §5),
-- so "the org" is unambiguous.
--
-- deployment_branding() returns ONLY the two brand colours + a display name
-- (no id, no address, no tenant data) so the auth screens can tint their
-- brand glow / shimmer to match the rest of the app. Deliberately
-- anon-executable — the sixth entry in tests/integration/security-sweep.test.ts's
-- allow-list, added with this migration.
create or replace function public.deployment_branding()
returns table (primary_color text, secondary_color text, display_name text)
language sql
security definer
stable
set search_path = public
as $$
  select o.primary_color, o.secondary_color, coalesce(o.brand_name, o.name)
  from public.organizations o
  order by o.created_at
  limit 1;
$$;

revoke execute on function public.deployment_branding() from public;
grant execute on function public.deployment_branding() to anon, authenticated;
