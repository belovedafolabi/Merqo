# Dynamic POS — Application Architecture

We can now move from the database model into the **application architecture**.

The central principle will be:

> **One platform, one codebase, configurable capabilities, and a specialized POS experience.**

The application should not become a giant collection of `if businessType === "restaurant"` conditions. Business type provides defaults; **capabilities and configuration determine behavior**.

---

# 1. Recommended Application Stack

Given your requirements and the strict cost target, I recommend:

### Frontend

* **Next.js**
* **TypeScript**
* **Tailwind CSS**
* **shadcn/ui**
* Responsive web application
* PWA capabilities only where useful, **not offline functionality**

### Backend/Application Layer

* Next.js Server Actions
* Next.js Route Handlers where an HTTP endpoint is genuinely useful
* Supabase PostgreSQL
* PostgreSQL functions/RPC for atomic transactional operations

### Infrastructure

* Supabase

  * PostgreSQL
  * Auth
  * Storage
  * Edge Functions where appropriate
* Vercel
* GitHub
* Resend
* Paystack

### Avoid initially

* Express
* Redis
* BullMQ
* Kafka
* Elasticsearch
* separate API server
* external monitoring platforms

This keeps the architecture much smaller and much cheaper.

---

# 2. Overall Architecture

```text
┌─────────────────────────────────────────────────────┐
│                    CLIENT BROWSER                   │
│                                                     │
│  ┌─────────────────┐       ┌─────────────────────┐ │
│  │   SaaS/Admin UI  │       │      POS UI        │ │
│  └────────┬────────┘       └──────────┬──────────┘ │
│           │                           │            │
└───────────┼───────────────────────────┼────────────┘
            │                           │
            └──────────────┬────────────┘
                           │
                    Next.js Application
                           │
              ┌────────────┴────────────┐
              │                         │
       Server Actions             Route Handlers
              │                         │
              └────────────┬────────────┘
                           │
                    Authorization
                           │
                    Supabase Client
                           │
              ┌────────────┼────────────┐
              │            │            │
          PostgreSQL      Auth        Storage
              │
       Atomic DB Functions
```

---

# 3. Two Major Application Experiences

The application should effectively have two UI systems.

## A. Management Experience

Used for:

* dashboard
* products
* inventory
* customers
* employees
* reports
* configuration
* subscriptions
* audit logs

This is the **SaaS dashboard**.

---

## B. POS Experience

Used for:

* scanning
* searching
* cart
* checkout
* payment
* receipt
* suspended sales
* returns
* refunds

This should be a **specialized retail interface**.

It should prioritize:

> speed > visual decoration > navigation complexity.

---

# 4. Application Modules

I recommend these major modules:

```text
app/
│
├── auth
├── onboarding
├── dashboard
├── pos
├── products
├── inventory
├── customers
├── sales
├── layaways
├── employees
├── reports
├── notifications
├── settings
├── subscriptions
├── audit
└── super-admin
```

---

# 5. Suggested Next.js Structure

Conceptually:

```text
src/
├── app/
│   ├── (auth)/
│   ├── (onboarding)/
│   ├── (dashboard)/
│   ├── pos/
│   └── super-admin/
│
├── components/
│   ├── ui/
│   ├── dashboard/
│   ├── pos/
│   ├── products/
│   ├── inventory/
│   └── customers/
│
├── features/
│   ├── auth/
│   ├── products/
│   ├── inventory/
│   ├── sales/
│   ├── refunds/
│   ├── layaway/
│   ├── customers/
│   ├── reports/
│   ├── subscriptions/
│   └── notifications/
│
├── lib/
│   ├── supabase/
│   ├── authorization/
│   ├── permissions/
│   ├── capabilities/
│   ├── validation/
│   └── utilities/
│
├── actions/
│   ├── sales/
│   ├── inventory/
│   ├── products/
│   └── customers/
│
└── types/
```

The exact directory structure can be adjusted during implementation, but the **feature-oriented separation** should remain.

---

# 6. Don't Build Around Business Types

This is important enough to establish as an architectural rule.

Avoid:

```text
if restaurant:
    showRestaurantFeatures()

if pharmacy:
    showPharmacyFeatures()

if supermarket:
    showSupermarketFeatures()
```

Instead:

```text
Business Type
      ↓
Recommended Capabilities
      ↓
Business Unit Configuration
      ↓
Enabled Capabilities
      ↓
UI + Business Logic
```

So the UI asks:

```text
can("service_charge")
```

rather than:

```text
businessType === "restaurant"
```

---

# 7. Capability System

Create a central capability service.

Conceptually:

```ts
hasCapability(
  businessUnitId,
  "service_charge"
)
```

or:

```ts
capabilities.serviceCharge
```

The capability layer should be usable from:

* server components
* server actions
* route handlers
* UI

But **frontend capability checks are only for UX**.

Security must still be enforced server-side.

---

# 8. Permission System

Similarly:

```ts
hasPermission(
  user,
  "sales.refund"
)
```

A button being hidden is not authorization.

For example:

```text
UI
 ↓
Hide refund button
```

is insufficient.

The server must also enforce:

```text
request refund
 ↓
permission check
 ↓
authorization check
 ↓
database transaction
```

---

# 9. Three Separate Checks

Many operations should pass through three layers:

```text
                    REQUEST
                       │
                       ▼
             ┌───────────────────┐
             │ Subscription      │
             └─────────┬─────────┘
                       ▼
             ┌───────────────────┐
             │ Permission        │
             └─────────┬─────────┘
                       ▼
             ┌───────────────────┐
             │ Capability        │
             └─────────┬─────────┘
                       ▼
                    ACTION
```

Example:

> Cashier wants to apply a discount.

The system checks:

1. Is the subscription active?
2. Does this user have `sales.discount`?
3. Is discounts enabled for this Business Unit?

Only then:

```text
ALLOW
```

---

# 10. Route Protection

The application should have route-level protection.

For example:

```text
/dashboard
/products
/inventory
/reports
/settings
```

require authenticated access.

Then individual pages/actions perform permission checks.

For example:

```text
/products
    ↓
products.view

/products/new
    ↓
products.create
```

---

# 11. POS Route

The POS should have a dedicated route:

```text
/pos
```

It should not inherit the normal dashboard's heavy navigation.

Potential layout:

```text
┌──────────────────────────────────────────────────────┐
│ Business Unit     Cashier       Register      Menu  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  SEARCH / BARCODE                                    │
│  ┌───────────────────────────────────────────────┐   │
│  │ Scan barcode or search product...            │   │
│  └───────────────────────────────────────────────┘   │
│                                                      │
│  PRODUCTS                    │ CART                  │
│                              │                       │
│  [Product] [Product]         │ Coca-Cola      x2    │
│  [Product] [Product]         │ Bread           x1    │
│  [Product] [Product]         │                       │
│                              │ Subtotal             │
│                              │ Discount             │
│                              │ Tax                  │
│                              │ Service Charge       │
│                              │ ───────────────────  │
│                              │ TOTAL                │
│                              │                       │
│                              │ [CHECKOUT]           │
└──────────────────────────────────────────────────────┘
```

---

# 12. POS Should Be Keyboard-Friendly

Barcode scanners frequently behave like keyboards.

Therefore the POS should support:

```text
Barcode scanner
      ↓
Focused search input
      ↓
Barcode detected
      ↓
Product added
      ↓
Cart updated
```

Common keyboard shortcuts can also be supported.

For example:

```text
F2  → Search
F4  → Hold sale
F6  → Customer
F8  → Payment
Esc → Close modal
```

The exact shortcuts can be finalized during UX design.

---

# 13. POS Product Search

Search should support:

```text
Barcode
SKU
Product name
Variant
```

Search behavior should be optimized for:

```text
1. exact barcode
2. exact SKU
3. product name
4. fuzzy/partial search
```

Barcode lookup should be essentially instantaneous.

---

# 14. POS Cart State

The cart is temporary UI state.

It should **not create a database sale** every time the user adds an item.

Instead:

```text
Product selection
      ↓
Client-side cart
      ↓
Checkout
      ↓
Server
      ↓
Atomic transaction
      ↓
Completed Sale
```

