# Dynamic POS — Database Architecture v2

## 1. Final Product Architecture

The relationship becomes:

```text
                    PRODUCT MASTER
                         │
             ┌───────────┴───────────┐
             │                       │
      PRODUCT CATALOG          PRODUCT CATALOG
      Business Unit A         Business Unit B
             │                       │
         Inventory               Inventory
```

For example:

```text
Product Master
└── Coca-Cola Zero 50cl
       │
       ├── Abuja Supermarket Catalog
       │       └── Inventory: 80
       │
       └── Abuja Convenience Store Catalog
               └── Inventory: 25
```

The two catalog records belong independently to their respective Business Units, while the underlying product identity remains recognizable as the same physical product.

---

# 2. Revised Product Tables

We now need **three layers** rather than putting everything into `products`.

### `product_masters`

Represents the actual product identity.

```text
product_masters
────────────────────────
id
name
description
brand
product_type
unit_of_measure
created_at
updated_at
```

Example:

```text
id: 123
name: Coca-Cola Zero
brand: Coca-Cola
unit: bottle
```

---

### `business_unit_products`

Represents how a Business Unit sells/manages that product.

```text
business_unit_products
────────────────────────
id
business_unit_id
product_master_id
name
sku
status
track_inventory
track_batches
track_expiry
created_at
updated_at
```

This allows the same physical product to have different:

* SKU
* selling configuration
* inventory tracking
* status

in different Business Units.

---

### `product_variants`

Variants belong to the Business Unit's catalog entry.

```text
product_variants
────────────────────────
id
business_unit_product_id
name
sku
barcode
attributes
status
created_at
updated_at
```

For example:

```text
Product Master
└── Nike T-Shirt

Business Unit Product
└── Abuja Fashion Store
      │
      ├── Small / Black
      ├── Medium / Black
      └── Large / Black
```

---

# 3. Barcode Ownership

Barcode uniqueness needs careful handling.

A barcode should generally identify a specific sellable variant.

Therefore:

```text
product_variants
    └── barcode
```

should have a unique constraint.

This allows the POS to perform:

```text
SCAN
 ↓
barcode
 ↓
product_variant
 ↓
business_unit_product
 ↓
product_master
```

and immediately add the item to the cart.

---

# 4. Inventory Architecture

Inventory now belongs to the Business Unit catalog entry/variant.

```text
inventory
────────────────────────
id
business_unit_id
business_unit_product_id
product_variant_id
quantity
reserved_quantity
reorder_level
created_at
updated_at
```

The important relationship is:

```text
Business Unit
      ↓
Business Unit Product
      ↓
Variant
      ↓
Inventory
```

---

# 5. Stock Transfer Architecture

A transfer now becomes much cleaner.

Example:

```text
Supermarket
   │
   │  Coca-Cola
   │
   │  20 units
   ▼
Transfer
   │
   ▼
Pharmacy
```

When the transfer is completed:

```text
Supermarket Inventory
100 → 80

Pharmacy Inventory
0 → 20
```

The system creates a Business Unit Product for the destination if one doesn't already exist.

So:

```text
Product Master
└── Coca-Cola Zero

    ├── Supermarket Product
    │      └── Inventory: 80
    │
    └── Pharmacy Product
           └── Inventory: 20
```

This should happen **only as part of the atomic transfer transaction**.

---

# 6. Important: Product Creation Workflow

When a user creates a product in a Business Unit:

```text
User
 ↓
Create Product
 ↓
Does Product Master already exist?
 ├── YES → select existing Product Master
 │
 └── NO → create Product Master
              ↓
        create Business Unit Product
              ↓
        create Variant(s)
              ↓
        create Inventory
```

This gives us a powerful distinction between:

**"What is this product?"**

and

**"How does this Business Unit manage this product?"**

---

# 7. Pricing Architecture

You specified:

> Pricing configurable at Branch Level.

This should therefore **not** live directly on `product_masters`.

I recommend:

```text
product_prices
────────────────────────
id
branch_id
business_unit_product_id
product_variant_id
selling_price
cost_price
effective_from
effective_to
created_by
created_at
```

This means:

```text
Coca-Cola
        │
        ├── Abuja Branch → ₦500
        │
        └── Lagos Branch → ₦550
```

Even if the Business Units are different within a branch, pricing can be controlled at the branch level as you requested.

---

# 8. But There Is an Important Business Rule

Because inventory is Business Unit-specific while pricing is Branch-level:

```text
Branch
│
├── Supermarket
│      └── Coca-Cola
│
└── Pharmacy
       └── Coca-Cola
```

both can reference a Branch-level price.

However, they remain separate catalog/inventory records.

This is exactly why separating:

```text
Product Master
Business Unit Product
Inventory
Price
```

is valuable.

---

# 9. Sales Architecture

A completed sale will reference the **Business Unit Product**, not merely the Product Master.

