# Stage 16 — Supabase RLS & Database Authorization Design

This stage defines **how authorization is actually enforced inside Supabase/PostgreSQL**.

The most important principle for this POS is:

> **RBAC decides what a user can do; organizational scope decides where they can do it; Supabase RLS enforces both.**

So we should not rely on frontend route guards or backend checks alone.

---

# 16.1 The Authorization Model

Every protected operation should conceptually evaluate:

```text
User
 │
 ├── Is authenticated?
 │
 ├── Is account active?
 │
 ├── Is subscription active?
 │
 ├── What business does the user belong to?
 │
 ├── What roles does the user have?
 │
 ├── What permissions do those roles provide?
 │
 └── What branches/business units can those roles access?
```

Then:

```text
                REQUEST
                   │
                   ↓
             AUTHENTICATED?
                   │
                   ↓
          SUBSCRIPTION VALID?
                   │
                   ↓
             USER ACTIVE?
                   │
                   ↓
             PERMISSION?
                   │
                   ↓
               SCOPE?
                   │
                   ↓
                 RLS
                   │
                   ↓
               DATABASE
```

---

# 16.2 RLS Must Be Enabled

For business data, RLS should be considered mandatory.

Examples:

```text
businesses
branches
business_units
products
product_variants
product_prices
inventory
inventory_movements
customers
sales
sale_items
payments
refunds
layaways
store_credit
roles
permissions
notifications
audit_logs
subscriptions
```

should have appropriate RLS policies.

---

# 16.3 The Golden Rule

A user should **never** be able to access data merely because they know its UUID.

For example:

```text
GET product?id=BRANCH-B-PRODUCT
```

must not expose the product if the user is only authorized for Branch A.

---

# 16.4 Super Admin

Your decision:

> Super Admin gets untethered access.

Therefore Super Admin is an exception to normal business scoping.

Conceptually:

```text
is_super_admin(user)
        ↓
       TRUE
        ↓
bypass business-level restrictions
```

But this should still be implemented deliberately rather than simply disabling RLS for the Super Admin.

---

# 16.5 Why We Should Not Disable RLS

A tempting implementation would be:

```text
if super_admin:
    bypass everything
```

at the application layer.

That is dangerous.

A bug in the application could accidentally expose unrestricted access to another user.

RLS should remain active.

The Super Admin should be granted access through carefully controlled database policies/security functions.

---

# 16.6 Security Functions

We should centralize common authorization checks in PostgreSQL functions.

For example:

```text
is_super_admin()
```

```text
user_has_permission(permission)
```

```text
user_has_branch_access(branch_id)
```

```text
user_has_business_unit_access(unit_id)
```

This prevents dozens of policies from duplicating complex authorization logic.

---

# 16.7 Business Context

A normal user should resolve to one business.

Conceptually:

```text
auth.users
     │
     ↓
profiles
     │
     ↓
business_id
```

So when a user queries:

```text
products
```

the database can determine which business they belong to.

---

# 16.8 Branch Access

We need explicit branch assignments.

For example:

```text
user_branch_access
```

could contain:

```text
user_id
branch_id
```

This is useful for:

* Branch Managers
* Cashiers
* Salespersons
* Custom roles

---

# 16.9 Business Unit Access

Because your architecture has business units, we also need:

```text
user_business_unit_access
```

Example:

```text
John
 ↓
Abuja Branch
 ↓
Supermarket Unit
```

John should not automatically access:

```text
Abuja Branch
 ↓
Pharmacy Unit
```

unless his role/scope allows it.

---

# 16.10 Scope Types

A role assignment can have a scope.

Conceptually:

```text
GLOBAL
BUSINESS
BRANCH
BUSINESS_UNIT
```

Example:

```text
Owner
→ BUSINESS

Branch Manager
→ BRANCH

Cashier
→ BUSINESS_UNIT
```

This gives the authorization system flexibility.

---

# 16.11 Owner

The Owner has business-wide access.

```text
Owner
 ↓
Business
 ├── Branch A
 ├── Branch B
 └── Branch C
```

