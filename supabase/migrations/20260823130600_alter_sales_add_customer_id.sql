-- Attaches Milestone 08's `sales` to Milestone 09's `customers`, which is
-- what makes this milestone's "Customer transaction history (sales, returns,
-- store-credit activity, layaway activity)" expressible at all — M08 shipped
-- `sales` with no customer link because `customers` did not exist yet.
--
-- Nullable, and permanently so: the overwhelmingly common POS case is an
-- anonymous walk-in, and forcing a customer row per sale would either block
-- checkout or spawn junk "Walk-in" records. A store-credit sale is the one
-- case that requires a customer, and that requirement is enforced where it
-- belongs — inside create_sale() (20260823130800), which raises if
-- p_payment_method = 'store_credit' arrives with no customer — not as a
-- table-wide NOT NULL that would break every cash sale.
--
-- No matching column on `returns`/`refunds`: both reach their customer
-- through the `sale_id` they already carry. A second copy would be a second
-- thing that can disagree with the first.
alter table public.sales
  add column customer_id uuid references public.customers(id) on delete restrict;

create index sales_customer_id_idx on public.sales (customer_id, created_at desc)
  where customer_id is not null;