```text
Sale
 │
 ├── Sale Item
 │      ├── Business Unit Product
 │      ├── Variant
 │      ├── Name Snapshot
 │      ├── SKU Snapshot
 │      ├── Price Snapshot
 │      └── Quantity
 │
 ├── Payment
 │
 ├── Tax
 │
 └── Service Charge
```

This protects historical transactions.

---

# 10. Transaction Immutability

Once:

```text
sale.status = COMPLETED
```

the transaction becomes immutable.

No user should be able to:

```text
UPDATE sale
DELETE sale
UPDATE sale_item
DELETE sale_item
```

Instead:

```text
Incorrect:
Completed Sale → Edit

Correct:
Completed Sale
      ↓
Refund
      ↓
New Transaction
```

This is particularly important for accounting and auditability.

---

# 11. Inventory Ledger

The inventory quantity is the current state.

The inventory movement table is the historical truth.

```text
inventory
    quantity = 80

inventory_movements
────────────────────────
SALE             -5
RETURN           +2
TRANSFER_OUT    -10
TRANSFER_IN      +5
ADJUSTMENT       +3
```

The system can therefore answer:

> Why is the inventory currently 80?

without guessing.

---

# 12. Inventory Adjustment

Authorized users can perform:

```text
Inventory Adjustment
```

but it must create a movement.

For example:

```text
Current:
100

Adjustment:
-3

Reason:
Stock count correction

Result:
97
```

And:

```text
inventory_movements

type: ADJUSTMENT
quantity: -3
reason: Stock count correction
performed_by: user
```

---

# 13. No "Delete Product" in the Traditional Sense

Your answer to deletion was to follow the recommendation.

Therefore, products should generally be:

```text
ACTIVE
ARCHIVED
```

rather than physically deleted.

Why?

Because a product may already appear in:

* historical sales
* refunds
* inventory movements
* reports
* audit logs

Deleting it would destroy historical relationships.

---

# 14. Same Principle Applies to Employees

Don't delete an employee record if they have historical transactions.

Instead:

```text
employee.status = INACTIVE
```

Their historical sales remain associated with them.

---

# 15. Customer Deletion

Customers are slightly different.

If a customer has never participated in a transaction, deletion can potentially be allowed.

If they have transaction history:

```text
ACTIVE
INACTIVE
ANONYMIZED
```

is preferable.

This gives us better data integrity.

---

# 16. Business Unit Configuration

Each Business Unit gets its own POS configuration.

```text
business_unit_settings
```

Examples:

```text
default_payment_method
tax_enabled
service_charge_enabled
service_charge_type
service_charge_value
receipt_template
allow_discount
default_discount_limit
inventory_tracking
```

So:

```text
Abuja Supermarket
    Default payment = CASH

Abuja Pharmacy
    Default payment = CARD
```

---

# 17. Business Type vs Capability

This distinction is now formally established.

### Business Type

Describes **what the business primarily is**.

```text
Supermarket
Pharmacy
Restaurant
Hotel
Fashion Store
```

### Capability

Describes **what the POS can do for that business**.

For example:

```text
Supermarket
    ├── Inventory
    ├── Barcode
    ├── Layaway
    └── Store Credit

Pharmacy
    ├── Inventory
    ├── Barcode
    ├── Batch Tracking
    ├── Expiry Tracking
    └── Store Credit
```

Business Type can provide **recommended defaults**, but capability configuration determines what is actually enabled.

That distinction is important.

---

# 18. Onboarding Flow

The onboarding experience should therefore be:

```text
Create Account
      ↓
Create Organization
      ↓
Business Information
      ↓
Select Business Type(s)
      ↓
Create First Branch
      ↓
Create Business Unit
      ↓
System recommends capabilities
      ↓
Owner reviews configuration
      ↓
Configure:
    • Tax
    • Service Charge
    • Receipt
    • Payment methods
    • Inventory
      ↓
Create Owner/Admin profile
      ↓
Dashboard
```

The user shouldn't have to understand "capabilities" technically.

The interface should present them as business features/settings.

---

# 19. Example: Restaurant Onboarding

The owner chooses:

```text
Business Type:
Restaurant
```

The system recommends:

```text
✓ Product catalog
✓ Inventory
✓ Customer management
✓ Service charge
✓ Tips
✓ Takeaway
✓ Delivery
...
```

But because you deliberately excluded several restaurant features, those excluded capabilities don't exist in the enabled configuration.

---

# 20. Example: Supermarket + Pharmacy

This is where the architecture becomes particularly useful.

```text
ABC Enterprises
│
└── Abuja Branch
      │
      ├── Supermarket
      │      ├── Inventory
      │      ├── POS
      │      └── Supermarket Configuration
      │
      └── Pharmacy
             ├── Inventory
             ├── POS
             └── Pharmacy Configuration
```

They can share:

* organization
* employees where permitted
* customers
* product masters
* reports at organization level

but maintain separate:

* inventory
* POS configuration
* catalog
* transactions
* permissions where required