This reduces unnecessary database writes.

---

# 15. Important POS Rule

The client must never be trusted for:

```text
price
tax
discount
inventory
total
```

The frontend can calculate these for display.

But when checkout happens:

```text
Frontend
   ↓
Server
   ↓
Fetch authoritative product/pricing data
   ↓
Validate
   ↓
Calculate totals
   ↓
Validate inventory
   ↓
Create transaction
```

This prevents manipulation such as:

```text
Frontend says:

Coca-Cola = ₦500

Actual price:

₦700
```

The server wins.

---

# 16. Checkout Architecture

Checkout should be one atomic operation.

```text
POST / checkout
       │
       ▼
Validate user
       │
       ▼
Validate permission
       │
       ▼
Validate capability
       │
       ▼
Validate products
       │
       ▼
Lock inventory
       │
       ▼
Validate stock
       │
       ▼
Calculate authoritative totals
       │
       ▼
Create sale
       │
       ├── sale items
       ├── payment
       ├── tax
       ├── service charge
       ├── inventory movement
       └── audit log
       │
       ▼
COMMIT
```

If any step fails:

```text
ROLLBACK EVERYTHING
```

---

# 17. Concurrency

This remains one of the highest-risk areas.

Two cashiers:

```text
Cashier A → buys last 2
Cashier B → buys last 2
```

must not both succeed if only two units exist.

The database transaction should lock the inventory row.

Conceptually:

```sql
SELECT *
FROM inventory
WHERE id = ...
FOR UPDATE;
```

Then:

```text
Check quantity
      ↓
Deduct
      ↓
Commit
```

---

# 18. Idempotency

Checkout should require an idempotency key.

Example:

```text
checkout_id = UUID
```

If the same request is submitted twice:

```text
Request A → Sale #000123
Request B → duplicate
```

The system returns the existing transaction rather than creating another sale.

This is particularly important for a POS.

---

# 19. Payment Methods

Normal POS payments:

```text
CASH
CARD
BANK_TRANSFER
STORE_CREDIT
```

The POS should allow the Business Unit to choose its enabled methods.

Example:

```text
Enabled:
✓ Cash
✓ Card
✓ Transfer

Default:
Cash
```

---

# 20. Paystack Separation

Paystack is **not part of normal POS checkout**.

It is only:

```text
Client
 ↓
Subscription renewal
 ↓
Paystack
 ↓
Webhook
 ↓
Verify payment
 ↓
Activate subscription
```

This is a very important architectural boundary.

---

# 21. Cash Payments

For cash:

```text
Total:
₦15,000

Amount received:
₦20,000

Change:
₦5,000
```

The frontend can calculate the change, but the server should validate:

```text
amount_received >= total
```

before completing the sale.

---

# 22. Store Credit

For store credit:

```text
Sale
 ↓
Customer
 ↓
Store Credit Account
 ↓
Check balance
 ↓
Deduct credit
 ↓
Complete sale
```

The balance deduction must occur in the same transaction as the sale.

---

# 23. Layaway

The layaway workflow is different from normal checkout.

```text
Create Layaway
      ↓
Customer required
      ↓
Products recorded
      ↓
Total calculated
      ↓
Initial payment
      ↓
Outstanding balance
```

Subsequent:

```text
Customer
 ↓
Layaway
 ↓
Record payment
 ↓
Update balance
```

When:

```text
balance = 0
```

the layaway becomes completed.

---

# 24. Suspended Sales

Suspending a sale should **not affect inventory**.

```text
Cart
 ↓
Suspend
 ↓
Saved as SUSPENDED
```

Inventory is only affected when:

```text
Checkout
 ↓
COMPLETED
```

This prevents users from holding stock unintentionally.

---

# 25. Returns

A return references the original sale.

```text
Original Sale
     │
     ▼
Return Request
     │
     ▼
Authorization
     │
     ▼
Refund
     │
     ├── Financial adjustment
     ├── Inventory restoration
     └── Audit record
```

Returned quantity cannot exceed the quantity previously sold minus previously returned quantity.

