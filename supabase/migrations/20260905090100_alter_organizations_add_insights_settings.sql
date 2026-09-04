-- Milestone 17 Part A — two org-level knobs the Sales Insights page reads.
--
-- Settings live as columns on `organizations`, not in a settings table: the
-- same shape `receipt_*` (20260824091000) and `default_low_stock_threshold`
-- (20260904090000) already use, and a settings table / EAV store was
-- deliberately rejected (docs/architecture/database-conventions.md, TAS §9).
--
--   insights_lead_days             — how many days of stock a restock
--                                    suggestion aims to cover. Default 14.
--   insights_reorder_threshold_days — a product is flagged for restock when
--                                    its days-of-cover falls below this.
--                                    Default 7.
--
-- Both are gated by the existing organizations_update policy
-- (organizations.update); no new RLS.

alter table public.organizations
  add column insights_lead_days integer not null default 14
    constraint organizations_insights_lead_days_check
    check (insights_lead_days between 1 and 180),
  add column insights_reorder_threshold_days integer not null default 7
    constraint organizations_insights_reorder_threshold_days_check
    check (insights_reorder_threshold_days between 1 and 90);

comment on column public.organizations.insights_lead_days is
  'Sales Insights: days of stock a restock suggestion aims to cover.';
comment on column public.organizations.insights_reorder_threshold_days is
  'Sales Insights: flag a product for restock when days-of-cover drops below this.';