---

# 21. Super Admin Architecture

Your Super Admin is fundamentally different from an Owner.

```text
                    SUPER ADMIN
                         │
                ┌────────┴────────┐
                │                 │
          Client A            Client B
             │                   │
           Owner               Owner
```

Super Admin has **untethered access**.

That means the subscription lock does not apply to the Super Admin.

However, I recommend that this access still be:

* authenticated
* authorized
* audited

rather than creating a hidden database backdoor.

---

# 22. Subscription Enforcement

Normal client access:

```text
Login
 ↓
Subscription Check
 ↓
Active?
 ├── YES → Application
 └── NO  → Locked
```

Expired:

```text
Client
 ↓
Cannot log in
 ↓
Existing sessions invalidated
 ↓
Application inaccessible
 ↓
Renew Subscription
 ↓
Paystack
 ↓
Payment Verified
 ↓
Subscription Activated
 ↓
Login restored
```

Super Admin:

```text
Super Admin
 ↓
No subscription restriction
```

---

# 23. Subscription Countdown

The system should calculate:

```text
days_remaining
```

rather than manually storing a countdown.

Then:

```text
> 7 days
    normal

7 days
    notification

6 days
    notification

5 days
    notification

...

1 day
    notification

0
    lock
```

For email:

```text
7
5
3
1
```

would actually be a more reasonable notification schedule than every two days, but you explicitly specified **every 2 days beginning at 7 days**.

So the implementation should follow:

```text
7
5
3
1
```

and not rely on a cron job firing at exactly midnight.

The system should determine whether a notification for that countdown milestone has already been sent.

---

# 24. Email Architecture

Resend should be used only for transactional system emails.

Examples:

```text
Subscription expiring
Subscription renewed
Account created
Password reset
Important security notification
```

Normal POS receipts will remain digital/in-app.

---

# 25. Cost-Conscious Architecture

The architecture remains deliberately simple:

```text
GitHub
   │
   ▼
Vercel
   │
   ├── Next.js
   ├── Server Actions / Route Handlers
   └── UI
         │
         ▼
      Supabase
       │  │  │
       │  │  └── Storage
       │  └───── Auth
       └──────── PostgreSQL

External:
Resend
Paystack
```

No Redis.

No separate backend server.

No Kafka.

No Elasticsearch.

No external logging platform.

No external monitoring platform.

No paid analytics.

This is the correct direction for your **$0 preferred / $10 maximum monthly infrastructure budget**.

---

# 26. CI/CD Architecture

From Day One:

```text
Developer
    │
    ▼
GitHub
    │
    ├── Pull Request
    │      ↓
    │   Lint
    │   Typecheck
    │   Tests
    │
    └── Merge to main
           ↓
        Vercel
           ↓
      Production
```

We should have at minimum:

### On Pull Request

```text
ESLint
TypeScript
Unit Tests
Build
```

### On `main`

```text
Build
Deploy
```

Database migrations should also be version-controlled.

---

# 27. Supabase Migration Structure

The repository should eventually contain something like:

```text
supabase/
├── migrations/
│   ├── 001_extensions.sql
│   ├── 002_organizations.sql
│   ├── 003_branches.sql
│   ├── 004_business_units.sql
│   ├── 005_business_types.sql
│   ├── 006_capabilities.sql
│   ├── 007_rbac.sql
│   ├── 008_products.sql
│   ├── 009_inventory.sql
│   ├── 010_customers.sql
│   ├── 011_sales.sql
│   ├── 012_refunds.sql
│   ├── 013_layaway.sql
│   ├── 014_notifications.sql
│   ├── 015_audit.sql
│   ├── 016_subscriptions.sql
│   └── 017_rls.sql
│
├── functions/
├── seed.sql
└── config.toml
```

This makes the database reproducible.

---

# 28. Development Environments

We should have:

```text
Local
   ↓
Development Supabase
   ↓
Production Supabase
```

and **never develop directly against production**.

For each client deployment:

```text
Client A
 ├── Vercel Project A
 └── Supabase Project A

Client B
 ├── Vercel Project B
 └── Supabase Project B
```

This matches your independent deployment strategy.

---

# 29. Important Consequence of Independent Deployment

Your architecture now has a major advantage:

A client's data is not sitting beside another client's data.

Instead:

```text
Client A
Supabase A
    ↓
completely separate database

Client B
Supabase B
    ↓
completely separate database
```

This substantially reduces the blast radius of a tenant-isolation bug.

---

# 30. Next Stage: Application Architecture

The database architecture is now sufficiently defined to move into the **actual application architecture**.

The next stage should establish:

```text
Frontend Architecture
        ↓
Application Modules
        ↓
Route Structure
        ↓
Server Actions / API boundaries
        ↓
State Management
        ↓
Supabase integration
        ↓
Authorization middleware
        ↓
POS checkout architecture
        ↓
Inventory transaction architecture
        ↓
Subscription enforcement
```