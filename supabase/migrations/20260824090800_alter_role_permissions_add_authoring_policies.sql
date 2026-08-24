-- THE highest-risk predicate in Milestone 11. This is the policy that makes
-- "roles are configurations, not application logic"
-- (docs/Auth_Users_Roles_Authorization.md) safe to expose as a UI: the
-- builder composes permissions, and this decides what it is allowed to
-- compose.
--
-- Three conjuncts on insert, each closing a different attack:
--
--   (a) user_can_author_roles()
--       A user with no roles.create writes nothing at all.
--
--   (b) the target role is not a system role
--       Otherwise the cheapest escalation in the product is: bolt
--       `roles.create` (or `sales.refund`, or anything) onto the seeded
--       Cashier role, which you or a colleague already hold. No new role, no
--       new assignment, no UI trace — just one row, and every Cashier in the
--       organization silently gains it.
--
--   (c) THE SELF-ELEVATION GUARD
--       The permission being attached must be one the author already holds
--       org-wide, right now. Without this, roles.create alone is a universal
--       escalation: mint "Helper", tick `expense.delete`, assign it to
--       yourself, and you have granted yourself a power nobody gave you.
--
-- Conjunct (c) is evaluated per row, which is what makes a partial attack
-- fail cleanly: a 40-checkbox submit where 39 boxes are legal and one is not
-- is rejected in full, because lib/roles/mutations.ts sends the whole set as
-- one `.insert([...])` statement and a WITH CHECK failure aborts the
-- statement. The user cannot bank the 39 and retry.
--
-- It matters that this lives in RLS and not in the Server Action. `POST
-- /rest/v1/role_permissions` with a valid low-privilege JWT — curl, Postman,
-- a compromised browser tab — never touches lib/roles/mutations.ts, and hits
-- exactly this check instead. The UI's disabled checkboxes
-- (components/roles/permission-checklist.tsx) mirror this predicate so the
-- escalation cannot even be attempted by accident; they are not the boundary.
--
-- NOTE FOR TESTS: an Owner passes conjunct (c) trivially, because
-- supabase/seed.sql §6 cross-joins Owner against the entire permission
-- catalog. Any escalation test written as Owner therefore passes vacuously
-- and proves nothing. tests/integration/role-builder.test.ts must build a
-- purpose-made low-privilege role that holds roles.create and little else.
--
-- Table-qualified `role_permissions.role_id` / `.permission_id` throughout:
-- the subqueries join `roles` and `permissions`, which have their own `id`
-- columns, and an unqualified reference would bind to the wrong one. Same
-- precaution as 20260823101300's storage policies qualifying `objects.name`.

create policy role_permissions_insert on public.role_permissions
  for insert
  to authenticated
  with check (
    public.user_can_author_roles()
    and exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and r.is_system_role = false
    )
    and exists (
      select 1
      from public.permissions p
      join public.current_user_permission_grants() g on g.permission_key = p.key
      where p.id = role_permissions.permission_id
        and g.branch_id is null
        and g.business_unit_id is null
    )
  );

-- Removing a permission from a custom role needs (a) and (b) but not (c):
-- taking authority away is never an escalation, and requiring you to hold a
-- permission in order to *remove* it would strand a role holding something
-- its author can no longer see.
--
-- There is no UPDATE policy. Editing a role's permission set is delete +
-- insert, which keeps every permission that gets ADDED on the one path that
-- runs conjunct (c). An UPDATE policy would offer a second way to change
-- permission_id on an existing row, and would have to re-implement the same
-- guard to be safe — a duplicate of the highest-risk predicate in the
-- codebase is exactly the thing to not have two copies of.
create policy role_permissions_delete on public.role_permissions
  for delete
  to authenticated
  using (
    public.user_can_author_roles()
    and exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and r.is_system_role = false
    )
  );
