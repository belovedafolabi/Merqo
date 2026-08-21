# Dynamic POS — Technical Architecture Specification

**Version:** 1.0
**Status:** Architecture Baseline
**Architecture:** Configurable modular monolith
**Deployment:** Independent deployment per client
**Connectivity:** Online-only
**Primary stack:** React + Express + Node.js + Supabase/PostgreSQL
**Target infrastructure cost:** $0 preferred, ≤ $10/month target

---

# 1. Recommended Architecture

I recommend a **modular monolith**, not microservices.

```text
┌─────────────────────────────────────────────┐
│                 React Web App               │
│                                             │
│  POS │ Admin │ Inventory │ Reports │ Setup │
└──────────────────────┬──────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────┐
│              Express API                    │
│                                             │
│ Auth / RBAC                                 │
│ Organization                               │
│ Business Units                             │
│ Products                                   │
│ Inventory                                  │
│ POS / Sales                                │
│ Customers                                  │
│ Payments                                   │
│ Accounting                                 │
│ Reports                                    │
│ Notifications                              │
│ Subscriptions                              │
│ Audit                                      │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│                  Supabase                   │
│                                             │
│ PostgreSQL │ Auth │ Storage │ Realtime*    │
└─────────────────────────────────────────────┘
```

`*` Realtime should only be used where it provides a genuine benefit; it should not become a default dependency for every feature.

### Why this architecture?

A modular monolith gives you:

* One deployable application
* One backend
* One database
* Strong transaction boundaries
* Much simpler development
* Lower infrastructure cost
* Easier CI/CD
* Easier debugging
* Easier local development
* A clean path to extracting services later if the product actually requires it

For this product, microservices would add complexity without providing enough benefit at the beginning.

---

# 2. Technology Stack

## Frontend

**React + TypeScript**

Recommended:

* React
* TypeScript
* Vite
* Tailwind CSS
* shadcn/ui
* React Router
* TanStack Query
* React Hook Form
* Zod

### Why TanStack Query?

The application is heavily server-state oriented.

Products, inventory, customers, reports, sales and configuration all originate from the backend.

TanStack Query provides:

* Caching
* Request deduplication
* Refetching
* Loading/error states
* Mutation handling
* Cache invalidation

without turning the application into an unnecessarily complicated global-state system.

---

# 3. Backend

**Node.js + Express + TypeScript**

The backend should be organized by domain rather than by generic technical layers.

Recommended:

```text
server/
├── modules/
│   ├── auth/
│   ├── organizations/
│   ├── branches/
│   ├── business-units/
│   ├── users/
│   ├── roles/
│   ├── permissions/
│   ├── products/
│   ├── categories/
│   ├── inventory/
│   ├── transfers/
│   ├── customers/
│   ├── sales/
│   ├── refunds/
│   ├── store-credit/
│   ├── layaway/
│   ├── payments/
│   ├── taxes/
│   ├── service-charges/
│   ├── accounting/
│   ├── reports/
│   ├── notifications/
│   ├── subscriptions/
│   ├── branding/
│   └── audit/
│
├── middleware/
├── database/
├── shared/
├── config/
└── app.ts
```

Each module owns its:

* Routes
* Controllers
* Services
* Validation
* Domain logic
* Types

This prevents the backend from becoming one giant collection of controllers.

---

# 4. Database

Use:

**Supabase PostgreSQL**

PostgreSQL should be treated as the authoritative source of truth.

The database is responsible for protecting:

* Inventory
* Money
* Transaction integrity
* Relationships
* Uniqueness
* Referential integrity
* Concurrency-sensitive operations

The frontend should never directly manipulate critical transactional data.

---

# 5. The Core Organizational Model

This is the most important part of the architecture.

```text
Organization
│
├── Branch
│   │
│   ├── Business Unit
│   │
│   └── Business Unit
│
└── Branch
    │
    └── Business Unit
```

## Organization

Represents the client/company.

Example:

> Afolabi Retail Ltd.

## Branch

Represents a physical/geographical location.

Example:

> Abuja Branch

## Business Unit

Represents an operational business within a branch.

Example:

```text
Abuja Branch

├── Supermarket
└── Pharmacy
```

This is intentionally **not** modeled as another branch.

---

# 6. Business Type Architecture

We need to distinguish:

```text
Business Type ≠ Business Unit
```

A Business Type is a classification/configuration template.

Example:

```text
business_types

supermarket
restaurant
pharmacy
fashion
electronics
hardware
salon
hotel
bakery
wholesale
general_retail
```

A Business Unit references a Business Type.

```text
Business Unit
       │
       └── business_type_id
```

Therefore:

```text
ABC Pharmacy
      │
      └── Business Type = Pharmacy
```

---

# 7. Capability Architecture

This is where the system becomes genuinely dynamic.

Instead of:

```typescript
if (businessType === "restaurant") {
   ...
}
```

throughout the codebase, use capabilities.

Example:

```text
capabilities

products
inventory
batch_tracking
expiry_tracking
service_charge
layaway
store_credit
table_management
kitchen_management
prescription_management
```

A Business Unit has enabled capabilities.

```text
Business Unit
      │
      ├── inventory = enabled
      ├── layaway = enabled
      ├── store_credit = enabled
      ├── service_charge = enabled
      └── kitchen = disabled
```

---

# 8. Business Type as a Configuration Template

Business Type provides **defaults**.

For example:

### Pharmacy

```text
Inventory
✓

Batch tracking
✓

Expiry tracking
✓

Tables
✗

Kitchen
✗
```

### Restaurant

```text
Inventory
✓

Service charge
✓

Tables
✗  // currently excluded

Kitchen
✗  // currently excluded
```

The important distinction is:

> Business type determines the initial configuration; the Business Unit configuration determines what is actually enabled.

This allows future flexibility.

---

# 9. Configuration Precedence

I recommend:

```text
Platform Default
       ↓
Business Type Default
       ↓
Organization Configuration
       ↓
Branch Configuration
       ↓
Business Unit Configuration
```

The most specific applicable configuration wins.

However, we should **not make every setting configurable at every level**.

That would create unnecessary complexity.

Instead, each setting explicitly defines its configuration scope.

---

# 10. Business Unit Inventory

You selected:

> **C — Business Unit has its own inventory.**

Therefore:

```text
Inventory
   ↓
Business Unit
   ↓
Product
```

Stock is not shared between Business Units.

Example:

```text
Supermarket
Coke = 50

Pharmacy
Coke = 10
```

These are separate inventory records.

---

# 11. Product Ownership

You also specified:

> The same product cannot exist in multiple Business Units.

Therefore, products should belong directly to a Business Unit.

```text
products
---------
id
business_unit_id
name
sku
barcode
...
```

The database should enforce uniqueness within the appropriate Business Unit.

For example:

```text
UNIQUE(business_unit_id, sku)
UNIQUE(business_unit_id, barcode)
```

This prevents accidental duplication inside the same operational unit.

---

# 12. Pricing Architecture

You selected:

> **Branch-level pricing**

This requires careful modeling because products belong to Business Units.

Recommended model:

```text
product
   │
   ▼
business unit
   │
   ▼
branch
   │
   ▼
price
```

A product has a base/default price, while branch-level pricing can override it.

Conceptually:

```text
Product Base Price
       ↓
Branch Price Override
       ↓
POS Selling Price
```

This prevents duplicating products simply because their prices differ between branches.

---

# 13. Inventory Model

Inventory should be represented as both:

### Current state

```text
inventory_balances
```

and

### Historical movement

```text
inventory_movements
```

Example:

```text
inventory_balances

product_id
business_unit_id
quantity
reserved_quantity
available_quantity
```

Then:

```text
inventory_movements

SALE
RETURN
ADJUSTMENT
TRANSFER_OUT
TRANSFER_IN
```

This gives us fast current-stock queries while preserving historical information.

---

# 14. Inventory Ledger Principle

Never rely solely on:

```text
quantity = quantity - 1
```

without recording why.

Instead:

```text
Sale
 ↓
Inventory Movement
 ↓
Inventory Balance
```

This makes inventory auditable.

---

# 15. Stock Transfers

Transfers remain simple.

