# RLS policy checklist

One row per table. Verified against the live catalog after
`supabase db reset` on the Milestone 15 branch, and enforced on every CI run
by `tests/integration/security-sweep.test.ts`.

**Totals:** 50 tables · 50 with RLS enabled · 48 with ≥1 policy · 2 deliberate
zero-policy (see note).

Columns:
- **Cmds** — which of **S**ELECT / **I**NSERT / **U**PDATE / **D**ELETE have a
  policy. A missing letter means that verb has no policy *and* no table grant,
  so it is only reachable through a `SECURITY DEFINER` function (the
  append-only pattern), or it is genuinely not offered.
- **Scoping** — how a row is bound to a tenant.
- **Verdict** — ✅ correct · ✅* correct, non-obvious (see Notes).

| Table | Cmds | Scoping | Verdict |
|-------|------|---------|---------|
| **Milestone 02–03 — core domain, RBAC, audit** ||||
| `organizations` | S U | `user_has_org_access(id)`; INSERT only via `create_organization_with_owner()` | ✅ |
| `branches` | I S U | `user_has_org_access(organization_id)` / `user_has_branch_access` | ✅ |
| `business_units` | I S U | `user_has_branch_access(branch_id, …)` | ✅ |
| `business_types` | S | global catalog, `using (true)` | ✅* |
| `capabilities` | S | global catalog, `using (true)` | ✅* |
| `business_type_capabilities` | S | global catalog, `using (true)` | ✅* |
| `business_unit_capabilities` | S U | via `business_units` → branch access; INSERT by trigger | ✅ |
| `users` | S U | `user_shares_org_with(id)`; self-UPDATE only; INSERT by `handle_new_auth_user` trigger | ✅ |
| `roles` | I S U | **M15 finding 2:** SELECT now `is_system_role OR created_by = auth.uid() OR user_shares_org_with(created_by)` | ✅ |
| `permissions` | S | global catalog, `using (true)` | ✅* |
| `role_permissions` | D I S | **M15 finding 2:** SELECT via `role_is_visible(role_id)`; INSERT/DELETE via the M11 escalation guard | ✅ |
| `user_roles` | D I S U | `user_has_permission('roles.assign', organization_id)` + `user_grants_cover_role(role_id)` escalation guard | ✅ |
| `audit_logs` | S | `user_has_org_access(organization_id)`; **no write policy or grant** — append-only via `record_audit_event()` / `record_unauthenticated_audit_event()` | ✅* |
| `login_attempts` | — | **zero policies, zero grants** — reachable only via `check_login_throttle()` / `record_login_attempt()` | ✅* |
| **Milestone 05 — business structure** ||||
| `business_unit_pos_config` | I S U | via `business_units` → branch access | ✅ |
| **Milestone 06 — catalog & pricing** ||||
| `categories` | I S U | via `business_units` → branch access; no DELETE (archive-via-update) | ✅ |
| `products` | I S U | via `business_units` → branch access; no DELETE (archive) | ✅ |
| `product_variants` | I S U | via parent `products` | ✅ |
| `product_images` | D I S U | via parent `products` | ✅ |
| `branch_price_overrides` | D I S U | `user_has_branch_access` | ✅ |
| `product_prices` | S | via parent product; **append-only** via `record_product_price()` | ✅* |
| **Milestone 07 — inventory** ||||
| `inventory_balances` | S U | `user_has_branch_access(branch_id)`; UPDATE limited to reorder-threshold columns; quantity only via `record_inventory_movement()` | ✅* |
| `inventory_movements` | S | `user_has_branch_access`; **append-only** via `record_inventory_movement()` | ✅* |
| `stock_transfers` | S | branch access on source/destination; **append-only** via `execute_stock_transfer()` | ✅* |
| `stock_transfer_items` | S | via parent `stock_transfers` | ✅* |
| `batches` | I S U | via `products` → branch access; no DELETE | ✅ |
| **Milestone 08 — POS** ||||
| `sales` | S | `user_has_branch_access(branch_id)`; **append-only** via `create_sale()` | ✅* |
| `sale_items` | S | via parent `sales` | ✅* |
| `payments` | S | via parent `sales` | ✅* |
| `returns` | S | via parent `sales`; **append-only** via `create_return()` | ✅* |
| `return_items` | S | via parent `returns` | ✅* |
| `refunds` | S | via parent `returns`; **append-only** via `request_refund()` / `decide_refund()` | ✅* |
| `held_sales` | D I S | `user_has_branch_access`; UPDATE not offered (resume = delete + new sale) | ✅ |
| `held_sale_items` | D I S | via parent `held_sales` | ✅ |
| **Milestone 09 — customers, store credit, layaway** ||||
| `customers` | I S U | `user_has_org_access(organization_id)` (business-wide); no DELETE (archive) | ✅ |
| `store_credit_accounts` | S | via `customers` → org access; **append-only** via `record_store_credit_entry()` | ✅* |
| `store_credit_ledger` | S | via parent account; **append-only** | ✅* |
| `layaways` | S | `user_has_branch_access`; **append-only** via `create_layaway()` etc. | ✅* |
| `layaway_items` | S | via parent `layaways` | ✅* |
| `layaway_payments` | S | via parent `layaways` | ✅* |
| **Milestone 10 — reporting** ||||
| `saved_reports` | I S U | `user_has_org_access` + owner check; no DELETE policy (archive) | ✅ |
| `expenses` | I S | `user_has_branch_access`; UPDATE/DELETE not offered — state changes via `decide_expense()` / `void_expense()` | ✅* |
| **Milestone 12 — notifications** ||||
| `notifications` | S U | `user_id = auth.uid()`; INSERT via `notify_*()` SECURITY DEFINER | ✅* |
| `notification_preferences` | I S U | `user_id = auth.uid()`; mandatory-category downgrade blocked by WITH CHECK | ✅ |
| **Milestone 13 — subscription & platform admin** ||||
| `subscriptions` | S | `user_has_org_access(organization_id)`; **append-only** via `apply_subscription_payment()` | ✅* |
| `subscription_payments` | S | via parent `subscriptions`; writes via `service_role`-only SECURITY DEFINER | ✅* |
| `subscription_pricing` | S | global platform catalog, `using (true)`; writes gated on `platform.override` | ✅* |
| `webhook_events` | S | `user_is_platform_admin()` only; writes via `service_role`-only functions | ✅* |
| **Milestone 15 — hardening** ||||
| `rate_limits` | — | **zero policies, zero grants** — reachable only via `consume_rate_limit()` / `rate_limit_count()` | ✅* |

