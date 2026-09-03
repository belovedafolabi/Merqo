-- Records which coupon (if any) was redeemed on a sale.
--
-- The coupon's monetary effect already lives in sales.discount_amount — a
-- redeemed coupon resolves to an amount that lib/sales/mutations.ts adds to
-- the discount stage. This column is the audit link: which code produced that
-- discount, for the receipt and for a future "coupon usage" report.
--
-- Nullable and `on delete set null`: the overwhelming majority of sales carry
-- no coupon, and a coupon is soft-archived (never hard-deleted) so this
-- normally stays a live reference. No RLS or grant change — sales_select
-- (20260823121700) already gates every column and `authenticated` holds
-- SELECT; the column is written only by create_sale() (SECURITY DEFINER).

alter table public.sales
  add column coupon_id uuid references public.coupons(id) on delete set null;

create index sales_coupon_id_idx on public.sales (coupon_id, created_at desc)
  where coupon_id is not null;

comment on column public.sales.coupon_id is
  'The coupon redeemed on this sale, if any. Its discount is already included '
  'in sales.discount_amount; this is the audit link to the code.';
