# Dynamic POS — Database Architecture & PostgreSQL Schema

**Version:** 1.0
**Database:** PostgreSQL via Supabase
**Status:** Architecture Baseline
**Design principle:** Database integrity first

We can now move from the conceptual architecture into the **actual database design**.

This is the stage where we define exactly how the Dynamic POS stores organizations, branches, business units, products, inventory, sales, customers, permissions, subscriptions, etc.

---

# 1. Database Design Philosophy

The database should follow five major principles:

### 1. Relational integrity

Use PostgreSQL foreign keys and constraints heavily.

### 2. Immutable financial history

Completed sales, payments, refunds and inventory movements should not be destructively edited.

### 3. Configuration-driven behavior

Business-specific functionality should be represented through configuration/capabilities rather than duplicated tables or code.

### 4. Current state + historical ledger

For things such as inventory and store credit, maintain:

```text
Current State
+
Immutable History
```

This provides both performance and auditability.

### 5. Database-enforced correctness

The backend should not be the only thing preventing invalid data.

Where practical:

```text
Application validation
+
Database constraints
+
Transactions
```

---

# 2. High-Level ERD

The core relationship is:

```text
┌─────────────────────┐
│    organizations    │
└─────────┬───────────┘
          │
     ┌────┴─────┐
     │          │
     ▼          ▼
 branches   subscriptions
     │
     ▼
business_units
     │
 ┌───┼───────────────┬────────────┐
 │   │               │            │
 ▼   ▼               ▼            ▼
products inventory   sales     customers
 │       │             │
 ▼       ▼             ▼
variants movements  sale_items
                         │
                         ▼
                      payments
```

Alongside this:

```text
users
  │
  ▼
organization_members
  │
  ▼
roles
  │
  ▼
role_permissions
  │
  ▼
permissions
```

And across the entire system:

```text
audit_logs
notifications
```

---

# 3. Organization

## `organizations`

Represents the client/company.

```text
organizations
────────────────────────────
id                  UUID PK
name                TEXT
legal_name          TEXT NULL
status              ENUM
email               TEXT
phone               TEXT NULL
address             TEXT NULL
country             TEXT
currency            TEXT
timezone            TEXT
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

### Status

```text
ACTIVE
SUSPENDED
ARCHIVED
```

The organization is the highest client-level entity.

---

# 4. Business Types

## `business_types`

```text
business_types
────────────────────────────
id                  UUID PK
code                TEXT UNIQUE
name                TEXT
description         TEXT NULL
is_active           BOOLEAN
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

Examples:

```text
supermarket
convenience_store
restaurant
pharmacy
fashion
electronics
hardware
beauty
hotel
bakery
wholesale
general_retail
other
```

This is deliberately data-driven.

The Super Admin can eventually add new business types without modifying the database schema.

---

# 5. Capabilities

## `capabilities`

Capabilities represent individual features.

```text
capabilities
────────────────────────────
id                  UUID PK
code                TEXT UNIQUE
name                TEXT
description         TEXT NULL
category            TEXT
is_active           BOOLEAN
created_at          TIMESTAMPTZ
```

Examples:

```text
products
product_variants
inventory
batch_tracking
expiry_tracking
stock_transfers
store_credit
layaway
service_charge
discounts
refunds
customer_management
advanced_reports
```

Future capabilities could include:

```text
table_management
kitchen_management
prescription_management
loyalty
gift_cards
```

without changing the fundamental architecture.

---

# 6. Business Type Capabilities

## `business_type_capabilities`

This defines default capabilities for each business type.

```text
business_type_capabilities
────────────────────────────────
business_type_id       UUID FK
capability_id          UUID FK
enabled                BOOLEAN
created_at             TIMESTAMPTZ

PRIMARY KEY (
    business_type_id,
    capability_id
)
```

Example:

```text
Pharmacy
 ├── inventory       TRUE
 ├── expiry          TRUE
 ├── batch_tracking  TRUE
 └── kitchen         FALSE
```

---

# 7. Organizations vs Business Units

This distinction is critical.