## Notes on the ✅* rows

**Global catalogs** (`business_types`, `capabilities`,
`business_type_capabilities`, `permissions`, `subscription_pricing`): read by
every authenticated user by design. They carry no tenant data — they are the
shared vocabulary the app composes against. Writes (where offered) are gated
on `platform.override`.

**`roles` cross-tenant read** was finding 2 and is now scoped. Kept ✅ (not
✅*) because the fix is direct.

**Append-only tables** (`audit_logs`, `product_prices`, all inventory
movement / sales / returns / refunds / store-credit / layaway /
subscription-payment tables): SELECT policy present with correct
organization/branch scoping (directly or via `EXISTS` on a scoped parent); no
INSERT/UPDATE/DELETE policy *and* no write grant, so the only write path is
the domain's `SECURITY DEFINER` RPC. This is the immutability guarantee
Milestone 03 established, verified intact here.

**Zero-policy tables** (`login_attempts`, `rate_limits`): RLS enabled, no
policy, no table grant to any role. Default-deny plus no-grant is stricter
than any policy — the only access is the `SECURITY DEFINER` throttle /
rate-limit functions. A readable version of either would let an attacker see
which identifiers are near their limit. Both are in
`security-sweep.test.ts`'s `POLICYLESS_TABLES_ALLOWED` with this reason.

**`inventory_balances` UPDATE** is column-limited: a user with branch access
may set `low_stock_threshold` / reorder fields, but `quantity` and
`available_quantity` are only ever moved by `record_inventory_movement()`.