```text
Transfer
├── source_business_unit
├── destination_business_unit
├── status
├── created_by
├── approved_by
└── timestamps
```

Transfer items:

```text
transfer_items
├── transfer_id
├── product_id
└── quantity
```

The transaction should atomically:

1. Verify source stock.
2. Deduct source inventory.
3. Add destination inventory.
4. Record movement.
5. Mark transfer completed.

---

# 16. POS Transaction Architecture

A sale should be treated as a **business transaction**, not simply a row in a `sales` table.

Conceptually:

```text
Sale
│
├── Sale Items
│
├── Payment
│
├── Tax
│
├── Service Charge
│
├── Discount
│
├── Inventory Movements
│
└── Audit Event
```

The backend should execute the critical operation within a database transaction.

---

# 17. Sale Transaction

Example:

```text
BEGIN

Validate user
Validate permissions

Validate products

Validate stock

Calculate prices

Calculate discount

Calculate tax

Calculate service charge

Create sale

Create sale items

Create payment

Deduct inventory

Create inventory movements

Create audit event

COMMIT
```

If something fails:

```text
ROLLBACK
```

No partial sale should remain.

---

# 18. Concurrency Protection

This is particularly important because you initially considered offline operation and correctly decided to remove it.

Now all POS operations go through the server.

Example:

```text
Stock = 1

Cashier A → Sell 1
Cashier B → Sell 1
```

The database must ensure that only one transaction succeeds.

The exact PostgreSQL locking strategy should be determined during implementation, but the architectural requirement is:

> **Inventory validation and inventory deduction must occur atomically.**

---

# 19. Idempotency

Every critical mutation should be protected against duplicate requests.

Example:

```text
POST /sales
Idempotency-Key: abc123
```

If the client retries because of a network interruption, the server must not create two sales.

This is particularly important for:

* Sales
* Refunds
* Subscription payments
* Inventory transfers

---

# 20. Payment Architecture

Customer payments are recorded internally.

```text
Payment
├── sale_id
├── method
├── amount
├── status
├── reference
└── timestamp
```

Methods:

```text
CASH
CARD
BANK_TRANSFER
STORE_CREDIT
```

Paystack is **not** involved in ordinary POS customer payments.

---

# 21. Store Credit Architecture

Store credit should be ledger-based.

Do not simply maintain:

```text
customer.store_credit = 50000
```

as the only source of truth.

Instead:

```text
store_credit_ledger

+5000  Credit issued
-2000  Used for sale
+1000  Refund
```

The balance can be calculated/maintained from these entries.

This gives us auditability.

---

# 22. Layaway Architecture

Layaway should also be ledger-oriented.

```text
Layaway
│
├── Customer
├── Items
├── Total
├── Outstanding
└── Payments
```

Payments:

```text
layaway_payments
```

Each payment is immutable.

---

# 23. Refund Architecture

Refunds should reference the original sale.

```text
Original Sale
      │
      ▼
Refund
      │
      ├── Refund Items
      ├── Refund Payment
      └── Inventory Movement
```

The original transaction remains intact.

---

# 24. RBAC Architecture

Recommended structure:

```text
users
  ↓
user_organizations
  ↓
roles
  ↓
role_permissions
  ↓
permissions
```

Because users can potentially have different responsibilities across branches/business units, scope must also be considered.

For example:

```text
User
 └── Role: Branch Manager
      └── Scope: Abuja Branch
```

versus:

```text
User
 └── Role: Cashier
      └── Scope: Pharmacy Business Unit
```

This will be important when designing the database.

---

# 25. Permission Format

I recommend:

```text
resource.action
```

Examples:

```text
products.create
products.update
products.archive

inventory.view
inventory.adjust
inventory.transfer

sales.create
sales.cancel
sales.refund

customers.create
customers.update

reports.view
reports.export
```

Sensitive operations should have dedicated permissions.

---

# 26. Audit Architecture

Audit events should contain:

```text
id
organization_id
user_id
action
resource_type
resource_id
metadata
ip_address
user_agent
created_at
```

Examples:

```text
SALE_CREATED
REFUND_APPROVED
PRODUCT_UPDATED
ROLE_PERMISSION_CHANGED
INVENTORY_ADJUSTED
SUBSCRIPTION_RENEWED
```

---

# 27. Authentication

Use Supabase Auth for authentication.

The application backend validates the authenticated identity and then resolves:

```text
User
 ↓
Organization
 ↓
Business Unit / Branch
 ↓
Role
 ↓
Permissions
```

The backend remains responsible for authorization.

---

# 28. Database Security

Supabase Row Level Security should be considered an additional security boundary, not the primary application authorization mechanism.

The architecture should use:

```text
Frontend
 ↓
Express authorization
 ↓
Database constraints / RLS
 ↓
PostgreSQL
```

This gives us defense in depth.

---

# 29. Subscription Architecture

Subscription should be organization-level.

```text
organization
      │
      ▼
subscription
```

Subscription contains:

```text
plan
billing_period
price
start_date
end_date
status
```

Statuses could include:

```text
ACTIVE
EXPIRING
EXPIRED
```

---

# 30. Subscription Renewal

Flow:

```text
Owner
 ↓
Select duration
 ↓
Review price
 ↓
Paystack
 ↓
Payment verification
 ↓
Webhook
 ↓
Verify payment
 ↓
Extend subscription
 ↓
Audit
 ↓
Notification
```

Never activate a subscription based solely on the frontend's Paystack response.

The backend must verify the transaction.

---

# 31. Subscription Lock

Every authenticated client request should ultimately be evaluated against subscription status where appropriate.

Expired organization:

```text
LOGIN
  ↓
Subscription check
  ↓
EXPIRED
  ↓
DENY
```

Existing sessions must also become invalid.

Super Admin bypasses this restriction.

---

# 32. Notification Architecture

Use an internal notification model:

```text
notifications
```

with:

```text
user_id
type
title
message
read_at
created_at
```

Email notifications are generated separately.

This allows:

```text
Event
 ↓
Notification
 ├── In-app
 └── Email
```

rather than coupling business logic directly to email delivery.

---

# 33. Email Architecture

Use Resend.

The backend owns email sending.

Example:

```text
SubscriptionService
       ↓
NotificationService
       ↓
EmailService
       ↓
Resend
```

Business logic should never directly call Resend.

---

# 34. Reporting Architecture

Reports should primarily query normalized transactional data.

Avoid creating dozens of duplicated report-specific tables.

For performance, we can later introduce:

* SQL views
* Materialized views
* Aggregation tables

only where profiling demonstrates the need.

This is another way to keep infrastructure free.

---

# 35. File Storage

Supabase Storage can handle:

* Business logos
* Product images
* Receipt assets
* Other business documents where required

Files should be organized by organization/business unit.

Example:

```text
organizations/
  {organization_id}/
    branding/
    products/
```

---

# 36. Search

Do **not** introduce Elasticsearch/Algolia/etc. initially.

PostgreSQL should handle:

* Product search
* SKU search
* Barcode lookup
* Customer search

Indexes should be designed around actual POS query patterns.

For barcode lookup, an indexed exact-match query should be extremely fast.

---

# 37. Caching

Do not introduce Redis immediately.

The initial architecture should use:

* Browser caching
* TanStack Query
* PostgreSQL indexes
* Appropriate HTTP caching

Redis should only be introduced if an actual requirement emerges.

This is important for your **$0–$10 infrastructure target**.

---

# 38. Background Jobs

Avoid BullMQ/Redis initially unless we identify a task that genuinely requires it.

Potential background tasks include:

* Subscription reminder emails
* Report generation
* Notification delivery

Initially these can potentially use platform-native scheduled mechanisms or lightweight scheduled execution depending on the eventual hosting architecture.

---

# 39. AI Architecture

AI should be **architecturally possible**, but AI should not become a core dependency.

The system should expose reporting/data services in a way that future AI functionality can consume them.

Potential future features:

* Natural-language reports
* Sales insights
* Inventory predictions
* Business summaries
* Anomaly detection

But:

> The POS must function completely without AI.

This keeps the MVP affordable.

---

# 40. Frontend Application Structure

