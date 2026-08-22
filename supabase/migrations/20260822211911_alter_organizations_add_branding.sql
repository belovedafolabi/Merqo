-- Branding override mechanism (docs/milestones/04-design-system-and-app-shell.md
-- Database Changes: "organization branding fields... likely columns on
-- organizations"). Deliberately four fields only, per the milestone's own
-- Implementation Notes ("resist expanding it speculatively"). Values are
-- placeholders/defaults for now — the editing UI is Milestone 11; this
-- milestone only builds the mechanism that reads and renders them
-- (lib/branding/queries.ts, components/branding/brand-style.tsx).
--
-- No new RLS policy is needed: organizations_select/organizations_update
-- (20260822093700_alter_organizations_add_policies.sql) already scope
-- read/write access to these columns via user_has_org_access() /
-- 'organizations.update', and these are plain columns on that same table.
alter table public.organizations
  add column primary_color text,
  add column secondary_color text,
  add column logo_url text,
  add column brand_name text;

comment on column public.organizations.primary_color is
  'Hex color for primary buttons, selected navigation, links (docs/UXUI_Design_System_Specification.md §4). Validated/contrast-checked at render time by lib/branding, never trusted raw.';
comment on column public.organizations.secondary_color is
  'Hex color for secondary actions/accents, used more sparingly than primary_color (docs/UXUI_Design_System_Specification.md §4).';
comment on column public.organizations.logo_url is
  'Supabase Storage URL for the organization logo. Null falls back to brand_name/organization name text.';
comment on column public.organizations.brand_name is
  'Display name shown in the app shell/receipts when set; falls back to organizations.name when null.';