---

# 26. Refund Authorization

Your requirement is:

> Refunds require authorization.

Therefore:

```text
Cashier
 ↓
Request refund
 ↓
Manager/Admin
 ↓
Approve
 ↓
Refund completed
```

The person who requested the refund should not automatically be able to approve it unless the permission model explicitly permits that.

---

# 27. Discount Authorization

You said discounts are supported and asked who can give them.

The permission model should support:

```text
sales.discount
```

and optionally:

```text
sales.discount.override
```

This allows the Owner to decide:

```text
Cashier:
Can give up to 5%

Manager:
Can give up to 20%

Owner:
Unlimited/configured maximum
```

The exact limit should be configurable.

---

# 28. Dashboard Architecture

The management dashboard should be capability-aware.

Instead of every client seeing 40 modules:

```text
Dashboard
Products
Inventory
Customers
Sales
Reports
...
```

the navigation is generated from:

```text
Permissions
+
Capabilities
+
Role
```

Example:

```text
Owner + Supermarket
    ↓
Dashboard
Products
Inventory
Customers
Sales
Layaway
Reports
Employees
Settings
```

Another Business Unit might see a different set.

---

# 29. Dashboard Metrics

The dashboard should initially provide:

### Sales

* Today's sales
* Sales this week
* Sales this month
* Number of transactions
* Average transaction value

### Inventory

* Low-stock products
* Current inventory value
* Recent adjustments
* Recent transfers

### Customers

* New customers
* Active customers
* Store credit outstanding

### Financial

* Cash sales
* Card sales
* Transfer sales
* Store credit sales
* Discounts
* Tax
* Service charges

---

# 30. Reporting Architecture

Reports should operate from authoritative transactional data.

Potential reports:

```text
Sales Report
Product Sales
Category Sales
Payment Method Report
Discount Report
Tax Report
Service Charge Report
Inventory Report
Inventory Movement Report
Refund Report
Layaway Report
Store Credit Report
Employee Sales Report
Branch Report
Business Unit Report
```

---

# 31. Custom Reports

The custom report builder should **not** allow users to write SQL.

Instead:

```text
Select Dataset
      ↓
Select Fields
      ↓
Filters
      ↓
Group By
      ↓
Sort
      ↓
Preview
      ↓
Save Report
```

For example:

```text
Dataset:
Sales

Fields:
Product
Quantity
Revenue

Filter:
Date = Last 30 days

Group:
Product

Sort:
Revenue DESC
```

The backend converts this controlled structure into SQL.

---

# 32. Export

You selected all reporting functionality.

We should support:

```text
CSV
Excel
PDF
```

Initially, exports can be generated on demand.

Don't introduce a dedicated reporting service.

---

# 33. Notifications Architecture

Notifications are event-driven conceptually:

```text
Event
 ↓
Notification service
 ↓
In-app notification
 ↓
Email if configured
```

Examples:

```text
Subscription expiring
Cash variance
Suspicious transaction
New employee
Low inventory
Refund requiring approval
```

The system can initially use PostgreSQL + scheduled server execution rather than introducing Redis/BullMQ.

---

# 34. Scheduled Tasks

We will need scheduled processing for things like:

```text
Subscription expiry reminders
```

The architecture should use the cheapest reliable mechanism available in the deployment environment rather than running a permanent worker.

This is another reason we're avoiding BullMQ/Redis.

---

# 35. Audit Architecture

Important actions should automatically produce audit events.

For example:

```text
User changes product price
        ↓
Database transaction
        ↓
Product updated
        ↓
Audit log created
```

Audit logging should ideally happen close to the database operation rather than relying exclusively on frontend code.

---

# 36. Security Architecture

The security layers become:

```text
HTTPS
 ↓
Supabase Auth
 ↓
Session validation
 ↓
Subscription validation
 ↓
Organization validation
 ↓
Branch validation
 ↓
Business Unit validation
 ↓
RBAC permission
 ↓
Capability
 ↓
PostgreSQL RLS
 ↓
Database transaction
```

There should never be a single authorization layer.

---

# 37. Input Validation

