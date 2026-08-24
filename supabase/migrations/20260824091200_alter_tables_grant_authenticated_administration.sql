-- Table-level privileges for Milestone 11's administration surface. RLS
-- decides WHICH rows; these grants decide whether the verb is available at
-- all. Both layers are required — a policy on a table the role holds no
-- privilege on is unreachable, and a privilege with no policy is denied by
-- RLS's default-deny.
--
-- (TRUNCATE/REFERENCES/TRIGGER are already revoked schema-wide and from
-- future tables by 20260823140000, so employee_invitations inherits that
-- correction without restating it here.)

-- roles / role_permissions were select-only since Milestone 03. The custom-role
-- builder needs the writing verbs, each one already fenced by
-- 20260824090700 / 20260824090800.
grant insert, update on public.roles to authenticated;
grant insert, delete on public.role_permissions to authenticated;

-- No DELETE on roles: 20260824090700 authors no delete policy (see its
-- header), and a grant without a policy is a dead privilege that only
-- muddies the audit of what is actually reachable.

grant select, insert, update on public.employee_invitations to authenticated;

-- No DELETE on employee_invitations either: revocation is an update, so the
-- invite trail is append-only in effect.

-- Deliberately absent: any new grant on public.users. It keeps exactly the
-- `select, update` it had, with users_update_self restricting the update to
-- the caller's own row — so deactivated_at (20260824090000) is unreachable
-- through PostgREST by anyone, and set_employee_active() (20260824090200) is
-- the only way it can change.

-- Function EXECUTE grants live beside their own definitions
-- (20260824090100/090200/090250/090500), following the pattern
-- 20260822093300 set: a function's privilege belongs in the file that
-- creates it, so the two can never be added out of step.
