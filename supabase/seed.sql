-- Local/dev seed data for Milestone 02.
--
-- Idempotent by design (`on conflict ... do nothing` on each table's natural
-- key) so `supabase db reset` can run any number of times without erroring or
-- duplicating rows — this is how migration/seed idempotency is verified in CI
-- (see .github/workflows/ci.yml, job "db-migrations").

-- =============================================================================
-- 1. Business types — the 13 initial target businesses, per docs/PRD.md §6.
-- =============================================================================
insert into public.business_types (slug, name) values
  ('supermarket', 'Supermarket'),
  ('convenience_store', 'Convenience Store'),
  ('restaurant', 'Restaurant'),
  ('pharmacy', 'Pharmacy'),
  ('clothing_fashion', 'Clothing / Fashion Store'),
  ('electronics', 'Electronics Store'),
  ('hardware_building_materials', 'Hardware / Building-Material Store'),
  ('beauty_salons_barbers', 'Beauty Salon / Barber'),
  ('hotels', 'Hotel'),
  ('bakeries', 'Bakery'),
  ('wholesalers', 'Wholesaler'),
  ('general_retail', 'General Retail'),
  ('other', 'Other')
on conflict (slug) do nothing;

-- =============================================================================
-- 2. Capabilities — the curated catalog per
--    docs/milestones/02-database-and-core-domain-foundation.md Scope.
--    NOT the larger example list in docs/TAS.md §7 (table_management,
--    kitchen_management, prescription_management are explicitly deferred to
--    later milestones per that milestone doc's Future Considerations).
-- =============================================================================
insert into public.capabilities (key, name) values
  ('products', 'Products'),
  ('inventory', 'Inventory'),
  ('batch_tracking', 'Batch Tracking'),
  ('expiry_tracking', 'Expiry Tracking'),
  ('service_charge', 'Service Charge'),
  ('layaway', 'Layaway'),
  ('store_credit', 'Store Credit')
on conflict (key) do nothing;

-- =============================================================================
-- 3. Default capability matrix per business type (business_type_capabilities).
--
--    GROUNDED in the design corpus (docs/TAS.md §8): pharmacy, restaurant.
--    INFERRED (not explicitly stated in the corpus): the other 11 rows below
--    are a reasonable best-effort baseline, confirmed with the product owner
--    to ship now rather than block this milestone. Adjusting any of these is
--    a pure data change (edit this file, `pnpm db:reset`) — no migration
--    needed, since the schema itself is generic.
-- =============================================================================
with matrix (business_type_slug, capability_key) as (
  values
    -- Supermarket — INFERRED: general goods, shared stock, no batch/expiry-heavy ops by default.
    ('supermarket', 'products'), ('supermarket', 'inventory'), ('supermarket', 'expiry_tracking'),

    -- Convenience store — INFERRED: same shape as supermarket, smaller scale.
    ('convenience_store', 'products'), ('convenience_store', 'inventory'), ('convenience_store', 'expiry_tracking'),

    -- Restaurant — GROUNDED (docs/TAS.md §8): inventory, service charges.
    ('restaurant', 'products'), ('restaurant', 'inventory'), ('restaurant', 'service_charge'),

    -- Pharmacy — GROUNDED (docs/TAS.md §8 / docs/PRD.md §26): inventory,
    -- batch tracking, expiry tracking (regulated, dated stock).
    ('pharmacy', 'products'), ('pharmacy', 'inventory'), ('pharmacy', 'batch_tracking'), ('pharmacy', 'expiry_tracking'),

    -- Clothing/fashion — INFERRED: no expiry, but layaway/store credit are common in this vertical.
    ('clothing_fashion', 'products'), ('clothing_fashion', 'inventory'), ('clothing_fashion', 'layaway'), ('clothing_fashion', 'store_credit'),

    -- Electronics — INFERRED: high-ticket items, layaway/store credit common.
    ('electronics', 'products'), ('electronics', 'inventory'), ('electronics', 'layaway'), ('electronics', 'store_credit'),

    -- Hardware/building materials — INFERRED: high-ticket, bulk purchase, layaway/credit common.
    ('hardware_building_materials', 'products'), ('hardware_building_materials', 'inventory'), ('hardware_building_materials', 'layaway'), ('hardware_building_materials', 'store_credit'),

    -- Beauty salons/barbers — INFERRED: retail products with expiry (cosmetics) plus service charges.
    ('beauty_salons_barbers', 'products'), ('beauty_salons_barbers', 'inventory'), ('beauty_salons_barbers', 'expiry_tracking'), ('beauty_salons_barbers', 'service_charge'),

    -- Hotels — INFERRED: service-charge-heavy (room/service fees), light retail inventory.
    ('hotels', 'products'), ('hotels', 'inventory'), ('hotels', 'service_charge'),

    -- Bakeries — INFERRED: perishable goods, expiry tracking matters.
    ('bakeries', 'products'), ('bakeries', 'inventory'), ('bakeries', 'expiry_tracking'),

    -- Wholesalers — INFERRED: bulk B2B, layaway/store credit common for repeat trade customers.
    ('wholesalers', 'products'), ('wholesalers', 'inventory'), ('wholesalers', 'layaway'), ('wholesalers', 'store_credit'),

    -- General retail / Other — INFERRED: conservative baseline, no assumptions beyond core POS.
    ('general_retail', 'products'), ('general_retail', 'inventory'),
    ('other', 'products'), ('other', 'inventory')
)
insert into public.business_type_capabilities (business_type_id, capability_id, default_enabled)
select bt.id, c.id, true
from matrix m
join public.business_types bt on bt.slug = m.business_type_slug
join public.capabilities c on c.key = m.capability_key
on conflict (business_type_id, capability_id) do nothing;

-- Explicitly fill every remaining (business_type, capability) pair not listed
-- above with default_enabled = false, so the table is a complete 13x7 = 91-row
-- matrix rather than relying on implicit absence (every pair is queryable and
-- testable, none are "missing" by omission).
insert into public.business_type_capabilities (business_type_id, capability_id, default_enabled)
select bt.id, c.id, false
from public.business_types bt
cross join public.capabilities c
on conflict (business_type_id, capability_id) do nothing;

-- =============================================================================
-- 4. Default role catalog (Milestone 03), per docs/PRD.md §11 / docs/TAS.md
--    §24. All `is_system_role = true` — these are platform-defined
--    templates, not user-created custom roles (custom-role creation is
--    Milestone 11's role-builder UI; the schema already supports it, it's
--    simply unreachable from the app until then — see
--    20260822094500_alter_roles_add_policies.sql).
-- =============================================================================
insert into public.roles (name, slug, description, is_system_role) values
  ('Owner', 'owner', 'Highest-level role inside a client deployment. Full access to everything within its Organization.', true),
  ('Branch Manager', 'branch_manager', 'Operates within an assigned branch: business units, staff visibility, day-to-day branch administration.', true),
  ('Cashier', 'cashier', 'Transaction-oriented role. Permissions arrive with the POS Transaction Engine (Milestone 08).', true),
  ('Salesperson', 'salesperson', 'Sales-floor role. Permissions arrive with the POS Transaction Engine (Milestone 08).', true),
  ('Pharmacist', 'pharmacist', 'Pharmacy-specialized preset. Permissions arrive with Inventory (Milestone 07) and POS (Milestone 08).', true),
  ('Waiter', 'waiter', 'Restaurant-capability role. Permissions arrive when restaurant order-taking ships.', true),
  ('Kitchen Staff', 'kitchen_staff', 'Restaurant-capability role. Permissions arrive when kitchen/order-status features ship.', true)
on conflict (slug) do nothing;

-- =============================================================================
-- 5. Permission catalog (Milestone 03), `resource.action` format per
--    docs/TAS.md §25 / docs/PRD.md §12. Scoped to only what Milestone 03–05
--    actually need (per this milestone's own Implementation Notes) — each
--    later milestone seeds its own domain's permissions (e.g. `sales.create`
--    arrives with Milestone 08) rather than pre-seeding features that don't
--    exist yet.
-- =============================================================================
insert into public.permissions (key, resource, action, description) values
  ('organizations.view', 'organizations', 'view', 'View this Organization''s own settings.'),
  ('organizations.update', 'organizations', 'update', 'Update this Organization''s own settings.'),
  ('branches.view', 'branches', 'view', 'View branches within an authorized scope.'),
  ('branches.create', 'branches', 'create', 'Create a new branch.'),
  ('branches.update', 'branches', 'update', 'Update a branch.'),
  ('branches.archive', 'branches', 'archive', 'Archive (soft-delete) a branch.'),
  ('business_units.view', 'business_units', 'view', 'View business units within an authorized scope.'),
  ('business_units.create', 'business_units', 'create', 'Create a new business unit.'),
  ('business_units.update', 'business_units', 'update', 'Update a business unit.'),
  ('business_units.archive', 'business_units', 'archive', 'Archive (soft-delete) a business unit.'),
  ('business_units.configure_pos', 'business_units', 'configure_pos', 'Configure a business unit''s POS settings (tax rate, service charge, discount policy, default payment method).'),
  ('users.view', 'users', 'view', 'View other users within a shared organization.'),
  ('users.manage', 'users', 'manage', 'Manage user profile-level details for other users.'),
  ('roles.view', 'roles', 'view', 'View role assignments within an authorized scope.'),
  ('roles.assign', 'roles', 'assign', 'Assign or revoke a role (with scope) for a user.'),
  ('audit_logs.view', 'audit_logs', 'view', 'View audit log entries within an authorized scope.')
on conflict (key) do nothing;

-- =============================================================================
-- 5b. Milestone 06 — Product Catalog & Pricing permissions. Inserted before
--     section 6's Owner cross-join so Owner picks these up automatically.
--     `products.view_cost_price` is deliberately separate from
--     `products.view` (this milestone's Security Requirements: "Cost price
--     is a sensitive field — visible only to users with an appropriate
--     permission, e.g. not exposed to a Cashier role by default").
-- =============================================================================
insert into public.permissions (key, resource, action, description) values
  ('products.view', 'products', 'view', 'View products, variants, and categories within an authorized scope.'),
  ('products.create', 'products', 'create', 'Create a new product or variant.'),
  ('products.update', 'products', 'update', 'Update a product, variant, image, or branch price override.'),
  ('products.archive', 'products', 'archive', 'Archive (soft-delete) a product or variant.'),
  ('products.view_cost_price', 'products', 'view_cost_price', 'View a product''s cost price (sensitive — hidden from most roles by default).'),
  ('categories.manage', 'categories', 'manage', 'Create, update, and archive product categories.')
on conflict (key) do nothing;

-- =============================================================================
-- 5c. Milestone 07 — Inventory & Stock Management permissions. Inserted
--     before section 6's Owner cross-join, same placement as 5b.
--     `inventory.transfer` gates both legs of a branch-to-branch transfer —
--     lib/inventory/mutations.ts's initiateStockTransfer() requires it at
--     BOTH the source and destination branch scope (this milestone's
--     single-authorization model), so holding it at only one branch is not
--     enough to move stock out of or into that branch.
-- =============================================================================
insert into public.permissions (key, resource, action, description) values
  ('inventory.view', 'inventory', 'view', 'View inventory balances, movement history, and transfers within an authorized branch.'),
  ('inventory.adjust', 'inventory', 'adjust', 'Create a manual stock adjustment (with reason) or set a low-stock threshold.'),
  ('inventory.transfer', 'inventory', 'transfer', 'Initiate a branch-to-branch stock transfer (required at both the source and destination branch).')
on conflict (key) do nothing;

-- =============================================================================
-- 5d. Milestone 08 — POS Transaction Engine permissions. Inserted before
--     section 6's Owner cross-join, same placement as 5b/5c.
--     `discount.override` is separate from `discount.apply` (any discount at
--     all requires the latter; exceeding business_unit_pos_config's
--     discount_max_percentage/discount_max_amount, or applying one at all
--     when discount_requires_authorization is set, additionally requires the
--     former). `refund.initiate`/`refund.approve` are the two-actor
--     "Cashier requests -> Manager approves" split
--     (docs/Financials_Payments_and_Internal_Auditing.md §26) — see
--     20260823120800_create_sales_functions.sql's decide_refund() comment
--     for why no extra "same person allowed" config column is needed on top
--     of this pair.
-- =============================================================================
insert into public.permissions (key, resource, action, description) values
  ('sales.view', 'sales', 'view', 'View completed sales within an authorized branch.'),
  ('sales.create', 'sales', 'create', 'Complete a sale, and hold/resume a draft cart.'),
  ('sales.cancel', 'sales', 'cancel', 'Discard a held (not yet completed) sale.'),
  ('discount.apply', 'discount', 'apply', 'Apply a discount within the configured policy limits at checkout.'),
  ('discount.override', 'discount', 'override', 'Apply a discount beyond the configured policy limits, or where authorization is required.'),
  ('returns.create', 'returns', 'create', 'Process a return against an original sale.'),
  ('refund.initiate', 'refund', 'initiate', 'Request a refund against a sale or return.'),
  ('refund.approve', 'refund', 'approve', 'Authorize a pending refund request.')
on conflict (key) do nothing;

-- =============================================================================
-- 5e. Milestone 09 — Customer, Store Credit & Layaway permissions. Inserted
--     before section 6's Owner cross-join, same placement as 5b/5c/5d.
--
--     There is deliberately no `store_credit.use` key. Spending credit is
--     not a standalone action — it happens inside create_sale()
--     (20260823130800_alter_sales_functions_add_customer_and_store_credit.sql)
--     and is already gated by `sales.create`. A separate key nothing ever
--     checks would be dead configuration, and one that *was* checked would
--     create a role that can complete sales but not accept a payment method
--     the till offers — a state no requirement in this milestone asks for.
--
--     `store_credit.issue`/`store_credit.adjust` are split for the same
--     reason `discount.apply`/`discount.override` are: issuing credit
--     against a real event (a goodwill gesture at the counter) is ordinary
--     supervisory work, whereas an `adjustment` entry can move a balance in
--     either direction with no originating transaction — the closest thing
--     in the product to minting money, so it stays with the roles that also
--     approve refunds.
-- =============================================================================
insert into public.permissions (key, resource, action, description) values
  ('customers.view', 'customers', 'view', 'View customer records, their transaction history, and their store-credit balance.'),
  ('customers.create', 'customers', 'create', 'Create a new customer record.'),
  ('customers.update', 'customers', 'update', 'Update or archive a customer record.'),
  ('store_credit.view', 'store_credit', 'view', 'View a customer''s store-credit balance and ledger history.'),
  ('store_credit.issue', 'store_credit', 'issue', 'Issue store credit to a customer.'),
  ('store_credit.adjust', 'store_credit', 'adjust', 'Post a correcting store-credit adjustment in either direction (sensitive).'),
  ('layaway.view', 'layaway', 'view', 'View layaways and their installment history within an authorized branch.'),
  ('layaway.create', 'layaway', 'create', 'Create a layaway against a customer, reserving the stock it covers.'),
  ('layaway.record_payment', 'layaway', 'record_payment', 'Record an installment payment against an active layaway.'),
  ('layaway.cancel', 'layaway', 'cancel', 'Cancel an active layaway, releasing the stock it reserved.')
on conflict (key) do nothing;

-- =============================================================================
-- 5f. Milestone 10 — Reporting, Analytics & Accounting permissions. Inserted
--     before section 6's Owner cross-join, same placement as 5b–5e.
--
--     Four `reports.*` keys rather than one, each drawing a line that a single
--     key could not:
--
--     `reports.view` vs `reports.export` — Milestone 10's Security
--     Requirements are explicit that these are "distinctly" checked, "since
--     export is a higher-risk data-exfiltration surface than on-screen
--     viewing". Reading a figure off a screen and walking out with the
--     underlying spreadsheet are different acts.
--
--     `reports.view_financials` — COGS, gross profit and expense totals all
--     expose `products.cost_price`, in aggregate rather than per-row but
--     exposed nonetheless. The catalog already treats cost as separately
--     sensitive (`products.view_cost_price`, Owner-only by default since
--     Milestone 06), so a reporting layer that handed the same information to
--     anyone with `reports.view` would quietly undo that decision.
--     docs/Reporting_Analytics_and_Custom_Reports.md §41 asks for exactly this
--     split: "a Cashier may create Sales reports but not Profit reports".
--
--     `reports.view_all_branches` — the explicit, grantable cross-branch
--     reporting capability docs/Business_Structure_Branche.md §24.42 describes.
--     Note carefully that this is an *affordance* gate, not the security
--     boundary: RLS (user_has_branch_access) already makes another branch's
--     rows invisible to a branch-scoped role, and the report functions are
--     SECURITY INVOKER so they inherit that. What this key controls is whether
--     a user whose role assignment is org-wide *defaults* into seeing every
--     branch at once, rather than being pinned to one. Granting it to a
--     branch-scoped user changes nothing they can see.
--
--     The `expense.*` set is docs/PRD.md §27's list verbatim. `expense.delete`
--     grants the *void* action (void_expense(), 20260823140200) — expenses are
--     never hard-deleted, because an approved expense already sits inside a
--     reported net-profit figure.
--
--     Deliberately NOT here: any threshold-based approval key
--     (docs/Financial_Architecture_Accounting_Reconciliation.md §28's
--     "≤ ₦50,000 → Manager, > ₦50,000 → Owner"). §28 itself says that should
--     be configuration rather than hard-coded behavior, which places it with
--     Milestone 11's administration scope. Approval here is a flat permission.
-- =============================================================================
insert into public.permissions (key, resource, action, description) values
  ('reports.view', 'reports', 'view', 'View the report catalog and run standard reports within an authorized scope.'),
  ('reports.export', 'reports', 'export', 'Download a report as CSV or Excel, or open its print view.'),
  ('reports.view_financials', 'reports', 'view_financials', 'View cost-bearing and profit reports (COGS, gross profit, net profit, expense totals) — sensitive, since aggregate cost still exposes cost price.'),
  ('reports.view_all_branches', 'reports', 'view_all_branches', 'Run a report across every branch in the organization rather than a single one.'),
  ('reports.save', 'reports', 'save', 'Create, update, and archive a saved custom-report configuration.'),
  ('expense.view', 'expense', 'view', 'View recorded business expenses within an authorized branch.'),
  ('expense.create', 'expense', 'create', 'Record a business expense.'),
  ('expense.approve', 'expense', 'approve', 'Approve or reject a pending expense.'),
  ('expense.delete', 'expense', 'delete', 'Void an expense, withdrawing it from reported profit (sensitive).')
on conflict (key) do nothing;

-- =============================================================================
-- 5g. Milestone 11 — Administration, Employees & Branding permissions.
--     Inserted before section 6's Owner cross-join, same placement as 5b–5f.
--
--     Only three new keys. `roles.view`/`roles.assign` (Milestone 03),
--     `users.view`/`users.manage` (03) and `organizations.view`/
--     `organizations.update` (03) already cover the rest of this milestone's
--     surface — the branding editor and the receipt-template editor write
--     columns on `organizations`, so `organizations.update` is exactly right
--     for both and a `branding.update` key would be catalog bloat for a
--     distinction nobody makes.
--
--     `roles.create` vs `roles.assign` — composing a new role and handing an
--     existing one out are different acts with different blast radii, and the
--     milestone's Security Requirements name them separately. Note that
--     holding `roles.create` is necessary but never sufficient: the RLS
--     policies in 20260824090800 additionally require the author to already
--     hold, org-wide, every permission they tick. That is the self-elevation
--     guard, and it lives in the policy rather than the catalog because a
--     permission key can only ever answer "may you act", not "may you act
--     *this far*".
--
--     `employees.invite` vs `employees.deactivate` — inviting adds a person
--     at a scope you already control; deactivating removes a colleague's
--     access instantly and org-wide. The second is the more dangerous half
--     and is separately grantable so a manager can staff their branch without
--     also being able to lock out the Owner.
--
--     Deliberately NO `employees.view` key: whoever may invite may see the
--     directory they are inviting into, and Milestone 03's `users.view`
--     already gates reading the people list. A third key here would split one
--     screen across two permissions for no gain.
-- =============================================================================
insert into public.permissions (key, resource, action, description) values
  ('roles.create', 'roles', 'create', 'Create and edit a custom role and the permission set it grants (never beyond the author''s own permissions).'),
  ('employees.invite', 'employees', 'invite', 'Invite an employee by email, and resend or revoke a pending invitation.'),
  ('employees.deactivate', 'employees', 'deactivate', 'Deactivate or reactivate an employee, immediately revoking access (sensitive).')
on conflict (key) do nothing;

-- =============================================================================
-- 6. Default role -> permission mapping. Owner gets the full seeded catalog;
--    Branch Manager gets a read/manage subset of branch & business-unit
--    administration; the five operational roles (Cashier, Salesperson,
--    Pharmacist, Waiter, Kitchen Staff) start with NO permissions —
--    principle of least privilege (docs/Auth_Users_Roles_Authorization.md
--    §49): none of the permissions those roles actually need
--    (`sales.create`, `inventory.adjust`, etc.) exist in the catalog yet.
-- =============================================================================
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'owner'
on conflict (role_id, permission_id) do nothing;

-- Branch Manager gets none of Milestone 11's three administration keys
-- (`roles.create`, `employees.invite`, `employees.deactivate`) by default.
-- Least privilege, and it is also what keeps the escalation tests honest:
-- tests/integration/role-builder.test.ts needs a role that genuinely lacks
-- roles.create for "a role without roles.create cannot create a role" to
-- assert anything. An Owner can still grant them through the role builder —
-- that is the whole point of roles being configuration.
with branch_manager_permissions (key) as (
  values
    ('branches.view'), ('business_units.view'), ('business_units.create'),
    ('business_units.update'), ('users.view'), ('roles.view'), ('audit_logs.view')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join branch_manager_permissions bmp on true
join public.permissions p on p.key = bmp.key
where r.slug = 'branch_manager'
on conflict (role_id, permission_id) do nothing;

-- Branch Manager gets full product/category management, but not
-- products.view_cost_price — cost price stays Owner-only by default per
-- this milestone's Security Requirements.
with branch_manager_product_permissions (key) as (
  values
    ('products.view'), ('products.create'), ('products.update'),
    ('products.archive'), ('categories.manage')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join branch_manager_product_permissions bmp on true
join public.permissions p on p.key = bmp.key
where r.slug = 'branch_manager'
on conflict (role_id, permission_id) do nothing;

-- Branch Manager gets full inventory management within whatever branch(es)
-- their own role assignment is scoped to — a transfer still needs a second
-- role assignment (or an org-wide one) at the *other* branch, per
-- inventory.transfer's own two-branch requirement above.
with branch_manager_inventory_permissions (key) as (
  values
    ('inventory.view'), ('inventory.adjust'), ('inventory.transfer')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join branch_manager_inventory_permissions bmip on true
join public.permissions p on p.key = bmip.key
where r.slug = 'branch_manager'
on conflict (role_id, permission_id) do nothing;

-- Branch Manager gets the full M08 permission set within their assigned
-- branch(es), same "full authority within its own domain" shape as their
-- product/inventory grants above — everything a Cashier can do, plus the
-- two elevated actions (discount.override, refund.approve) that make them
-- the "Manager" side of docs/Financials_Payments_and_Internal_Auditing.md
-- §26's "Cashier requests -> Manager approves" flow.
with branch_manager_sales_permissions (key) as (
  values
    ('sales.view'), ('sales.create'), ('sales.cancel'),
    ('discount.apply'), ('discount.override'),
    ('returns.create'), ('refund.initiate'), ('refund.approve')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join branch_manager_sales_permissions bmsp on true
join public.permissions p on p.key = bmsp.key
where r.slug = 'branch_manager'
on conflict (role_id, permission_id) do nothing;

-- Branch Manager gets the full M09 customer/store-credit/layaway set,
-- including the two elevated actions (store_credit.adjust, layaway.cancel)
-- that the till roles below deliberately lack — the same "Manager is the
-- second actor" shape as discount.override/refund.approve above.
with branch_manager_customer_permissions (key) as (
  values
    ('customers.view'), ('customers.create'), ('customers.update'),
    ('store_credit.view'), ('store_credit.issue'), ('store_credit.adjust'),
    ('layaway.view'), ('layaway.create'), ('layaway.record_payment'), ('layaway.cancel')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join branch_manager_customer_permissions bmcp on true
join public.permissions p on p.key = bmcp.key
where r.slug = 'branch_manager'
on conflict (role_id, permission_id) do nothing;

-- Cashier, Salesperson, and Pharmacist are the operational till roles this
-- milestone's own role descriptions name explicitly ("Permissions arrive
-- with the POS Transaction Engine (Milestone 08)") — the base till set,
-- deliberately excluding discount.override/refund.approve (least privilege;
-- those stay Branch Manager/Owner-only per the two-actor refund flow above).
with pos_operator_permissions (key) as (
  values
    ('sales.view'), ('sales.create'), ('sales.cancel'),
    ('discount.apply'), ('returns.create'), ('refund.initiate')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join pos_operator_permissions pop on true
join public.permissions p on p.key = pop.key
where r.slug in ('cashier', 'salesperson', 'pharmacist')
on conflict (role_id, permission_id) do nothing;

-- The same three till roles get the customer-facing half of Milestone 09: a
-- cashier must be able to find or quick-add a customer at checkout, see the
-- balance they're spending, and take a layaway installment across the
-- counter. They do not get store_credit.issue/adjust or layaway.cancel —
-- the three actions that create balance or release reserved stock without a
-- customer-initiated transaction behind them (least privilege,
-- docs/Auth_Users_Roles_Authorization.md §49).
with pos_operator_customer_permissions (key) as (
  values
    ('customers.view'), ('customers.create'),
    ('store_credit.view'),
    ('layaway.view'), ('layaway.create'), ('layaway.record_payment')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join pos_operator_customer_permissions popc on true
join public.permissions p on p.key = popc.key
where r.slug in ('cashier', 'salesperson', 'pharmacist')
on conflict (role_id, permission_id) do nothing;

-- Branch Manager gets the reporting and expense set for their own branch(es) —
-- the same "full authority within its own domain" shape as their product,
-- inventory, sales and customer grants above, including reports.view_financials
-- because a manager who cannot see their branch's gross profit cannot manage it.
--
-- Two deliberate exclusions:
--
--   * `reports.view_all_branches` — withholding this from Branch Manager is
--     the entire reason the key exists. Milestone 10's Security Requirements
--     say a Branch Manager "cannot see another branch's financial reports
--     unless explicitly granted cross-branch reporting permission", and
--     docs/Business_Structure_Branche.md §24.42 lists cross-branch reporting as
--     an explicit grantable capability rather than a role default. An
--     organization that wants a multi-branch manager grants it deliberately.
--
--   * `expense.delete` — voiding an approved expense moves reported profit
--     with no originating business event behind it, which is the same
--     "closest thing to minting money" reasoning that keeps
--     `store_credit.adjust` and `refund.approve` at the elevated tier. It
--     stays Owner-only by default.
with branch_manager_report_permissions (key) as (
  values
    ('reports.view'), ('reports.export'), ('reports.view_financials'), ('reports.save'),
    ('expense.view'), ('expense.create'), ('expense.approve')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join branch_manager_report_permissions bmrp on true
join public.permissions p on p.key = bmrp.key
where r.slug = 'branch_manager'
on conflict (role_id, permission_id) do nothing;

-- The three till roles get `reports.view` and nothing else from this
-- milestone. This grants no new *data* access: they can already read their own
-- branch's sales through sales_select, and the report functions are SECURITY
-- INVOKER, so a Cashier running a sales report sees exactly the rows they could
-- already have queried — just added up. What it enables is
-- docs/Reporting_Analytics_and_Custom_Reports.md §20's till-level view of their
-- own day.
--
-- Each of the four things they do not get is withheld for its own reason:
--   * reports.export — the exfiltration surface; a till role has no business
--     need to walk out with a spreadsheet.
--   * reports.view_financials — cost price, per §41's "a Cashier may create
--     Sales reports but not Profit reports".
--   * reports.save — saved configurations are a management artifact.
--   * every expense.* key — docs/PRD.md §27, verbatim: "A cashier should not
--     automatically have the ability to create a ₦500,000 expense."
--
-- Waiter and Kitchen Staff are unchanged: they hold no permissions at all, and
-- nothing in this milestone gives them a reason to.
with pos_operator_report_permissions (key) as (
  values
    ('reports.view')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join pos_operator_report_permissions porp on true
join public.permissions p on p.key = porp.key
where r.slug in ('cashier', 'salesperson', 'pharmacist')
on conflict (role_id, permission_id) do nothing;
