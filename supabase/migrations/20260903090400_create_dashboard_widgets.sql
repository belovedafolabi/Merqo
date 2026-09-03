-- Per-user dashboard composition — which cards a user has on their Overview
-- screen and in what order. Backs the "Add widget" button, which has been a
-- decorative <Button> with no onClick since Milestone 04.
--
-- =============================================================================
-- WHY A ROW IS AN OVERRIDE, NOT A MEMBERSHIP
-- =============================================================================
-- The obvious design is "a row means the widget is on the dashboard, delete it
-- to remove it". It has an ambiguity that bites immediately: a user who has
-- removed every widget is indistinguishable from a user who has never touched
-- the screen, so the defaults would reappear the moment they finished clearing
-- them.
--
-- So a row is an OVERRIDE of the registry default, exactly as
-- 20260824100200's notification_preferences rows are: no row means "use
-- lib/dashboard/widgets.ts's default for this widget", and `enabled` says
-- which way the user overrode it. Rows are written lazily, only when someone
-- actually adds or removes a card.
--
-- =============================================================================
-- WHY NOT A SINGLE JSONB LAYOUT COLUMN ON users
-- =============================================================================
-- One `dashboard_layout jsonb` column would be fewer objects, and it is what
-- most dashboards do. Rejected because it makes the widget id an untyped
-- string inside a blob that no constraint can check — precisely the generic
-- settings-store shape docs/architecture/database-conventions.md and
-- docs/TAS.md §9 rule out. The CHECK below is the point of using rows: a
-- caller writing straight to PostgREST cannot persist a widget id the
-- dashboard has no component for.
--
-- =============================================================================
-- THE CHECK MIRRORS THE TYPESCRIPT REGISTRY
-- =============================================================================
-- Same TS-registry-mirrors-SQL arrangement as lib/receipts/templates.ts vs
-- organizations_receipt_template_id_check (20260824091000), and
-- lib/reports/registry.ts vs run_custom_report(). The list is stated twice, in
-- TypeScript and in Postgres, and tests/unit/dashboard/widgets.test.ts reads
-- this file and asserts the two stay identical — so adding a widget in TS
-- without a migration fails the build rather than failing at runtime.
create table public.dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  widget_id text not null constraint dashboard_widgets_widget_id_check check (
    widget_id in (
      'sales_summary',
      'sales_overview',
      'low_stock',
      'recent_products',
      'recent_sales',
      'top_products'
    )
  ),
  enabled boolean not null default true,
  -- Ties within a position fall back to the registry's own order, so a layout
  -- written before ordering was ever exposed in the UI still renders sensibly.
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.dashboard_widgets is
  'Per-user override of the default Admin dashboard composition. A missing row '
  'means "use lib/dashboard/widgets.ts''s default for that widget"; a present '
  'row''s `enabled` is the user''s explicit choice.';

create unique index dashboard_widgets_user_widget_key
  on public.dashboard_widgets (user_id, widget_id);

create trigger trg_dashboard_widgets_updated_at
  before update on public.dashboard_widgets
  for each row execute function public.set_updated_at();

alter table public.dashboard_widgets enable row level security;

-- An explicit table grant, NOT just the policies below. A policy decides which
-- rows a role may touch; it does not grant the role any privilege on the table
-- to begin with, and a table with policies but no grant fails every request
-- with 42501 permission denied.
grant select, insert, update on public.dashboard_widgets to authenticated;

-- Self-scoped throughout: a dashboard layout belongs to exactly the user whose
-- dashboard it is. There is no organization_id column and deliberately so —
-- this is a personal view preference, not tenant data, and scoping it to the
-- user is both simpler and strictly tighter than scoping it to the org.
create policy dashboard_widgets_select_self on public.dashboard_widgets
  for select
  using (user_id = auth.uid() and public.user_is_active());

create policy dashboard_widgets_insert_self on public.dashboard_widgets
  for insert
  with check (user_id = auth.uid() and public.user_is_active());

create policy dashboard_widgets_update_self on public.dashboard_widgets
  for update
  using (user_id = auth.uid() and public.user_is_active())
  with check (user_id = auth.uid());

-- No delete policy or grant, matching notification_preferences: a user removes
-- a widget by setting `enabled` false, which is what keeps "removed" distinct
-- from "never chosen".