The Owner should therefore be able to access all branches belonging to that business.

---

# 16.12 Branch Manager

A Branch Manager should generally operate within:

```text
Branch X
```

They can access:

```text
Branch X
 ├── Business Unit A
 ├── Business Unit B
 └── Business Unit C
```

but not another branch unless explicitly assigned.

---

# 16.13 Cashier

A Cashier should normally have highly restricted operational access.

Example:

```text
Cashier
 ├── Create sales
 ├── View relevant products
 ├── View customers
 ├── Create customers
 └── Process permitted payments
```

But not:

```text
Modify roles
Change business settings
Delete products
Change branch pricing
View sensitive reports
```

unless explicitly granted.

---

# 16.14 Salesperson

A Salesperson can have:

```text
sales.view
sales.create
customers.view
customers.create
products.view
```

but potentially no:

```text
sales.refund
inventory.adjust
products.delete
employees.manage
```

---

# 16.15 Pharmacist

The Pharmacist role exists even though you removed prescription-management functionality.

That means the role can simply receive permissions relevant to pharmacy operations, such as:

```text
sales.create
products.view
inventory.view
customers.view
```

The system should not force pharmacy-specific workflows that you explicitly excluded.

---

# 16.16 Waiter / Kitchen Staff

Similarly, these roles become useful when restaurant capabilities are enabled.

For example:

```text
Waiter
 ↓
restaurant_orders.create
restaurant_orders.view
```

while:

```text
Kitchen Staff
 ↓
kitchen_orders.view
kitchen_orders.update_status
```

Their permissions should be capability-dependent.

---

# 16.17 Custom Roles

Custom roles should use exactly the same permission engine.

Example:

```text
Senior Cashier
 ├── sales.create
 ├── sales.view
 ├── customers.create
 ├── customers.view
 └── discounts.apply
```

There should be no special authorization implementation for custom roles.

---

# 16.18 Permission Evaluation

A useful conceptual function:

```text
has_permission(
    user_id,
    permission,
    resource_scope
)
```

For example:

```text
has_permission(
    user,
    "sales.refund",
    branch_A
)
```

returns:

```text
TRUE
```

or:

```text
FALSE
```

---

# 16.19 Permission ≠ Scope

This distinction is critical.

Suppose a user has:

```text
inventory.adjust
```

That doesn't mean:

> They can adjust every inventory record.

It means:

> They may adjust inventory **within their authorized scope**.

Therefore:

```text
Permission
+
Scope
=
Authorization
```

---

# 16.20 Product RLS

For products, the policy should ensure that a user can only access products belonging to an authorized business unit.

Conceptually:

```text
product.business_unit_id
        ↓
authorized business unit?
        ↓
YES → allow
NO  → deny
```

---

# 16.21 Product Creation

Product creation is restricted to:

* Super Admin
* Owner/Admin
* Branch Manager
* Custom role with permission

The creator must also have access to the target Business Unit.

A Branch Manager cannot create a product in another branch.

---

# 16.22 Product Deletion

Deletion requires:

```text
products.delete
```

But because products can be referenced by transactions, we should **not physically delete products that have historical transactions**.

Instead:

```text
status = ARCHIVED
```

or:

```text
deleted_at = timestamp
```

---

# 16.23 Inventory RLS

Inventory access should follow:

```text
Inventory
 ↓
Business Unit
 ↓
Branch
 ↓
Business
```

A user can only access inventory if they have appropriate authorization at the relevant level.

---

# 16.24 Inventory Adjustments

Inventory adjustment requires:

```text
inventory.adjust
```

and the target inventory must be within the user's scope.

The adjustment itself should create:

```text
inventory_movement
```

rather than directly modifying history.

---

# 16.25 Stock Transfers

A transfer involves **two scopes**:

```text
SOURCE
   ↓
DESTINATION
```

Therefore authorization must validate both.

Example:

```text
Cashier Branch A
     ↓
Transfer to Branch B
```

should fail if the cashier isn't authorized for Branch B.

---

# 16.26 Stock Transfer Workflow

Simple workflow:

```text
DRAFT
 ↓
PENDING
 ↓
COMPLETED
```

Potentially:

```text
CANCELLED
```

No complex procurement workflow is required.

---

# 16.27 Sales RLS

Sales should be scoped to:

```text
business
branch
business_unit
```

A cashier should only be able to see the sales they're permitted to see.

For example, depending on the configured permission:

```text
Cashier:
Today's unit sales

Branch Manager:
Branch sales

Owner:
Entire business sales

Super Admin:
Entire deployment
```

---

# 16.28 Sale Creation

Creating a sale requires:

```text
sales.create
```

But importantly:

> The user cannot choose an arbitrary business/branch/unit in the request.

The server/database must validate that the selected POS context belongs to the user's authorized scope.

---

# 16.29 Refund RLS

Refunds require:

```text
sales.refund
```

and:

```text
refund authorization
```

The user must also have access to the original transaction.

---

# 16.30 Refund Authorization

We can represent the approval separately:

```text
refunds
 ├── requested_by
 ├── approved_by
 ├── approved_at
 └── status
```

Example:

```text
REQUESTED
    ↓
APPROVED
    ↓
COMPLETED
```

or:

```text
REQUESTED
    ↓
REJECTED
```

---

# 16.31 Payments

Payments should be accessible based on the corresponding sale.

A user who cannot access a sale should not be able to query its payment record independently.

This is another reason relational RLS policies are important.

---

# 16.32 Customer RLS

Customers belong to a business.

Therefore:

```text
Customer
 ↓
Business
```

The default rule should be:

> Users can only access customers belonging to their business and within their operational scope where applicable.

---

# 16.33 Customer Privacy

Not every employee necessarily needs access to every customer field.

For example, sensitive customer information could eventually be protected separately.

We don't need to over-engineer this in the MVP, but the schema should not make future field-level restrictions impossible.

---

# 16.34 Store Credit

Store credit is particularly sensitive.

A cashier might be allowed to:

```text
store_credit.view
store_credit.use
```

but not:

```text
store_credit.adjust
store_credit.issue
```

unless explicitly authorized.

---

# 16.35 Layaway

Layaway records must be tied to:

```text
customer
business
branch
business_unit
```

and users must have permission to:

```text
layaway.create
layaway.view
layaway.collect_payment
layaway.cancel
```

depending on the role.

---

# 16.36 Reports

Reports should respect the same scope rules.

This is a common security mistake.

For example:

> A Branch Manager requests a "sales report".

The report query must not simply aggregate the entire `sales` table.

It must first apply the user's scope.

```text
Sales
 ↓
RLS / authorization
 ↓
Allowed rows
 ↓
Aggregation
 ↓
Report
```

---

# 16.37 Custom Reports

This is especially important because you selected custom reports.

The report builder should **never** allow arbitrary SQL.

Instead:

```text
User
 ↓
Select dataset
 ↓
Select fields
 ↓
Select filters
 ↓
Select grouping
 ↓
Validated query builder
 ↓
Authorized dataset
 ↓
Results
```

The available datasets should themselves be permission-controlled.

---

# 16.38 Audit Log RLS

Normal users should generally be able to see only audit records they're authorized to view.

For example:

```text
Cashier
→ Limited operational audit information

Branch Manager
→ Branch audit

Owner
→ Business audit

Super Admin
→ Entire deployment
```

Audit logs should not become an information-leak mechanism.

---

# 16.39 Audit Log Immutability

Application users should never have:

```text
audit_logs.update
audit_logs.delete
```

permissions.

Even Owner should not be able to silently erase audit history.

---

# 16.40 Notifications

Notifications should be scoped to the intended recipient.

A user should never be able to query:

```text
notifications
```

and receive another employee's notifications.

Conceptually:

```text
notification.user_id = auth.uid()
```

---

# 16.41 Subscription RLS

Business Owners should be able to see their subscription.

They should not be able to:

* change subscription price
* modify expiration date
* mark payment successful
* extend subscription manually

Those are Super Admin/system responsibilities.

---

# 16.42 Subscription Lock