An organization owns branches.

Branches contain Business Units.

```text
organizations
      │
      ▼
branches
      │
      ▼
business_units
```

---

# 8. Branches

## `branches`

```text
branches
────────────────────────────
id                  UUID PK
organization_id     UUID FK
name                TEXT
code                TEXT
address             TEXT NULL
phone               TEXT NULL
email               TEXT NULL
is_active           BOOLEAN
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

Constraint:

```text
UNIQUE(organization_id, code)
```

---

# 9. Business Units

## `business_units`

```text
business_units
────────────────────────────
id                  UUID PK
organization_id     UUID FK
branch_id           UUID FK
business_type_id    UUID FK

name                TEXT
code                TEXT

is_active           BOOLEAN

created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

Example:

```text
ABC Ltd
│
└── Abuja Branch
    │
    ├── ABC Supermarket
    │
    └── ABC Pharmacy
```

Both are Business Units.

---

# 10. Business Unit Capabilities

## `business_unit_capabilities`

This is where the actual configuration lives.

```text
business_unit_capabilities
────────────────────────────────
business_unit_id      UUID FK
capability_id         UUID FK
enabled               BOOLEAN
configured_by         UUID FK
created_at            TIMESTAMPTZ
updated_at            TIMESTAMPTZ

PRIMARY KEY (
    business_unit_id,
    capability_id
)
```

This allows a business type's defaults to be overridden.

For example:

```text
Business Type:
Restaurant

Default:
Kitchen = enabled

Specific Business Unit:
Kitchen = disabled
```

---

# 11. Configuration Settings

Rather than creating hundreds of columns on `business_units`, use a controlled configuration system.

## `business_unit_settings`

```text
business_unit_settings
────────────────────────────────
business_unit_id      UUID FK
setting_key           TEXT
setting_value         JSONB
updated_by            UUID FK
updated_at            TIMESTAMPTZ

PRIMARY KEY (
    business_unit_id,
    setting_key
)
```

Examples:

```text
default_payment_method
tax_enabled
tax_rate
service_charge_enabled
service_charge_type
service_charge_value
receipt_template
low_stock_threshold
```

### Important

JSONB should **not** become a dumping ground for core relational data.

Core entities remain proper tables.

JSONB is primarily for configuration.

---

# 12. Business Branding

## `organization_branding`

```text
organization_branding
────────────────────────────
organization_id     UUID PK
brand_name         TEXT
logo_url           TEXT NULL
primary_color      TEXT NULL
secondary_color    TEXT NULL
updated_at         TIMESTAMPTZ
```

---

# 13. Users

Authentication itself is handled by Supabase Auth.

The application database stores the application's user profile.

## `profiles`

```text
profiles
────────────────────────────
id                  UUID PK
auth_user_id        UUID UNIQUE
first_name          TEXT
last_name           TEXT
phone               TEXT NULL
avatar_url          TEXT NULL
is_active           BOOLEAN
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

---

# 14. Organization Membership

A user needs an organization relationship.

## `organization_members`

```text
organization_members
────────────────────────────
id                  UUID PK
organization_id     UUID FK
profile_id          UUID FK

status              ENUM
joined_at           TIMESTAMPTZ
created_at          TIMESTAMPTZ

UNIQUE(
    organization_id,
    profile_id
)
```

This allows a user's organizational relationship to be managed independently from authentication.

---

# 15. Roles

## `roles`

```text
roles
────────────────────────────
id                  UUID PK
organization_id     UUID FK NULL
name                TEXT
description         TEXT NULL
is_system_role      BOOLEAN
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

### Why `organization_id` can be NULL

System roles can exist globally:

```text
Cashier
Branch Manager
Pharmacist
```

while custom roles belong to a specific organization.

---

# 16. Role Assignments

Because permissions can be scoped, role assignment needs more than a simple user → role relationship.

## `member_roles`

```text
member_roles
────────────────────────────
id                  UUID PK
organization_member_id UUID FK
role_id             UUID FK

branch_id           UUID FK NULL
business_unit_id    UUID FK NULL

created_at          TIMESTAMPTZ
```

