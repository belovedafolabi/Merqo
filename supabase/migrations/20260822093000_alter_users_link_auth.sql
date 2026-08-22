-- Reconciles public.users with Supabase Auth's identity, per Milestone 02's
-- own anticipation of this ("id is expected to be reconciled with
-- auth.users.id once Milestone 03 wires up Supabase Auth"). Chosen design:
-- public.users.id IS auth.users.id (1:1, same value) — simplest join story
-- for every RLS policy and security-definer function that follows.
alter table public.users
  alter column id drop default,
  add constraint users_id_fkey foreign key (id) references auth.users(id) on delete cascade;

-- Auto-creates the public.users row the moment Supabase Auth creates the
-- underlying identity (sign-up), so application code never has to remember
-- to do it as a second step. SECURITY DEFINER: the inserting session is the
-- GoTrue service role acting on auth.users, not an authenticated app user,
-- so it needs elevated rights to write into public.users.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_handle_new_auth_user
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
