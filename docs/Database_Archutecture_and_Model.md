# Stage 15 — Database Architecture & Data Model

We now translate the decisions from the PRD into the **actual PostgreSQL/Supabase data architecture**.

The central architectural decision is:

> **The database should model the POS as a configurable business platform, not as separate POS systems for supermarkets, restaurants, pharmacies, etc.**

The business type determines which capabilities/configurations are enabled; it should **not fundamentally change the database schema**.

---

# 15.1 Core Hierarchy

The hierarchy we established should be:

```text
Organization / Business
        │
        ├── Branch
        │     │
        │     ├── Business Unit
        │     │
        │     └── Business Unit
        │
        └── Branch
              │
              └── Business Unit
```

Example:

```text
ABC Retail Ltd
│
├── Abuja Branch
│   ├── Supermarket
│   └── Pharmacy
│
└── Lagos Branch
    └── Supermarket
```

This is important because a **Business Unit is not simply another branch**.

A branch represents a physical/location-level operation.

A Business Unit represents the particular operation within that location.

---

# 15.2 Organization / Business

Primary table:

```text
businesses
```

Core fields:

```text
id
name
brand_name
business_type_id
status
logo_url
primary_color
secondary_color
currency
timezone
created_at
updated_at
```

The business is the primary ownership boundary.

Almost every important record ultimately belongs to a business.

---

# 15.3 Business Types

We should **not** create completely separate schemas for:

```text
supermarket
restaurant
pharmacy
hotel
...
```

Instead:

```text
business_types
```

could contain:

```text
SUPERMARKET
CONVENIENCE_STORE
RESTAURANT
PHARMACY
FASHION
ELECTRONICS
HARDWARE
BEAUTY
HOTEL
BAKERY
WHOLESALER
GENERAL_RETAIL
OTHER
```

But there is an important distinction.

## Business Type ≠ Feature Set

A business type is essentially:

> **A classification used to determine an appropriate starting configuration.**

For example:

```text
Business Type:
Restaurant
```

could automatically enable restaurant-related capabilities.

The business can subsequently configure those capabilities.

---

# 15.4 Capability System

This is one of the most important parts of the architecture.

We should have something conceptually like:

```text
capabilities
```

Examples:

```text
POS
INVENTORY
CUSTOMERS
LAYAWAY
STORE_CREDIT
RESTAURANT_ORDERS
KITCHEN
PHARMACY
SERVICE_CHARGE
LOYALTY
REPORTING
ANALYTICS
```

Then:

```text
business_capabilities
```

determines what a particular business has enabled.

Therefore:

```text
Restaurant
      ↓
Default capabilities
      ↓
Business configuration
      ↓
Enabled features
```

This gives us the **dynamic platform** you wanted.

---

# 15.5 Why This Is Better

Instead of doing:

```text
if businessType === "restaurant"
```

throughout the codebase, we can do:

```text
if capabilityEnabled("restaurant_orders")
```

This is much more scalable.

A supermarket could theoretically enable a capability normally associated with restaurants without changing the underlying architecture.

---

# 15.6 Branches

Table:

```text
branches
```

Fields:

```text
id
business_id
name
code
address
phone
status
created_at
updated_at
```

Relationship:

```text
business 1 ──── * branches
```

---

# 15.7 Business Units

Table:

```text
business_units
```

Fields:

```text
id
branch_id
name
code
type
status
created_at
updated_at
```

Example:

```text
Abuja Branch
│
├── Supermarket
└── Pharmacy
```

---

# 15.8 Business Unit Inventory

You previously selected the model where the business unit can have its own inventory.

Therefore inventory ownership should ultimately resolve to:

```text
business_unit_id
```

rather than merely:

```text
business_id
```

This gives us the necessary isolation.

---

# 15.9 Products

Table:

```text
products
```

A product should belong to **one Business Unit**, consistent with your correction to Q23.

Core fields:

```text
id
business_unit_id
category_id
name
description
sku
barcode
brand
product_type
status
created_at
updated_at
```

Important:

> A product cannot simultaneously belong to multiple Business Units.

---

# 15.10 Product Variants

