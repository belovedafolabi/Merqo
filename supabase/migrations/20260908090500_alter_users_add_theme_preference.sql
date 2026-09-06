-- Per-user light / dark / system preference for the Admin shell (the POS and
-- auth shells stay on their fixed light theme). Server-stored so it follows
-- the user across devices and logins, not a browser-local setting. Mirrors
-- 20260902090100_alter_users_add_tour_completed_at.sql: a nullable column on
-- public.users, no backfill — a null means "system", which is the default
-- the app applies. No RLS change: users_select/users_update already scope a
-- user to their own row.
alter table public.users
  add column theme_preference text
  check (theme_preference is null or theme_preference in ('light', 'dark', 'system'));

-- Write path, mirroring mark_tour_completed() (20260902090100): can only ever
-- touch the caller's own row and only this one column. 'system' is stored as
-- NULL so "no explicit choice" and "follow the OS" are the same state.
create or replace function public.set_theme_preference(p_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_value is not null and p_value not in ('light', 'dark', 'system') then
    raise exception 'invalid theme preference: %', p_value using errcode = 'P0004';
  end if;
  update public.users
  set theme_preference = nullif(p_value, 'system')
  where id = auth.uid();
end;
$$;

revoke execute on function public.set_theme_preference(text) from public;
grant execute on function public.set_theme_preference(text) to authenticated;
