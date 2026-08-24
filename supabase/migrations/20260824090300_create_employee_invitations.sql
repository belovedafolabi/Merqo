-- Token-based employee invitations, per
-- docs/milestones/11-administration-employees-and-branding.md Technical
-- Requirements: "a token-based invite flow (signed, time-limited invite
-- link)" whose tokens are "single-use, time-limited, and unguessable
-- (cryptographically random)".
--
-- ONLY THE HASH IS STORED. lib/employees/invitations.ts generates a
-- 32-byte random token and this table receives its SHA-256 hex digest. The
-- raw token exists in exactly three places — the email body, the URL the
-- invitee clicks, and the one-time copy-link value returned to the inviter —
-- and never in Postgres. So a database dump, a backup, a leaked SELECT, or a
-- statement captured in pg_stat_statements yields nothing replayable. This is
-- the same reasoning that says never store a password, applied to a
-- credential that grants org access exactly once.
--
-- SCOPE IS DECIDED AT INVITE TIME, NOT ACCEPTANCE TIME. role_id/branch_id/
-- business_unit_id mirror user_roles' shape so accept_employee_invitation()
-- copies them straight across. The invitee never chooses their own role —
-- they would be choosing their own permissions, which is self-elevation
-- through the front door.
create table public.employee_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  email text not null,
  role_id uuid not null references public.roles(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  business_unit_id uuid references public.business_units(id) on delete restrict,
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

comment on table public.employee_invitations is
  'Pending and historical employee invitations. Rows are never deleted — '
  'revoking sets revoked_at — so the invite trail stays auditable.';
comment on column public.employee_invitations.token_hash is
  'SHA-256 hex digest of the invite token. The raw token is never stored.';

-- Unique on the hash: the lookup key for both invitation RPCs, and it makes a
-- hash collision (or a duplicate insert) a constraint error rather than an
-- ambiguous multi-row match at acceptance time.
create unique index employee_invitations_token_hash_key
  on public.employee_invitations (token_hash);

-- At most one LIVE invitation per email per organization. This is what makes
-- "resend" an UPDATE of the existing row (new token, new expiry) rather than
-- a second simultaneously-valid token — two live tokens for one person means
-- revoking one leaves the other working, which is a revocation that does not
-- revoke. Partial, so an accepted or revoked row never blocks a fresh invite
-- to the same person later.
create unique index employee_invitations_pending_email_key
  on public.employee_invitations (organization_id, lower(email))
  where accepted_at is null and revoked_at is null;

create index employee_invitations_organization_id_idx
  on public.employee_invitations (organization_id, created_at desc);

create trigger trg_employee_invitations_updated_at
  before update on public.employee_invitations
  for each row execute function public.set_updated_at();

alter table public.employee_invitations enable row level security;