Table:

```text
product_variants
```

Example:

```text
T-Shirt
│
├── Small / Black
├── Medium / Black
├── Large / Black
├── Small / White
└── ...
```

Fields could include:

```text
id
product_id
name
sku
barcode
attributes
price
cost_price
status
```

The exact pricing model will be handled separately because you selected **branch-level pricing**.

---

# 15.11 Categories

```text
categories
```

Categories are business-configurable.

Example:

```text
Food
Beverages
Electronics
Clothing
Medication
Building Materials
```

The system should not hard-code these.

---

# 15.12 Branch-Level Pricing

Because pricing is configurable at the branch level, we should avoid storing the operational selling price only inside `products`.

Instead, introduce something like:

```text
product_prices
```

Conceptually:

```text
product
   │
   ├── Branch A → ₦5,000
   ├── Branch B → ₦5,500
   └── Branch C → ₦4,800
```

This preserves the product identity while allowing location-specific pricing.

---

# 15.13 Inventory

A core inventory table:

```text
inventory
```

Potential structure:

```text
id
business_unit_id
product_id
quantity
reserved_quantity
reorder_level
updated_at
```

Available stock can be derived as:

```text
available_quantity =
quantity - reserved_quantity
```

Whether reservation is needed for every business type will depend on the final workflows.

---

# 15.14 Inventory Movements

We should **not rely only on the current inventory quantity**.

We need:

```text
inventory_movements
```

Examples:

```text
SALE
RETURN
ADJUSTMENT
TRANSFER_OUT
TRANSFER_IN
```

This creates an inventory history.

Example:

```text
Opening stock       +100
Sale                  -5
Sale                  -3
Return                +1
Adjustment             -2
-------------------------
Current stock          91
```

---

# 15.15 Stock Transfers

You changed the original decision and selected:

> **YES — but keep it simple.**

Therefore we need two tables:

```text
stock_transfers
stock_transfer_items
```

Simple workflow:

```text
Branch A / Unit A
        │
        ↓
Create transfer
        │
        ↓
Approve/complete
        │
        ↓
Branch B / Unit B
```

The transfer should produce inventory movements on both sides.

---

# 15.16 Transfer Atomicity

A completed transfer should be atomic.

We must avoid:

```text
Source:
-10

Destination:
failed
```

leaving inventory inconsistent.

The database transaction should perform the movement as one logical operation.

---

# 15.17 Customers

Table:

```text
customers
```

Fields:

```text
id
business_id
name
phone
email
address
status
created_at
updated_at
```

Customers belong to the business rather than individual cashiers.

This allows:

```text
Customer
   ↓
Branch A sale
   ↓
Branch B sale
```

while maintaining a unified customer record.

---

# 15.18 Store Credit

Because store credit is tied to an established customer, it should not simply be:

```text
customers.store_credit = 50000
```

Instead, use a ledger.

```text
store_credit_accounts
store_credit_transactions
```

Example:

```text
Credit issued       +₦20,000
Used                 -₦5,000
Refund                +₦3,000
-----------------------------
Balance              ₦18,000
```

This is much safer and auditable.

---

# 15.19 Sales

Core table:

```text
sales
```

Possible fields:

```text
id
business_id
branch_id
business_unit_id
customer_id
cashier_id
subtotal
discount_amount
tax_amount
service_charge_amount
total
status
transaction_number
created_at
completed_at
```

A completed sale becomes immutable.

---

# 15.20 Sale Items

```text
sale_items
```

Fields:

```text
id
sale_id
product_id
product_variant_id
quantity
unit_price
discount_amount
tax_amount
total
```

The **unit price used at the time of sale must be stored here**.

We must never calculate historical sales using today's product price.

---

# 15.21 Payments

```text
payments
```

A sale can have one payment according to your current rules, with payment methods such as:

```text
CASH
CARD
BANK_TRANSFER
STORE_CREDIT
```

Split and partial POS payments are not supported.

Layaway/installment payments are handled separately.

---

# 15.22 Returns & Refunds

We should model refunds separately rather than modifying sales.

```text
refunds
refund_items
```