This allows:

### Organization-wide role

```text
Owner
```

### Branch-specific role

```text
Branch Manager
→ Abuja Branch
```

### Business Unit-specific role

```text
Cashier
→ Abuja Pharmacy
```

This is a very important design decision.

---

# 17. Permissions

## `permissions`

```text
permissions
────────────────────────────
id                  UUID PK
code                TEXT UNIQUE
name                TEXT
description         TEXT NULL
resource            TEXT
action              TEXT
```

Examples:

```text
products.view
products.create
products.update
products.archive

inventory.view
inventory.adjust
inventory.transfer

sales.create
sales.view
sales.cancel

refunds.create
refunds.approve

discounts.create
discounts.approve
```

---

# 18. Role Permissions

## `role_permissions`

```text
role_permissions
────────────────────────────
role_id             UUID FK
permission_id       UUID FK

PRIMARY KEY (
    role_id,
    permission_id
)
```

---

# 19. Products

## `products`

```text
products
────────────────────────────
id                  UUID PK
business_unit_id    UUID FK

name                TEXT
description         TEXT NULL

sku                 TEXT
barcode             TEXT NULL

product_type        ENUM

cost_price          NUMERIC
base_price          NUMERIC

track_inventory     BOOLEAN
track_batches       BOOLEAN
track_expiry        BOOLEAN

is_active           BOOLEAN

created_by          UUID FK
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

Constraint:

```text
UNIQUE(business_unit_id, sku)
```

Barcode uniqueness should also be enforced within the Business Unit where present.

---

# 20. Product Categories

## `product_categories`

```text
product_categories
────────────────────────────
id                  UUID PK
business_unit_id    UUID FK

name                TEXT
description         TEXT NULL
parent_id           UUID FK NULL

is_active           BOOLEAN
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

This supports nested categories:

```text
Food
 ├── Drinks
 │    ├── Soda
 │    └── Juice
 └── Snacks
```

---

# 21. Product Variants

## `product_variants`

```text
product_variants
────────────────────────────
id                  UUID PK
product_id          UUID FK

name                TEXT
sku                 TEXT NULL
barcode             TEXT NULL

price_override      NUMERIC NULL
cost_override       NUMERIC NULL

is_active           BOOLEAN
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

Examples:

```text
T-Shirt
 ├── Small
 ├── Medium
 └── Large
```

---

# 22. Product Images

## `product_images`

```text
product_images
────────────────────────────
id                  UUID PK
product_id          UUID FK
storage_path        TEXT
alt_text             TEXT NULL
sort_order          INTEGER
created_at          TIMESTAMPTZ
```

Files reside in Supabase Storage.

---

# 23. Branch Pricing

Because you selected **branch-level pricing**, create a dedicated pricing table.

## `product_branch_prices`

```text
product_branch_prices
────────────────────────────
id                  UUID PK
product_id          UUID FK
branch_id           UUID FK

selling_price       NUMERIC
effective_from      TIMESTAMPTZ NULL
effective_to        TIMESTAMPTZ NULL

created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

This allows:

```text
Product
Base Price = ₦5,000

Abuja Branch = ₦5,200
Lagos Branch = ₦5,500
```

However, the product can only be sold within the Business Unit that owns it.

---

# 24. Inventory

## `inventory_balances`

```text id="1o6q2d"
inventory_balances
────────────────────────────
id                  UUID PK
business_unit_id    UUID FK
product_id          UUID FK

quantity            NUMERIC
reserved_quantity   NUMERIC

updated_at          TIMESTAMPTZ
```

Constraint:

```text
UNIQUE(
    business_unit_id,
    product_id
)
```

Available inventory:

```text
available =
quantity - reserved_quantity
```

---

# 25. Inventory Movements

## `inventory_movements`

```text
inventory_movements
────────────────────────────
id                  UUID PK

business_unit_id    UUID FK
product_id          UUID FK

movement_type       ENUM
quantity            NUMERIC

reference_type      TEXT NULL
reference_id        UUID NULL

performed_by        UUID FK
created_at          TIMESTAMPTZ
```