There is an important distinction:

### Authentication

Can the user authenticate?

### Application authorization

Can the user use the application?

You specified that expiration should completely lock the application.

Therefore the application should enforce:

```text
subscription expired
        ↓
normal business user
        ↓
LOCKED
```

The Super Admin remains unrestricted.

---

# 16.43 Subscription Expiration

The frontend should not be the only place checking this.

If the application says:

```text
expired = false
```

because of a stale frontend state, the server must still reject access.

Subscription state therefore needs server/database enforcement.

---

# 16.44 Storage RLS

Branding files should follow business ownership.

Example:

```text
business/{business_id}/branding/*
```

A user must have authorization for that business before they can upload/delete branding assets.

---

# 16.45 Storage File Types

Branding uploads should be restricted to expected formats:

```text
PNG
JPEG
WEBP
SVG
```

SVG requires additional sanitization considerations because it can contain active content.

For the safest MVP approach, we can initially support:

```text
PNG
JPEG
WEBP
```

and add SVG later if needed.

---

# 16.46 API Layer vs RLS

We should use both.

### Application/API authorization

Provides:

* business logic
* user-friendly errors
* workflow validation
* permission checks

### RLS

Provides:

* database-level isolation
* defense against application mistakes
* protection against direct database access

So:

```text
API Authorization
+
RLS
```

is the target.

---

# 16.47 Service Role

The service-role key should only be used for operations that genuinely require elevated server-side privileges.

Examples could include certain:

* system jobs
* subscription webhook processing
* administrative operations

It must never be sent to the browser.

---

# 16.48 Webhooks

Paystack webhooks are an important special case.

The webhook:

```text
Paystack
 ↓
Server endpoint
 ↓
Verify webhook authenticity
 ↓
Verify transaction
 ↓
Update subscription
```

must not simply trust:

```text
status = successful
```

from an unverified request.

---

# 16.49 Webhook Idempotency

Paystack could potentially send the same webhook more than once.

Therefore:

```text
Paystack reference
```

should be uniquely constrained.

Processing:

```text
Webhook A → create payment
Webhook A again → detect existing reference → no duplicate
```

---

# 16.50 RLS Architecture

The final conceptual model:

```text
                         ┌──────────────┐
                         │ Supabase Auth│
                         └──────┬───────┘
                                │
                                ↓
                           auth.uid()
                                │
                                ↓
                         User Profile
                                │
                ┌───────────────┼───────────────┐
                ↓               ↓               ↓
             Roles        Permissions        Scope
                │               │               │
                └───────────────┼───────────────┘
                                ↓
                           RLS Policies
                                │
                                ↓
                           PostgreSQL
```

---

# 16.51 The Security Boundary

The most important boundary in the entire application becomes:

```text
                         SUPER ADMIN
                              │
                    ┌─────────┴─────────┐
                    │                   │
               Business A          Business B
                    │
              ┌─────┴─────┐
              ↓           ↓
           Branch A    Branch B
              │
        ┌─────┴─────┐
        ↓           ↓
   Supermarket   Pharmacy
```

A user belonging to:

```text
Business A → Branch A → Supermarket
```

must never be able to cross into:

```text
Business B
```

or:

```text
Branch B
```

unless their authorization explicitly permits it.

---

# 16.52 RLS Testing

Before production, we should test policies using representative users:

```text
Super Admin
Owner
Branch Manager
Cashier
Salesperson
Pharmacist
Waiter
Kitchen Staff
Custom Role
Suspended User
Expired Subscription User
```

And test both:

### Allowed operations

and:

### Deliberately malicious operations

For example:

```text
Cashier attempts to:
❌ change price
❌ access another branch
❌ refund without authorization
❌ change role
❌ read another employee's notifications
❌ modify audit logs
```

All should fail at the appropriate layer.

---

# 16.53 Security Decision

The authorization architecture is therefore:

> **Supabase Auth + granular RBAC + scoped role assignments + PostgreSQL RLS + server-side validation + immutable transactions + audit logging.**

This is considerably stronger than relying on frontend permissions.

---