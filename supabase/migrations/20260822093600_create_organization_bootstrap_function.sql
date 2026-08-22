-- Resolves the chicken-and-egg of self-serve sign-up: a brand-new user has
-- no organization yet, so no ordinary RLS policy could ever let them INSERT
-- one (every policy this milestone authors checks EXISTING scope). This
-- function is the one deliberate, atomic exception — SECURITY DEFINER,
-- callable only by `authenticated` — that satisfies the Functional
-- Requirement "On first Organization signup, an Owner/Admin user and role
-- are created automatically with full permissions scoped to that
-- Organization."
--
-- One-org-per-new-user: a caller who already holds any user_roles row is
-- rejected. Joining a second organization is an invite/admin flow, not
-- self-serve sign-up, and is out of this milestone's scope.
create or replace function public.create_organization_with_owner(
  p_organization_name text,
  p_organization_slug text,
  p_full_name text default null
)
returns table (organization_id uuid, user_role_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_role_id uuid;
  v_organization_id uuid;
  v_user_role_id uuid;
begin
  if v_user_id is null then
    raise exception 'create_organization_with_owner requires an authenticated caller';
  end if;

  if exists (select 1 from public.user_roles where user_id = v_user_id) then
    raise exception 'this user already belongs to an organization';
  end if;

  select id into v_owner_role_id from public.roles where slug = 'owner';
  if v_owner_role_id is null then
    raise exception 'seeded "owner" role not found — has supabase/seed.sql been applied?';
  end if;

  if p_full_name is not null then
    update public.users set full_name = p_full_name where id = v_user_id;
  end if;

  insert into public.organizations (name, slug, created_by)
  values (p_organization_name, p_organization_slug, v_user_id)
  returning id into v_organization_id;

  insert into public.user_roles (user_id, role_id, organization_id, created_by)
  values (v_user_id, v_owner_role_id, v_organization_id, v_user_id)
  returning id into v_user_role_id;

  perform public.record_audit_event(
    v_organization_id, v_user_id, 'organization.created', 'organization', v_organization_id
  );
  perform public.record_audit_event(
    v_organization_id, v_user_id, 'user_role.assigned', 'user_role', v_user_role_id,
    jsonb_build_object('role_id', v_owner_role_id, 'target_user_id', v_user_id)
  );

  return query select v_organization_id, v_user_role_id;
end;
$$;

revoke execute on function public.create_organization_with_owner(text, text, text) from public;
grant execute on function public.create_organization_with_owner(text, text, text) to authenticated;