Movement types:

```text
SALE
RETURN
ADJUSTMENT_IN
ADJUSTMENT_OUT
TRANSFER_IN
TRANSFER_OUT
LAYAWAY
```

---

# 26. Stock Transfers

## `stock_transfers`

```text
stock_transfers
────────────────────────────
id                  UUID PK

organization_id     UUID FK
source_business_unit_id UUID FK
destination_business_unit_id UUID FK

status              ENUM

created_by          UUID FK
approved_by         UUID FK NULL

created_at          TIMESTAMPTZ
completed_at        TIMESTAMPTZ NULL
```

## `stock_transfer_items`

```text
stock_transfer_items
────────────────────────────
id                  UUID PK
transfer_id         UUID FK
product_id          UUID FK
quantity             NUMERIC
```

---

# 27. Batch Tracking

Because inventory requirements include batch-related functionality, use:

## `inventory_batches`

```text
inventory_batches
────────────────────────────
id                  UUID PK

business_unit_id    UUID FK
product_id          UUID FK

batch_number        TEXT
quantity            NUMERIC

manufactured_at     DATE NULL
expires_at          DATE NULL

created_at          TIMESTAMPTZ
```

This is especially useful for pharmacy and some food/retail operations.

---

# 28. Customers

## `customers`

```text
customers
────────────────────────────
id                  UUID PK
organization_id     UUID FK

first_name          TEXT
last_name           TEXT NULL

phone               TEXT NULL
email               TEXT NULL

customer_code       TEXT NULL

address             TEXT NULL

is_active           BOOLEAN

created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

Customers belong to the organization rather than a single Business Unit so that an organization can recognize the same customer across its operations.

This does **not** mean products or inventory are shared.

---

# 29. Sales

## `sales`

```text
sales
────────────────────────────
id                  UUID PK

organization_id     UUID FK
branch_id           UUID FK
business_unit_id    UUID FK

customer_id         UUID FK NULL

receipt_number      TEXT

subtotal            NUMERIC
discount_amount     NUMERIC
tax_amount          NUMERIC
service_charge      NUMERIC
total_amount        NUMERIC

status              ENUM

created_by          UUID FK
created_at          TIMESTAMPTZ
```

Sale statuses:

```text
COMPLETED
VOIDED
REFUNDED
PARTIALLY_REFUNDED
```

A completed sale is immutable.

---

# 30. Sale Items

## `sale_items`

```text
sale_items
────────────────────────────
id                  UUID PK
sale_id             UUID FK

product_id          UUID FK
product_variant_id  UUID FK NULL

product_name        TEXT
sku                 TEXT NULL

quantity            NUMERIC

unit_price          NUMERIC
discount_amount     NUMERIC
tax_amount          NUMERIC

line_total          NUMERIC
```

### Important design choice

Store the product name and SKU snapshot in the sale item.

Why?

Because if the product is later renamed, the historical receipt must still represent what was actually sold.

---

# 31. Payments

## `payments`

```text
payments
────────────────────────────
id                  UUID PK
sale_id             UUID FK

payment_method      ENUM
amount              NUMERIC

status              ENUM
reference           TEXT NULL

created_by          UUID FK
created_at          TIMESTAMPTZ
```

Although split payments are currently disabled, keeping `payments` as a separate table is still the correct architecture.

It gives us flexibility later without redesigning the entire sales model.

---

# 32. Discounts

The sale itself should store the final discount amount, but discount metadata should also be preserved.

## `discount_records`

```text
discount_records
────────────────────────────
id                  UUID PK

sale_id             UUID FK
sale_item_id        UUID FK NULL

discount_type       ENUM
value               NUMERIC
amount              NUMERIC

reason              TEXT NULL

created_by          UUID FK
approved_by         UUID FK NULL

created_at          TIMESTAMPTZ
```

This provides a proper audit trail.

---

# 33. Taxes

## `tax_configurations`

```text
tax_configurations
────────────────────────────
id                  UUID PK
organization_id     UUID FK