Recommended:

```text
src/
├── app/
├── components/
│   ├── ui/
│   ├── layout/
│   └── shared/
│
├── features/
│   ├── pos/
│   ├── products/
│   ├── inventory/
│   ├── customers/
│   ├── sales/
│   ├── reports/
│   ├── employees/
│   ├── settings/
│   └── subscriptions/
│
├── hooks/
├── lib/
├── services/
├── routes/
├── types/
└── utils/
```

The POS should be treated as its own feature/application experience within the React application.

---

# 41. POS UX Architecture

The POS should minimize navigation.

A typical layout:

```text
┌─────────────────────────────────────────────┐
│ Search / Barcode                            │
├───────────────────────┬─────────────────────┤
│                       │                     │
│ Categories / Products │ Cart                │
│                       │                     │
│                       │                     │
│                       ├─────────────────────┤
│                       │ Total               │
│                       │ Payment             │
└───────────────────────┴─────────────────────┘
```

The cashier should be able to perform the majority of transactions without leaving the primary POS screen.

---

# 42. Responsive Design

The application must support:

* Desktop
* Laptop
* Tablet
* Mobile

However, responsive does **not** mean identical UX at every breakpoint.

The POS should adapt its layout to preserve speed.

---

# 43. Design System

Base design:

> **Neutral black/white SaaS foundation**

Business branding becomes a configurable layer:

```text
Base UI
 +
Primary brand color
 +
Secondary brand color
 +
Logo
 +
Brand name
```

Avoid allowing arbitrary branding to destroy accessibility or usability.

The system should enforce contrast requirements where possible.

---

# 44. Deployment Architecture

For independent client deployment:

```text
Client A
├── Frontend
├── Backend
└── Supabase project

Client B
├── Frontend
├── Backend
└── Supabase project
```

This provides strong isolation between clients.

The application codebase can remain the same.

Client-specific differences come from:

```text
Environment variables
+
Database configuration
+
Business configuration
+
Branding
+
Capabilities
```

---

# 45. Deployment Strategy

The exact hosting provider should be chosen after testing the current free-tier limits.

The requirement is:

> Do not choose infrastructure merely because it is popular; choose the architecture that can actually support an Express backend, React frontend and scheduled operations within the budget.

The frontend and backend can potentially be deployed separately if that produces the best free-tier result.

---

# 46. CI/CD Pipeline

GitHub should be the source of truth.

Recommended:

```text
Developer
   ↓
Feature branch
   ↓
Pull Request
   ↓
GitHub Actions
   ├── Install
   ├── Lint
   ├── Typecheck
   ├── Test
   └── Build
          ↓
      Merge
          ↓
      Deployment
```

Environment separation:

```text
Development
     ↓
Staging
     ↓
Production
```

For early development, staging can remain lightweight to avoid unnecessary infrastructure cost.

---

# 47. Environment Variables

Never commit:

* Supabase service keys
* Paystack secret keys
* Resend API keys
* Database credentials
* JWT secrets
* Production secrets

to GitHub.

`.env.example` should contain only placeholders.

---

# 48. Database Migration Strategy

All database changes must be version-controlled.

Never manually modify production databases as the normal development process.

```text
Migration
 ↓
Git
 ↓
CI/CD
 ↓
Environment
```

This becomes particularly important because every client has an independent database.

---

# 49. Independent Client Deployment Challenge

This architecture introduces one major operational issue:

> **How do we update 20 independently deployed client instances?**

The application should therefore be designed so that:

```text
GitHub Release
      ↓
Deployment Pipeline
      ↓
Client A
Client B
Client C
...
```

can eventually be automated.

Likewise, database migrations must be repeatable.

This is one of the most important reasons to establish CI/CD from Day One.

---

# 50. Configuration vs Code

A fundamental rule:

### Configuration

Things that businesses should be able to change:

* Business type
* Branding
* Tax
* Service charge
* Receipt template
* Default payment method
* Roles
* Permissions
* Enabled capabilities
* Pricing
* Inventory thresholds

### Code

Things that define the platform:

* Transaction engine
* Authentication
* Authorization engine
* Database architecture
* Inventory integrity
* Accounting logic
* Audit engine

