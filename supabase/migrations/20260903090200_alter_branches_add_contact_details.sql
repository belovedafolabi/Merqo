-- A branch's own postal address and phone number, printed on its receipts
-- under the business name.
--
-- =============================================================================
-- THIS DELIBERATELY REVISITS A MILESTONE 11 SCOPE DECISION
-- =============================================================================
-- 20260824091000's header records that receipt business-information was put on
-- `organizations` because "Milestone 11's Future Considerations pin both to the
-- organization level for MVP (branch-specific branding is out of MVP scope)".
-- That is being narrowed here, on purpose and at the product owner's explicit
-- direction, for one reason: an address is not branding. A multi-branch
-- retailer has one brand and several shopfronts, and a receipt that prints the
-- head-office address for a sale rung up across town is simply wrong — it is
-- the line a customer uses to find the shop they bought from, and in several
-- jurisdictions the line that makes the receipt a valid proof of purchase.
--
-- The organization-level `address_line` (20260824091000) is NOT removed and
-- stays the fallback: a single-shop business fills in one address in Settings →
-- Organization and never has to think about branches at all. Only a branch that
-- sets its own overrides it. Nothing about branding — logo, colours, template —
-- moves to the branch, so the MVP decision that mattered still stands.
--
-- Interesting note for anyone auditing lib/form-hints.ts: FORM_HINTS.branch
-- has carried copy for exactly these two fields ("The branch's physical
-- address, printed on receipts if no header text is set", "A contact number
-- for this branch") since Milestone 11, describing a form that never had them.
-- Those hints stop being fiction with this migration.
--
-- No new RLS policy and no new grant: branches_select / branches_update
-- (20260822093800) already gate every column on this table, and
-- `authenticated` already holds SELECT/UPDATE on it. A column added to a table
-- inherits both.
alter table public.branches
  add column address_line text,
  add column contact_phone text;

comment on column public.branches.address_line is
  'Printed on this branch''s receipts beneath the business name. Falls back to organizations.address_line when null.';
comment on column public.branches.contact_phone is
  'Printed alongside the branch address on receipts. Falls back to organizations.contact_phone when null.';