name                TEXT
rate                NUMERIC

is_active           BOOLEAN

created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

The actual tax applied to a sale should be stored on the transaction/sale item as a snapshot.

This prevents historical transactions from changing when the tax configuration changes later.

---

# 34. Service Charges

## `service_charge_configurations`

```text
service_charge_configurations
────────────────────────────
id                  UUID PK

business_unit_id    UUID FK

charge_type         ENUM
value               NUMERIC

is_active           BOOLEAN

created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

The charge applied to an actual sale is stored as a transaction snapshot.

---

# 35. Returns

## `returns`

```text
returns
────────────────────────────
id                  UUID PK

sale_id             UUID FK
business_unit_id    UUID FK

reason              TEXT

status              ENUM

created_by          UUID FK
approved_by         UUID FK NULL

created_at          TIMESTAMPTZ
```

## `return_items`

```text
return_items
────────────────────────────
id                  UUID PK

return_id           UUID FK
sale_item_id        UUID FK

quantity            NUMERIC
amount              NUMERIC
```

---

# 36. Refunds

## `refunds`

```text
refunds
────────────────────────────
id                  UUID PK

return_id           UUID FK
sale_id             UUID FK

amount              NUMERIC
payment_method      ENUM

status              ENUM

requested_by        UUID FK
approved_by         UUID FK

created_at          TIMESTAMPTZ
```

Refund authorization is therefore structurally enforced as part of the workflow.

---

# 37. Store Credit

## `store_credit_accounts`

```text
store_credit_accounts
────────────────────────────
id                  UUID PK

customer_id         UUID FK UNIQUE
balance             NUMERIC

created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

## `store_credit_transactions`

```text
store_credit_transactions
────────────────────────────
id                  UUID PK

account_id          UUID FK

transaction_type    ENUM
amount              NUMERIC

reference_type      TEXT NULL
reference_id        UUID NULL

performed_by        UUID FK
created_at          TIMESTAMPTZ
```

Types:

```text
CREDIT
DEBIT
REFUND
ADJUSTMENT
```

---

# 38. Layaway

## `layaways`

```text
layaways
────────────────────────────
id                  UUID PK

organization_id     UUID FK
business_unit_id    UUID FK
customer_id         UUID FK

reference_number    TEXT

total_amount        NUMERIC
amount_paid         NUMERIC
balance             NUMERIC

status              ENUM

created_by          UUID FK
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

## `layaway_items`

```text
layaway_items
────────────────────────────
id                  UUID PK

layaway_id          UUID FK
product_id          UUID FK
product_variant_id  UUID FK NULL

quantity            NUMERIC
unit_price          NUMERIC
total                NUMERIC
```

## `layaway_payments`

```text
layaway_payments
────────────────────────────
id                  UUID PK

layaway_id          UUID FK

amount              NUMERIC
payment_method      ENUM
reference           TEXT NULL

received_by         UUID FK
created_at          TIMESTAMPTZ
```

---

# 39. Suspended Sales

Suspended sales should not be treated as completed transactions.

## `suspended_sales`

```text
suspended_sales
────────────────────────────
id                  UUID PK

business_unit_id    UUID FK
created_by          UUID FK

customer_id         UUID FK NULL

cart_data           JSONB

created_at          TIMESTAMPTZ
expires_at          TIMESTAMPTZ NULL
```

The cart can be resumed and converted into a real sale.

---

# 40. Cash Register

There is an important conflict in the earlier requirements:

You originally marked all cash-register functionality as excluded, while the later architecture discussions indicate transaction/accounting controls are still required.

I recommend **not implementing physical cash registers/shifts in the initial schema**.

Instead, payment records remain the source of truth.

This avoids prematurely building:

* Cash drawer management
* Shift reconciliation
* Expected cash
* Actual cash
* Register variance

We can add these later without redesigning sales/payments.

---

# 41. Accounting

The accounting module should not directly mutate sales.

Instead:

```text
Sale
 ↓
Financial event
 ↓