Relationship:

```text
Sale
 ↓
Refund
 ↓
Refund Items
```

This preserves the original transaction.

---

# 15.23 Layaway

Layaway requires:

```text
layaways
layaway_items
layaway_payments
```

The layaway records:

* customer
* original amount
* outstanding balance
* payment history
* installment payments
* status

Example:

```text
Total:       ₦200,000
Paid:        ₦80,000
Outstanding: ₦120,000
```

---

# 15.24 Discounts

Discounts need to be represented explicitly.

Potential structure:

```text
discounts
```

with:

```text
type
value
scope
status
```

And the actual discount applied to a transaction should be recorded in the sale.

This is important because a discount configuration could later change.

---

# 15.25 Taxes

Because you selected:

> Tax/service charge configured by the business.

We should use configuration tables rather than hard-coded values.

For example:

```text
taxes
```

and:

```text
service_charges
```

A transaction should still store the actual amount applied.

---

# 15.26 Service Charge

Service charge should be globally available as a capability.

The business can enable/disable it.

The configuration can specify:

```text
percentage
```

or:

```text
fixed
```

depending on the final configuration decision.

---

# 15.27 Employees / Users

Supabase Auth handles authentication.

Our application database should contain:

```text
profiles
```

with business-specific information.

Example:

```text
profiles
id
auth_user_id
business_id
name
phone
status
```

---

# 15.28 Roles

```text
roles
```

Examples:

```text
OWNER
BRANCH_MANAGER
CASHIER
SALESPERSON
PHARMACIST
WAITER
KITCHEN_STAFF
CUSTOM
```

---

# 15.29 Permissions

```text
permissions
```

Example:

```text
sales.create
sales.refund
products.create
products.update
inventory.adjust
inventory.transfer
reports.view
employees.manage
settings.manage
```

---

# 15.30 Role Permissions

Many-to-many relationship:

```text
roles
  │
  └── role_permissions
             │
             └── permissions
```

---

# 15.31 User Roles

Because a user may eventually need multiple roles, use a join table:

```text
user_roles
```

rather than storing:

```text
profile.role
```

This keeps the authorization architecture flexible.

---

# 15.32 Scope Assignments

We also need to represent where a role applies.

For example:

```text
user
 ↓
role
 ↓
branch
```

or:

```text
user
 ↓
role
 ↓
business unit
```

This allows:

> John = Cashier at Abuja Supermarket

without making John a cashier across the entire business.

---

# 15.33 Audit Logs

```text
audit_logs
```

This should be treated as an append-oriented security record.

Important fields:

```text
id
business_id
actor_user_id
action
entity_type
entity_id
before_data
after_data
metadata
created_at
```

---

# 15.34 Notifications

```text
notifications
```

Channels:

```text
IN_APP
EMAIL
```

Examples:

```text
Subscription expiring
Cash variance
Suspicious transaction
New employee
```

Your excluded notification types remain excluded.

---

# 15.35 Subscription

Because every client has an independent deployment, subscription belongs to the deployment/business.

Core structure:

```text
subscriptions
```

Fields:

```text
id
business_id
plan_id
status
starts_at
expires_at
created_at
updated_at
```

---

# 15.36 Subscription Plans

Although you currently have:

> One price for all features.

We should still create:

```text
subscription_plans
```

because the Super Admin needs to manage pricing.

For example:

```text
MONTHLY
QUARTERLY
SEMI_ANNUAL
ANNUAL
```

The price can be changed by Super Admin without changing application code.

---

# 15.37 Subscription Payments

```text
subscription_payments
```

This stores:

```text
business_id
subscription_id
paystack_reference
amount
duration
status
paid_at
```

Paystack is used **only here**.

---

# 15.38 Branding

Business branding can be represented directly in the business configuration or separated into:

```text
business_branding
```

with:

```text
brand_name
logo_url
primary_color
secondary_color
```

I recommend the separate configuration table because branding will eventually be one part of a broader configuration system.

---

# 15.39 Business Configuration

We should have a configuration layer.

Conceptually:

```text
business_settings
```

This can hold configurable operational values such as:

```text
default_payment_method
tax_enabled
service_charge_enabled
receipt_template
default_currency
```

However, we should **avoid putting everything into one giant JSON blob**.

Critical relational data belongs in proper tables.

---

# 15.40 Soft Deletion

You selected the recommendation for deletion.

Therefore:

> Important business records should generally be soft-deleted rather than physically deleted.

Example:

```text
deleted_at
deleted_by
```

But this does **not** apply to immutable transactional records.

---

# 15.41 Transactional Records

Sales, payments, refunds and financial records should never be deleted through normal application functionality.

Instead:

```text
ACTIVE
VOIDED
REFUNDED
REVERSED
```

depending on the entity.

The original record remains.

---

# 15.42 Database Relationships

At a high level:

```text
BUSINESS
│
├── BRANCHES
│     │
│     └── BUSINESS UNITS
│             │
│             ├── PRODUCTS
│             │      ├── VARIANTS
│             │      └── PRICES
│             │
│             └── INVENTORY
│
├── USERS
│     ├── ROLES
│     └── PERMISSIONS
│
├── CUSTOMERS
│
├── SALES
│     ├── SALE ITEMS
│     ├── PAYMENTS
│     └── REFUNDS
│
├── LAYAWAYS
│
├── STORE CREDIT
│
├── AUDIT LOGS
│
├── NOTIFICATIONS
│
└── SUBSCRIPTION
```

---

# 15.43 Database Integrity Principles

The PostgreSQL database should enforce:

### Referential integrity

Foreign keys.

### Uniqueness

Unique SKU/barcode/transaction references where appropriate.

### Valid values

CHECK constraints.

### Atomic operations

PostgreSQL transactions.

### Concurrency

Locks/versioning where necessary.

### Immutable history

No UPDATE/DELETE paths for completed financial transactions.

---

# 15.44 Indexing Strategy

Indexes will be particularly important for POS speed.

Likely indexes include:

```text
products.barcode
products.sku
products.business_unit_id

inventory.product_id
inventory.business_unit_id

sales.transaction_number
sales.branch_id
sales.business_unit_id
sales.created_at

customers.phone
customers.business_id

audit_logs.actor_user_id
audit_logs.created_at
```

Composite indexes will be used where queries commonly filter by multiple fields.

---

# 15.45 One Critical Decision: IDs

I recommend:

```text
UUID
```

for internal primary keys.

Then use human-readable identifiers where necessary:

```text
SALE-000001
INV-000001
TRF-000001
```

This gives us:

* safer external identifiers
* distributed-generation capability
* less predictable IDs
* easier independent deployments

---

# 15.46 Database Architecture Principle

The final architecture should therefore look like:

```text
                PostgreSQL
                    │
       ┌────────────┴────────────┐
       │                         │
   Configuration             Transactions
       │                         │
       ├─ Business Types         ├─ Sales
       ├─ Capabilities           ├─ Payments
       ├─ Business Settings      ├─ Refunds
       ├─ Roles                  ├─ Layaway
       └─ Permissions            └─ Inventory
       
                    │
                    ↓
                 RLS
                    │
                    ↓
             Authorization
```

---

# Stage 15 Status

### Locked decisions

* PostgreSQL via Supabase
* Organization → Branch → Business Unit hierarchy
* Multiple branches
* Multiple business units within branches
* Business-unit inventory
* Product belongs to **one** Business Unit
* Branch-level pricing
* Simple stock transfers
* Dynamic business types
* Capability/configuration-driven architecture
* Granular RBAC
* Custom roles
* Immutable transactions
* Audit logs
* UUID internal IDs
* Soft deletion where appropriate
* No offline synchronization
* No suppliers/procurement system
* No recipes/ingredients
* No prescription-management system
* No customer loyalty/membership system
* Paystack exclusively for software subscription payments

### Architectural consequence

The database should **not** have separate supermarket, restaurant, pharmacy, hotel, etc. schemas.

Instead:

> **One generalized transactional schema + configurable capabilities + business-specific configuration.**

That is what makes the POS genuinely dynamic rather than simply a collection of unrelated POS features.

---