Use a schema validation library such as **Zod**.

For example:

```text
Create Product
      ↓
Zod validation
      ↓
Authorization
      ↓
Database
```

Validation should cover:

* types
* required fields
* numeric limits
* string lengths
* enums
* IDs
* monetary values

---

# 38. Monetary Values

Do **not** use floating-point numbers for money.

Use PostgreSQL:

```text
NUMERIC
```

and appropriate precision.

For example:

```text
NUMERIC(19,4)
```

This avoids errors like:

```text
0.1 + 0.2 = 0.30000000000000004
```

---

# 39. Currency

The initial deployment should have an organization-level currency.

Given the intended Nigerian market, the initial default can be:

```text
NGN
```

but currency should remain configurable in the architecture.

Do not hardcode ₦ throughout the application.

---

# 40. Dates and Time

Store timestamps in:

```text
UTC
```

and display them according to the organization's configured timezone.

This becomes important for:

* daily sales
* reports
* subscription expiry
* audit logs
* branch operations

---

# 41. Error Handling

You chose built-in/free observability.

Therefore:

```text
User action
 ↓
try/catch
 ↓
structured application error
 ↓
safe user-facing message
 ↓
server-side logging
```

Never expose:

```text
PostgreSQL error
stack trace
internal SQL
environment variables
```

to users.

---

# 42. Error Categories

Use predictable application errors:

```text
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
VALIDATION_ERROR
CONFLICT
INSUFFICIENT_STOCK
SUBSCRIPTION_EXPIRED
CAPABILITY_DISABLED
DUPLICATE_REQUEST
INVALID_TRANSACTION
```

This makes the frontend much easier to build.

---

# 43. Performance Architecture

Because this is a POS, performance matters more than flashy animations.

Priorities:

```text
1. Barcode lookup
2. Product search
3. Cart interaction
4. Checkout
5. Page navigation
```

The POS should avoid:

* excessive network requests
* unnecessary re-renders
* huge JavaScript bundles
* loading the entire product database
* expensive dashboard queries on POS pages

---

# 44. Product Loading

Do not load:

```text
10,000 products
```

into the browser.

Instead:

```text
Search
 ↓
Database
 ↓
Top 20 results
```

For barcode:

```text
Exact lookup
 ↓
1 result
```

This keeps the POS fast even as inventory grows.

---

# 45. POS State Management

We should use lightweight client state for:

```text
Current cart
Selected customer
Discount modal
Payment modal
Suspended sale state
UI preferences
```

But the database remains authoritative for:

```text
Prices
Inventory
Sales
Customers
Payments
Permissions
```

This distinction is critical.

---

# 46. Responsive Strategy

The system must work on:

```text
Desktop
Laptop
Tablet
Phone
```

But the interfaces should not necessarily be identical.

### Desktop POS

Two/three-column layout.

### Tablet POS

Compact two-column layout.

### Phone

Stacked layout with cart accessible through a dedicated panel.

---

# 47. Hardware Architecture

### Barcode Scanner

USB/Bluetooth scanners that behave as keyboards require essentially no specialized integration.

```text
Scanner
 ↓
Keyboard input
 ↓
POS search field
```

This is ideal because it works without paid hardware SDKs.

---

# 48. Receipt Printers

This needs more attention.

Browser-based printing can use:

```text
window.print()
```

for ordinary printers.

But thermal receipt printers often have different requirements.

For the first version, we should support:

```text
Browser print
+
optimized receipt templates
```

and investigate direct ESC/POS printing as a later enhancement if the target hardware requires it.

This avoids prematurely introducing a desktop bridge application.

---

# 49. Customer Display

The architecture should allow a second display mode later:

```text
/pos/customer-display/{session}
```

The POS sends:

```text
Product
Quantity
Price
Subtotal
Total
```

to the customer-facing screen.

Because this is a browser-based system, this can eventually be implemented with realtime communication.

---

# 50. AI Architecture

You requested AI to be considered **from the architecture stage**, but not necessarily included as an expensive dependency.

Therefore, we should create an abstraction:

```text
AI Service
   │
   ├── Sales insights
   ├── Inventory insights
   ├── Report explanations
   └── Future assistants
```

The core application must never depend on AI to function.

If AI is unavailable:

```text
POS → continues normally
```

This is important for reliability and cost control.

---

# 51. AI Should Not Make Transaction Decisions

AI should never independently decide:

* whether a sale succeeds
* inventory quantity
* refund approval
* discount authorization
* tax
* subscription status
* user permissions

Those remain deterministic system rules.

AI can **assist**, not become the source of truth.

---

# 52. Suggested AI Features Later

Potential future features:

### "Why did sales drop this month?"

AI analyzes approved reporting data.

### "Which products are selling fastest?"

AI summarizes sales trends.

### "Show me unusual transactions."

AI helps identify patterns.

### "Create a sales report for July."

AI translates natural language into a safe report definition.

This fits your architecture without making AI a core dependency.

---

# 53. CI/CD Pipeline

The first production pipeline should be:

```text
Developer
   ↓
Feature branch
   ↓
Pull Request
   ↓
──────────────
Lint
Typecheck
Unit Tests
Build
──────────────
   ↓
Code Review
   ↓
Merge
   ↓
Production Deployment
```

---

# 54. Database CI/CD

Database migrations must be treated like code.

```text
Migration
 ↓
Git
 ↓
Review
 ↓
CI
 ↓
Staging/Development
 ↓
Production
```

Never make undocumented manual production schema changes.

---

# 55. Testing Pyramid

Your decision was to test everything except dedicated POS transaction tests.

I would structure it as:

```text
                 E2E
                /   \
          Integration
             /       \
          Unit Tests
```

### Unit

* calculations
* permissions
* capability resolution
* validation
* report definitions

### Integration

* Supabase queries
* RLS
* inventory
* refunds
* layaway
* subscriptions

### E2E

* login
* onboarding
* product creation
* employee management
* reporting
* subscription renewal

---

# 56. One Recommendation I Want to Make

Even though you excluded **POS transaction tests**, I strongly recommend that we don't interpret that as:

> "Don't test checkout."

The POS is the most financially sensitive component.

We should at minimum test the **underlying transactional database functions**, even if we don't build a large browser-based POS E2E test suite.

For example:

```text
create_sale()
```

must be tested for:

* insufficient inventory
* concurrent sale
* invalid price
* duplicate idempotency key
* invalid payment
* unauthorized discount
* failed transaction rollback

These are not merely UI tests; they're **financial integrity tests**.

I would consider these essential rather than optional.

---

# 57. Final Application Architecture

The architecture now looks like:

```text
                         USER
                           │
             ┌─────────────┴─────────────┐
             │                           │
       MANAGEMENT UI                 POS UI
             │                           │
             └─────────────┬─────────────┘
                           │
                      Next.js
                           │
             ┌─────────────┴─────────────┐
             │                           │
       Server Actions              Route Handlers
             │                           │
             └─────────────┬─────────────┘
                           │
                 Authorization Layer
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   Subscription          RBAC           Capabilities
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                    Supabase Client
                           │
                     PostgreSQL
                           │
              ┌────────────┼────────────┐
              │            │            │
          RLS Policies   Functions    Triggers
              │            │            │
              └────────────┼────────────┘
                           │
              Atomic Transaction System
```

---

# 58. What We Have Now

At this point, we have established the two most important architectural layers:

### Database architecture

We have defined:

* organizations
* branches
* business units
* business types
* capabilities
* RBAC
* products
* product masters
* business-unit catalogs
* variants
* pricing
* inventory
* inventory movements
* stock transfers
* customers
* store credit
* sales
* payments
* refunds
* layaway
* taxes
* service charges
* receipts
* notifications
* audit logs
* subscriptions

### Application architecture

We have defined:

* Next.js application
* specialized POS interface
* management dashboard
* Server Actions
* Route Handlers
* Supabase
* PostgreSQL functions
* RLS
* RBAC
* capability system
* subscription enforcement
* concurrency protection
* idempotency
* CI/CD
* testing
* low-cost infrastructure
* future AI abstraction

---