Accounting records
```

We can use a lightweight accounting ledger.

## `accounting_entries`

```text
accounting_entries
────────────────────────────
id                  UUID PK

organization_id     UUID FK
business_unit_id    UUID FK

entry_type          ENUM

amount              NUMERIC

reference_type      TEXT
reference_id        UUID

created_at          TIMESTAMPTZ
```

This can later evolve into double-entry accounting if the product requires it.

---

# 42. Notifications

## `notifications`

```text
notifications
────────────────────────────
id                  UUID PK

organization_id     UUID FK
user_id             UUID FK

type                TEXT
title               TEXT
message             TEXT

read_at             TIMESTAMPTZ NULL

created_at          TIMESTAMPTZ
```

---

# 43. Notification Preferences

## `notification_preferences`

```text
notification_preferences
────────────────────────────
id                  UUID PK

user_id             UUID FK
notification_type   TEXT

in_app_enabled      BOOLEAN
email_enabled       BOOLEAN

updated_at          TIMESTAMPTZ
```

---

# 44. Audit Logs

## `audit_logs`

```text
audit_logs
────────────────────────────
id                  UUID PK

organization_id     UUID FK NULL
user_id             UUID FK NULL

action              TEXT
resource_type       TEXT
resource_id         UUID NULL

old_values         JSONB NULL
new_values         JSONB NULL
metadata            JSONB NULL

ip_address          INET NULL
user_agent          TEXT NULL

created_at          TIMESTAMPTZ
```

This should be append-only from the application's perspective.

---

# 45. Subscriptions

## `subscriptions`

```text
subscriptions
────────────────────────────
id                  UUID PK

organization_id     UUID FK UNIQUE

billing_period      ENUM
price               NUMERIC

starts_at            TIMESTAMPTZ
expires_at           TIMESTAMPTZ

status              ENUM

created_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ
```

Billing periods:

```text
MONTHLY
QUARTERLY
SEMI_ANNUAL
ANNUAL
```

---

# 46. Subscription Payments

## `subscription_payments`

```text
subscription_payments
────────────────────────────
id                  UUID PK

organization_id     UUID FK
subscription_id     UUID FK

paystack_reference  TEXT UNIQUE

amount              NUMERIC
currency            TEXT

status              ENUM

paid_at             TIMESTAMPTZ NULL
created_at          TIMESTAMPTZ
```

---

# 47. Receipt Templates

## `receipt_templates`

```text
receipt_templates
────────────────────────────
id                  UUID PK

organization_id     UUID FK

name                TEXT
template_config     JSONB

is_default          BOOLEAN

created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

The actual receipt configuration can safely use JSONB because it is presentation configuration rather than core business data.

---

# 48. Important Database Constraints

The database should enforce things such as:

### Positive monetary values

```text
amount >= 0
```

### Positive inventory quantities

```text
quantity >= 0
```

### Valid tax rates

```text
rate >= 0
```

### Unique organization codes

```text
UNIQUE(organization_id, code)
```

### Unique product SKU within Business Unit

```text
UNIQUE(business_unit_id, sku)
```

### Unique barcode within Business Unit

```text
UNIQUE(business_unit_id, barcode)
```

---

# 49. Critical Foreign-Key Rules

Examples:

```text
Organization
  ↓
Branch
```

Deleting an organization should **not** cascade-delete transactional history.

Likewise:

```text
Product
 ↓
Sale Item
```

A product that has appeared in transactions should generally be **archived**, not physically deleted.

This is why products have:

```text
is_active
```

rather than relying on deletion.

---

# 50. Soft Delete vs Hard Delete

For core business entities:

### Prefer archive/soft deletion

Examples:

* Products
* Categories
* Employees
* Business Units
* Branches

### Avoid deleting

* Sales
* Payments
* Refunds
* Inventory movements
* Accounting records
* Audit logs

This follows your requirement for immutable transactional data.

---

# 51. Index Strategy

The POS will be heavily dependent on fast lookup.

Important indexes:

