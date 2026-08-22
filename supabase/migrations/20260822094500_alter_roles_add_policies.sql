-- The role catalog (system + future custom roles) is readable by any
-- authenticated user — needed to populate a role-assignment picker, and not
-- sensitive on its own (the sensitive part is *who holds which role at
-- which scope*, gated on user_roles below). No mutation policy: creating a
-- custom role is Milestone 11's role-builder UI, which will add its own
-- permission and policy alongside that feature — this milestone only has to
-- guarantee the schema/enforcement exists, not the authoring UI.
create policy roles_select on public.roles
  for select
  to authenticated
  using (true);