This separation prevents client-specific customization from turning into custom code branches.

---

# 51. What We Should NOT Build Yet

To keep the project manageable, I strongly recommend avoiding:

* Microservices
* Kubernetes
* Redis
* Elasticsearch
* Kafka
* Dedicated message brokers
* AI APIs
* Complex event sourcing
* Dedicated analytics infrastructure
* Offline storage/sync
* Advanced procurement
* Full ERP accounting

The architecture should be **extensible, not over-engineered**.

---

# 52. Core Database Domain Model

At a high level:

```text
Organization
│
├── Subscription
├── Branding
├── Users
│    └── Roles
│         └── Permissions
│
├── Branches
│    │
│    └── Business Units
│         │
│         ├── Configuration
│         ├── Products
│         │    └── Variants
│         │
│         ├── Inventory
│         │    └── Movements
│         │
│         ├── Sales
│         │    ├── Items
│         │    └── Payments
│         │
│         ├── Customers
│         │    ├── Store Credit
│         │    └── Layaway
│         │
│         └── Reports
│
└── Audit Logs
```

---

# 53. Architectural Invariants

These should be treated almost like laws of the system.

### Invariant 1

A transaction cannot exist without an owning Business Unit.

### Invariant 2

Inventory belongs to a Business Unit.

### Invariant 3

A product belongs to exactly one Business Unit.

### Invariant 4

A completed transaction is immutable.

### Invariant 5

Inventory-changing transactions must be atomic.

### Invariant 6

Refunds reference existing transactions.

### Invariant 7

Sensitive operations require permissions.

### Invariant 8

Expired clients cannot use the application.

### Invariant 9

Super Admin bypasses client subscription restrictions.

### Invariant 10

Offline transactions do not exist.

---

# 54. Recommended Development Order

We should **not** build the POS screen first.

The development sequence should be:

### Phase 0 — Engineering Foundation

* Repository
* Monorepo structure
* TypeScript
* Linting
* Formatting
* GitHub
* CI/CD
* Environment management
* Testing foundation

### Phase 1 — Database Foundation

* Organizations
* Branches
* Business Units
* Business Types
* Capabilities
* Users
* Roles
* Permissions

### Phase 2 — Authentication & Authorization

* Supabase Auth
* Sessions
* RBAC
* Permission middleware
* Scope enforcement

### Phase 3 — Product Engine

* Products
* Categories
* Variants
* Barcodes
* Pricing

### Phase 4 — Inventory

* Inventory balances
* Inventory movements
* Adjustments
* Low stock
* Batch/expiry
* Transfers

### Phase 5 — POS Engine

* Cart
* Checkout
* Discounts
* Tax
* Service charge
* Payments
* Transactions
* Concurrency protection

### Phase 6 — Customers

* Customers
* Store credit
* Layaway

### Phase 7 — Returns & Refunds

* Returns
* Authorization
* Refunds
* Inventory reversal

### Phase 8 — Admin

* Business configuration
* Branding
* Employees
* Roles
* Permissions

### Phase 9 — Accounting & Reports

* Financial calculations
* Reports
* Custom reports
* Exports

### Phase 10 — Notifications & Subscription

* Notifications
* Email
* Subscription
* Paystack
* Expiry locking

### Phase 11 — Hardware & UX Refinement

* Barcode scanners
* Receipt printers
* Customer display
* Responsive optimization

### Phase 12 — Production Hardening

* Security
* Performance
* Database optimization
* Monitoring
* Backup/recovery
* Deployment automation

---

# 55. The Three Areas We Should Design Before Writing Application Code

There are three areas where mistakes would be particularly expensive to correct later:

## 1. Database schema

Especially:

```text
Organization
→ Branch
→ Business Unit
→ Product
→ Inventory
→ Sale
```

## 2. Capability/configuration engine

This determines whether the platform remains genuinely dynamic.

## 3. Transaction engine

This determines whether:

* Inventory remains accurate
* Refunds work correctly
* Store credit works
* Layaway works
* Concurrent sales are safe
* Financial records remain trustworthy

---

## Next Stage