-- Receipt template selection/configuration and the business-information
-- fields a receipt prints, per docs/PRD.md §30 and Milestone 11's Scope
-- ("select/configure a receipt template, incorporating branding, business
-- information, and the standard transaction fields defined in Milestone 08").
--
-- COLUMNS ON organizations, NOT A receipt_templates TABLE. The milestone doc
-- allows either. Columns win here for three reasons: the four branding
-- columns this sits beside already live on organizations
-- (20260822211911_alter_organizations_add_branding.sql), and receipt
-- appearance IS branding; Milestone 11's Future Considerations pin both to
-- the organization level for MVP ("branch-specific branding is out of MVP
-- scope"), so a table would be a permanent 1:1 side-table with no second row
-- to justify it; and a table of template rows drifts naturally toward a
-- generic (key, value) settings store, which
-- docs/architecture/database-conventions.md and docs/TAS.md §9 both rule out
-- explicitly ("a deliberate rejection of a generic key-value/EAV settings
-- engine").
--
-- No new RLS policy: organizations_select / organizations_update
-- (20260822093700) already gate every column on this table, the latter on
-- the `organizations.update` permission — which is exactly the right gate for
-- both the branding editor and the receipt editor.
alter table public.organizations
  add column receipt_template_id text not null default 'classic',
  add column receipt_header_text text,
  add column receipt_footer_text text,
  add column receipt_show_logo boolean not null default true,
  add column receipt_show_cashier boolean not null default true,
  add column contact_phone text,
  add column contact_email text,
  add column address_line text;

-- The SQL half of the lib/receipts/templates.ts registry, mirroring the
-- lib/reports/registry.ts <-> run_custom_report() arrangement Milestone 10
-- established: the whitelist is stated twice, in TypeScript and in Postgres,
-- so a caller who bypasses the app and writes straight to PostgREST still
-- cannot set a template id the renderer does not know how to draw. A unit
-- test (tests/unit/receipts/templates.test.ts) reads this file and asserts
-- the two lists stay identical, exactly as tests/unit/reports/registry.test.ts
-- does for its counterpart.
alter table public.organizations
  add constraint organizations_receipt_template_id_check
  check (receipt_template_id in ('classic', 'compact', 'detailed'));

comment on column public.organizations.receipt_template_id is
  'Which built-in receipt layout to render. Whitelisted here and in '
  'lib/receipts/templates.ts; the two are asserted in sync by a unit test.';
comment on column public.organizations.receipt_header_text is
  'Optional line printed above the transaction (e.g. "Thank you for shopping with us").';
comment on column public.organizations.receipt_footer_text is
  'Optional line printed below the totals (e.g. a returns policy).';
comment on column public.organizations.contact_phone is
  'Business contact details printed on receipts (docs/PRD.md §30) and editable '
  'in the settings screens — the ongoing organization-level configuration '
  'Milestone 05 covered only at onboarding time.';