```text
products(business_unit_id)
products(business_unit_id, barcode)
products(business_unit_id, sku)

inventory_balances(business_unit_id, product_id)

sales(business_unit_id, created_at)
sales(branch_id, created_at)
sales(customer_id, created_at)

sale_items(sale_id)

payments(sale_id)

customers(organization_id, phone)

audit_logs(organization_id, created_at)

notifications(user_id, read_at)

subscriptions(organization_id, expires_at)
```

Indexes should be expanded based on actual query patterns rather than indiscriminately indexing every column.

---

# 52. Money Representation

Use PostgreSQL:

```text
NUMERIC
```

not floating-point types.

For example:

```text
NUMERIC(19,4)
```

This avoids floating-point monetary errors.

---

# 53. Quantity Representation

Inventory quantity should also use `NUMERIC`, rather than assuming every business sells only whole units.

This supports businesses selling:

* Whole units
* Weight
* Length
* Volume

later without restructuring the inventory engine.

---

# 54. Currency

The organization should have a configured currency.

Initially:

```text
NGN
```

can be the default.

However, currency should not be hard-coded into the schema.

This allows future deployments in other countries.

---

# 55. Time Handling

Store timestamps as:

```text
TIMESTAMPTZ
```

in PostgreSQL.

The organization stores its timezone.

The frontend converts timestamps for display.

This prevents major reporting problems when deployments eventually span different regions.

---

# 56. Supabase RLS

RLS policies should ensure that an authenticated user cannot access arbitrary organizations.

Conceptually:

```text
auth.uid()
   ↓
profiles
   ↓
organization_members
   ↓
organization
```

However, because the Express API is the primary application boundary, we should avoid creating an enormous maze of RLS policies before the authorization model is finalized.

The security architecture should use **defense in depth**.

---

# 57. Critical Database Functions

Some operations should eventually be implemented as PostgreSQL functions/transactions rather than multiple independent API calls.

Especially:

### Complete sale

```text
create_sale_transaction()
```

### Complete stock transfer

```text
complete_stock_transfer()
```

### Apply store credit

```text
apply_store_credit()
```

### Apply refund

```text
process_refund()
```

The backend calls these as controlled transactional operations.

---

# 58. Why This Matters

Consider checkout:

```text
Create sale
↓
Deduct inventory
↓
Create payment
↓
Generate receipt
```

If these are separate API requests, you can get:

```text
Sale created ✓
Inventory failed ✗
Payment created ✓
```

Now your system has inconsistent financial data.

Instead:

```text
BEGIN
  sale
  sale_items
  payment
  inventory movement
  inventory balance
  audit event
COMMIT
```

Either the entire operation succeeds or the entire operation fails.

---

# 59. Database-Level Transaction Boundary

The most important transactional boundary in the entire system is:

> **Sale completion.**

It must guarantee:

```text
Sale
+
Items
+
Payment
+
Inventory
+
Tax
+
Discount
+
Service Charge
+
Audit
```

are consistent.

This is more important than almost any UI feature.

---

# 60. What the Schema Gives Us

With this architecture, the same database can represent:

### Supermarket

```text
Organization
└── Branch
    └── Supermarket
         ├── Products
         ├── Inventory
         └── POS
```

### Supermarket + Pharmacy

```text
Organization
└── Branch
    ├── Supermarket
    │    ├── Products
    │    └── Inventory
    │
    └── Pharmacy
         ├── Products
         └── Inventory
```

### Restaurant + Juice Bar

```text
Organization
└── Branch
    ├── Restaurant
    └── Juice Bar
```

without creating separate applications.

---

# 61. The Most Important Correction to Avoid

We should **not** make the schema look like this:

```text
supermarket_products
restaurant_products
pharmacy_products
fashion_products
```

Nor:

```text
restaurant_orders
pharmacy_orders
supermarket_sales
```

The core transactional engine should remain shared.

Business-specific capabilities should extend the core model.

---

# 62. Recommended Schema Grouping

For actual Supabase migrations, I recommend grouping tables conceptually as:

```text
01_identity
02_organizations
03_configuration
04_users_rbac
05_products
06_inventory
07_customers
08_sales
09_payments
10_returns_refunds
11_store_credit
12_layaway
13_accounting
14_notifications
15_subscriptions
16_audit
```

This makes the migration history much easier to understand.

---

# 63. Proposed Final Core Relationship

The architecture can now be summarized as:

```text
                    ORGANIZATION
                         │
              ┌──────────┴──────────┐
              │                     │
           BRANCH              SUBSCRIPTION
              │
        BUSINESS UNIT
              │
      ┌───────┼────────┐
      │       │        │
   PRODUCT INVENTORY   POS
      │       │        │
  VARIANTS MOVEMENTS  SALE
                      │
              ┌───────┼───────┐
              │       │       │
           ITEMS   PAYMENT  CUSTOMER
                              │
                      ┌───────┴──────┐
                      │              │
                 STORE CREDIT     LAYAWAY
```

And across everything:

```text
                 AUDIT LOG
                    ▲
                    │
         All sensitive operations
```

---

# 64. Architecture Decision: Do We Need Prisma?

**Not necessarily.**

Because we're using Supabase/PostgreSQL and have several transaction-heavy operations, we should carefully consider whether Prisma adds enough value.

There are two reasonable options:

### Option A — Prisma

Pros:

* Strong TypeScript ORM
* Excellent developer experience
* Schema modeling
* Type-safe queries

Cons:

* Additional abstraction
* Some PostgreSQL-specific functionality becomes less direct
* Transaction-heavy database logic can still require raw SQL

### Option B — Supabase/PostgreSQL + typed SQL/query layer

Pros:

* PostgreSQL is directly exposed
* Excellent control over transactions
* Fewer abstractions
* Very suitable for this architecture

Cons:

* More responsibility around query organization
* Less ORM convenience

### My recommendation

For **this specific POS**, I lean toward:

> **PostgreSQL + Supabase + a lightweight typed database access layer rather than making an ORM the center of the architecture.**

The transaction engine is too important to hide behind an ORM abstraction.

We can still use generated database types to preserve TypeScript safety.

---

# 65. What Is Now Locked In

At this point, these architectural decisions should be treated as baseline:

| Area               | Decision                              |
| ------------------ | ------------------------------------- |
| Deployment         | Independent per client                |
| Architecture       | Modular monolith                      |
| Frontend           | React + TypeScript                    |
| Backend            | Express + Node.js + TypeScript        |
| Database           | Supabase PostgreSQL                   |
| Auth               | Supabase Auth                         |
| Business hierarchy | Organization → Branch → Business Unit |
| Business type      | Configuration/template                |
| Capabilities       | Configuration-driven                  |
| Inventory          | Business Unit-specific                |
| Products           | Business Unit-specific                |
| Product sharing    | **No**                                |
| Pricing            | Branch-level                          |
| Stock transfers    | Yes, simple                           |
| Offline            | **Completely eliminated**             |
| POS payments       | Internal recording                    |
| Paystack           | Subscription payments only            |
| Transactions       | Immutable                             |
| Concurrency        | Required                              |
| RBAC               | Granular                              |
| Custom roles       | Yes                                   |
| Audit              | Yes                                   |
| Branding           | Configurable                          |
| Email              | Resend                                |
| AI                 | Architecture-ready, not required      |
| CI/CD              | GitHub from Day One                   |
| Infrastructure     | Free preferred, ≤$10 target           |

---

## Next Stage: API & Application Contract

The database is now sufficiently defined to move to the **API Specification**.

That next stage should define the actual contract between the React frontend and Express backend:

```text
Authentication
       ↓
Organizations
       ↓
Branches
       ↓
Business Units
       ↓
Capabilities
       ↓
Users / RBAC
       ↓
Products
       ↓
Inventory
       ↓
Customers
       ↓
POS / Sales
       ↓
Payments
       ↓
Refunds
       ↓
Store Credit
       ↓
Layaway
       ↓
Accounting
       ↓
Reports
       ↓
Notifications
       ↓
Subscriptions
       ↓
Audit
```