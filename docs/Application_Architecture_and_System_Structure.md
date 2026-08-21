# Stage 17 — Application Architecture & System Structure

Now we move from **database/security architecture** into how the actual application will be structured.

The guiding constraint remains:

> **The system should provide a comprehensive POS platform while targeting $0 operating cost during development and a maximum of roughly $10/month for production infrastructure where unavoidable.**

Because you chose **independent deployment per client**, we should optimize the architecture around a **single-client deployment model**, rather than designing a complex shared SaaS infrastructure.

---

# 17.1 Recommended High-Level Architecture

I recommend:

```text
                         CLIENT
                           │
                ┌──────────┴──────────┐
                │                     │
          Admin Dashboard          POS Interface
                │                     │
                └──────────┬──────────┘
                           │
                           ↓
                    Next.js Application
                           │
             ┌─────────────┼─────────────┐
             │             │             │
             ↓             ↓             ↓
          Supabase      Server/API     Resend
             │             │
      ┌──────┼──────┐      │
      │      │      │      │
     DB    Auth   Storage  │
      │                     │
      └──────────┬──────────┘
                 │
              Paystack
          (Subscription only)
```

There is one important architectural adjustment:

**We should avoid introducing a traditional Express backend unless a concrete requirement emerges for one.**

Supabase + Next.js server-side functionality can handle the initial system while keeping the infrastructure extremely cheap.

---

# 17.2 Why I Recommend This

Your original stack direction was:

> Supabase-ERN

If by ERN you mean:

```text
Express
React
Node
```

then adding Express creates another persistent application that has to be hosted.

That introduces:

* another deployment
* another service
* another security boundary
* another environment
* another monitoring requirement
* additional cost/complexity

For this particular POS, that isn't necessary at the beginning.

Instead:

```text
React/Next.js
      ↓
Next.js Server Functions / Route Handlers
      ↓
Supabase
```

gives us the equivalent server-side capabilities without maintaining a separate Node server.

---

# 17.3 Recommended Stack

### Frontend

```text
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
```

### Backend/Data

```text
Supabase
PostgreSQL
Supabase Auth
Supabase Storage
Supabase Realtime
```

### Server-side application logic

```text
Next.js Server Components
Next.js Server Actions
Next.js Route Handlers
```

### Email

```text
Resend
```

### Subscription payments

```text
Paystack
```

### Source control

```text
GitHub
```

### CI/CD

```text
GitHub Actions
```

---

# 17.4 System Layers

We should structure the application into clear layers.

```text
┌──────────────────────────────────────┐
│              UI Layer                │
│ React / Next.js / shadcn             │
├──────────────────────────────────────┤
│          Application Layer           │
│ Actions / Use Cases / Services       │
├──────────────────────────────────────┤
│         Authorization Layer          │
│ RBAC / Permissions / Scope           │
├──────────────────────────────────────┤
│          Data Access Layer           │
│ Supabase Client / Queries            │
├──────────────────────────────────────┤
│           PostgreSQL                 │
│ RLS / Constraints / Transactions     │
└──────────────────────────────────────┘
```

This separation is important because the POS will eventually become large.

---

# 17.5 Two Major Interfaces

Although this is one application, there are effectively two major user experiences.

## A. POS

Designed for speed.

```text
/POS
```

## B. Management Dashboard

Designed for configuration, management and analytics.

```text
/dashboard
```

They should **not feel like the same interface**.

---

# 17.6 POS Interface

The POS should prioritize:

```text
Speed
Keyboard interaction
Barcode scanning
Minimal clicks
Large touch targets
Fast search
Clear cart
Fast checkout
```

The interface should avoid unnecessary dashboard UI.

Conceptually:

```text
┌───────────────────────────────────────────┐
│ Search / Scan                             │
├───────────────────────────┬───────────────┤
│                           │               │
│ Product Grid              │ Cart          │
│                           │               │
│ [Product] [Product]       │ Item ×2       │
│ [Product] [Product]       │ Item ×1       │
│ [Product] [Product]       │               │
│                           │               │
│                           │ TOTAL         │
│                           │               │
│                           │ CHECKOUT      │
└───────────────────────────┴───────────────┘
```

---

# 17.7 Management Dashboard

The dashboard can use the modern SaaS style you selected.

```text
Dashboard
│
├── Overview
├── Sales
├── Products
├── Inventory
├── Customers
├── Layaway
├── Store Credit
├── Employees
├── Reports
├── Analytics
├── Notifications
├── Settings
└── Subscription
```

Features that aren't enabled for a business shouldn't unnecessarily clutter its navigation.

---

# 17.8 Dynamic Navigation

This is where our capability architecture becomes useful.

Instead of:

```text
if restaurant:
    show restaurant menu
```

we use:

```text
capabilityEnabled("restaurant_orders")
```

Then:

```text
Restaurant
 → Orders
 → Kitchen
```

can appear.

Whereas:

```text
Supermarket
 → POS
 → Inventory
 → Products
```

might be the default.

---

# 17.9 Feature Configuration

There are three conceptual levels:

```text
Business Type
      ↓
Default Capabilities
      ↓
Business Configuration
```

Example:

```text
Business Type = Restaurant
```

might initially configure:

```text
POS                  ON
Inventory             ON
Customers             ON
Restaurant Orders     ON
Kitchen               ON
Service Charge        ON
```

The Owner can then configure available capabilities according to what we've decided should be configurable.

---

# 17.10 Don't Make Features Dynamically Loaded

A crucial architectural distinction:

We should **not dynamically download entire application modules** based on the business type.

The codebase contains the capabilities.

Configuration determines whether they are accessible.

```text
Codebase
 ├── POS
 ├── Inventory
 ├── Restaurant
 ├── Pharmacy
 ├── Reporting
 └── etc.
```

Configuration determines:

```text
enabled = true/false
```

This keeps deployments predictable.

---

# 17.11 Routing Structure

A possible Next.js structure:

```text
app/
├── (auth)/
│   ├── login/
│   └── onboarding/
│
├── (pos)/
│   └── pos/
│
├── dashboard/
│   ├── overview/
│   ├── sales/
│   ├── products/
│   ├── inventory/
│   ├── customers/
│   ├── employees/
│   ├── reports/
│   ├── analytics/
│   ├── notifications/
│   ├── settings/
│   └── subscription/
│
├── super-admin/
│
└── api/
```

---

# 17.12 Super Admin Application

You have a unique requirement:

> Super Admin has untethered access.

The Super Admin interface should therefore be separated conceptually from the client's dashboard.

```text
/super-admin
```

It can contain:

```text
Overview
Businesses
Deployments
Subscriptions
Subscription Pricing
System Configuration
System Audit
System Health
```

---

# 17.13 Independent Deployment Model

Each client gets:

```text
Deployment A
 ├── Application
 ├── Supabase project
 └── Client configuration
```

Another client:

```text
Deployment B
 ├── Application
 ├── Supabase project
 └── Client configuration
```

This means client data is physically separated.

This is a **major security advantage**.

---

# 17.14 But There Is an Important Consequence

Your Super Admin wants untethered access across deployments.

If every deployment has its own Supabase project/database, the Super Admin cannot simply query all businesses from one database.

Therefore, the architecture needs a **central control plane** eventually.

Conceptually:

```text
                    SUPER ADMIN
                         │
                         ↓
                 Control Plane
                         │
          ┌──────────────┼──────────────┐
          ↓              ↓              ↓
      Client A        Client B       Client C
      Supabase        Supabase       Supabase
```

This is important.

---

# 17.15 Do We Need the Control Plane Immediately?

**No.**

For the MVP, we can keep this simple.

Each deployment can have its own client data.

The Super Admin management mechanism can initially operate through controlled deployment administration.

But if your long-term goal is:

> centrally manage all deployed clients

then a lightweight control plane should eventually be introduced.

---

# 17.16 Control Plane Architecture

Later:

```text
Super Admin Portal
        │
        ↓
Central Supabase
        │
        ├── Client A metadata
        ├── Client B metadata
        ├── Client C metadata
        └── Subscription records
```

The central database would **not necessarily contain client transactional data**.

It could contain:

```text
deployment
business
subscription
plan
deployment URL
deployment status
```

while the client's actual POS data remains in its own Supabase project.

This preserves the independent-deployment model.

---

# 17.17 Subscription Architecture

This creates a clean separation:

```text
Client POS
     │
     ↓
Central Subscription Service
     │
     ↓
Paystack
```

Paystack is only responsible for subscription renewal.

Client POS transactions:

```text
Cash
Card
Transfer
Store Credit
```

remain entirely inside the client's POS environment.

---

# 17.18 Application State

We should avoid putting everything into global state.

Recommended approach:

### Server state

Use:

```text
Supabase
```

for persistent state.

### Local UI state

Use:

```text
React state
```

for simple interface state.

### Complex client state

Use a lightweight store such as:

```text
Zustand
```

only where genuinely necessary.

---

# 17.19 POS Cart State

The POS cart is a good candidate for client-side state.

Example:

```text
cart
├── product
├── quantity
├── price
├── discount
└── calculated total
```

But:

> The client-side total must never be trusted as the authoritative transaction total.

At checkout, the server/database validates the transaction.

---

# 17.20 Server-Side Transaction Creation

The ideal flow:

```text
POS
 ↓
Submit checkout
 ↓
Server validation
 ↓
Validate products
 ↓
Validate prices
 ↓
Validate inventory
 ↓
Validate discount
 ↓
Calculate tax
 ↓
Calculate service charge
 ↓
Create sale
 ↓
Create sale items
 ↓
Create payment
 ↓
Update inventory
 ↓
Create audit record
 ↓
Return receipt
```

These operations should happen atomically where appropriate.

---

# 17.21 Why This Matters

Never allow the browser to simply submit:

```text
total = ₦5,000
```

and tell the database:

> "Record this sale."

The server must calculate/validate the authoritative result.

Otherwise a malicious user could modify the request.

---

# 17.22 Database Transactions

Checkout should be treated as a transactional operation.

Conceptually:

```text
BEGIN
   ↓
Validate sale
   ↓
Create sale
   ↓
Create sale items
   ↓
Create payment
   ↓
Deduct inventory
   ↓
Create audit record
   ↓
COMMIT
```

If one critical operation fails:

```text
ROLLBACK
```

---

# 17.23 Concurrency

You specifically requested concurrency checks.

Consider:

```text
Stock = 1
```

Two cashiers attempt to sell it simultaneously.

Without proper concurrency control:

```text
Cashier A → sees 1
Cashier B → sees 1

A sells → 0
B sells → -1
```

We need database-level protection.

The authoritative inventory operation should atomically verify and decrement available stock.

---

# 17.24 API Structure

Instead of a giant API:

```text
/api/do-everything
```

use domain-oriented endpoints/actions.

For example:

```text
/api/products
/api/inventory
/api/sales
/api/refunds
/api/customers
/api/layaways
/api/reports
/api/subscription
```

However, not every operation needs a REST endpoint.

Server Actions can be used for internal application mutations where appropriate.

---

# 17.25 Recommended Rule

Use:

### Server Actions

For:

* internal application mutations
* dashboard forms
* authenticated business operations

### Route Handlers

For:

* webhooks
* external integrations
* public API endpoints
* requests requiring explicit HTTP endpoints

This keeps the application simpler.

---

# 17.26 Paystack

Paystack should have a very isolated integration layer.

```text
lib/
└── integrations/
    └── paystack/
```

Only subscription functionality should use it.

```text
initialize subscription payment
verify payment
process webhook
activate subscription
```

No product sale should call Paystack under the current requirements.

---

# 17.27 Resend

Similarly:

```text
lib/
└── integrations/
    └── resend/
```

Email service responsibilities:

```text
Subscription expiry
Subscription renewal
Employee notifications
Security notifications
System notifications
```

The admin email should receive subscription-related alerts.

---

# 17.28 Email Scheduling

You requested:

> Beginning 7 days before expiration, email every 2 days.

That means:

```text
7 days
5 days
3 days
1 day
```

Then expiration.

This should be handled by a scheduled server-side process.

---

# 17.29 Background Jobs

We previously considered Redis/BullMQ in your other project architecture.

For this POS, I **do not recommend introducing Redis/BullMQ initially**.

Why?

Your priority is:

> Free / maximum ~$10 infrastructure.

Adding Redis creates unnecessary infrastructure.

Instead, scheduled tasks can initially use the hosting provider's cron/scheduling capabilities where available, or a lightweight scheduled mechanism appropriate to the final hosting choice.

---

# 17.30 Supabase Realtime

Supabase Realtime is useful for things like:

```text
Kitchen orders
Notifications
Inventory updates
Multiple POS terminals
```

But it should be used selectively.

Don't subscribe every screen to every database table.

That would create unnecessary load.

---

# 17.31 Example

If a restaurant has:

```text
POS
Kitchen Display
Admin Dashboard
```

the Kitchen Display could subscribe to relevant order changes.

The entire application doesn't need a global realtime subscription.

---

# 17.32 File Storage

Supabase Storage should handle:

```text
Business logos
Product images
Receipt assets
Potential future documents
```

Storage buckets should be private unless a specific asset genuinely needs public access.

---

# 17.33 Product Images

A product image should not be stored directly in PostgreSQL.

Store:

```text
image → Supabase Storage
```

and:

```text
product.image_path
```

in PostgreSQL.

---

# 17.34 Caching

We should be conservative.

The POS needs speed, but caching everything creates consistency problems.

Good candidates for caching:

```text
Business configuration
Permissions
Categories
Static capability configuration
```

Bad candidates for aggressive caching:

```text
Inventory quantity
Current sale state
Payment status
Subscription status
```

---

# 17.35 POS Performance

The POS should minimize network requests.

For example, don't do:

```text
Scan barcode
 ↓
request product
 ↓
request price
 ↓
request inventory
 ↓
request category
```

Instead, retrieve the necessary operational information efficiently.

---

# 17.36 Search

Barcode search should be extremely fast.

The database should have indexes on:

```text
barcode
SKU
```

For normal product search, PostgreSQL search capabilities should be used before introducing an external search engine.

We do **not** need Elasticsearch/Algolia for the initial system.

That would violate the cost/complexity target.

---

# 17.37 Error Handling

The application should have a standardized error structure.

For example:

```text
VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
CONFLICT
INSUFFICIENT_STOCK
SUBSCRIPTION_EXPIRED
PAYMENT_FAILED
INTERNAL_ERROR
```

This makes frontend handling predictable.

---

# 17.38 Concurrency Errors

A concurrency conflict should not simply appear as:

```text
Something went wrong.
```

The POS should receive something meaningful:

> "This product was just sold by another terminal. Available stock is now 0."

This is particularly important in multi-terminal environments.

---

# 17.39 Environment Structure

We should have:

```text
.env.local
.env.example
```

Production secrets should never be committed.

Important variables will include things like:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
PAYSTACK_SECRET_KEY
PAYSTACK_PUBLIC_KEY
```

Only genuinely public values receive the `NEXT_PUBLIC_` prefix.

---

# 17.40 Secret Management

Never expose:

```text
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
PAYSTACK_SECRET_KEY
```

to the browser.

The service-role key is particularly sensitive because it can bypass normal RLS protections.

---

# 17.41 GitHub

Repository:

```text
GitHub
   │
   ├── main
   ├── develop
   └── feature/*
```

We can simplify this if desired, but I recommend at least:

```text
main
feature/*
```

for the MVP.

---

# 17.42 CI/CD

Since you explicitly selected **CI/CD from Day One**, we should establish it before significant feature development.

Basic pipeline:

```text
Push / Pull Request
        ↓
Install dependencies
        ↓
Lint
        ↓
Type check
        ↓
Unit tests
        ↓
Build
        ↓
Deploy
```

---

# 17.43 Pull Requests

A PR should not be merged if:

```text
❌ lint fails
❌ type checking fails
❌ tests fail
❌ production build fails
```

This prevents broken code from reaching production.

---

# 17.44 Deployment

Given the cost constraint, **Vercel remains a strong candidate for the Next.js application**, but we should not blindly lock it in yet.

The final hosting decision needs to consider:

* cron/scheduled jobs
* server execution limits
* Next.js compatibility
* bandwidth
* build limits
* independent client deployments
* Supabase limits
* commercial usage
* whether the free tier remains appropriate for the intended deployment model

We will formally evaluate hosting in a later architecture stage.

---

# 17.45 Cost Architecture

The initial target should be:

```text
Next.js hosting       $0
Supabase              $0
GitHub                $0
GitHub Actions        $0
Resend                $0
Paystack              Transaction-based
Domain                Existing
Redis                 $0
External monitoring   $0
```

The goal is therefore:

> **$0/month infrastructure wherever the free tiers can legitimately support the deployment.**

The ~$10 ceiling becomes the fallback rather than the target.

---

# 17.46 Important Cost Warning

The biggest potential problem is **independent deployment for every client**.

If you eventually have:

```text
100 clients
```

and every client receives:

```text
1 Vercel project
+
1 Supabase project
```

free-tier limits may become the dominant architectural constraint.

Therefore:

> The independent-deployment model is excellent for isolation, but it needs a deployment-management strategy as the client count grows.

We should design the application so that deployments can later move to paid/self-hosted infrastructure without rewriting the application.

---

# 17.47 Recommended Repository Structure

A good starting structure:

```text
pos/
│
├── app/
│   ├── (auth)/
│   ├── (pos)/
│   ├── dashboard/
│   ├── super-admin/
│   └── api/
│
├── components/
│   ├── ui/
│   ├── pos/
│   ├── dashboard/
│   └── shared/
│
├── features/
│   ├── sales/
│   ├── products/
│   ├── inventory/
│   ├── customers/
│   ├── layaway/
│   ├── store-credit/
│   ├── employees/
│   ├── reports/
│   ├── subscriptions/
│   └── capabilities/
│
├── lib/
│   ├── supabase/
│   ├── auth/
│   ├── permissions/
│   ├── validations/
│   ├── calculations/
│   ├── integrations/
│   │   ├── paystack/
│   │   └── resend/
│   └── utils/
│
├── hooks/
│
├── types/
│
├── tests/
│
├── supabase/
│   ├── migrations/
│   ├── seed/
│   └── functions/
│
└── docs/
```

---

# 17.48 Feature-Based Architecture

I particularly recommend organizing business logic by **feature/domain**, rather than putting everything into generic folders.

Instead of:

```text
services/
controllers/
models/
utils/
```

with hundreds of unrelated files, use:

```text
features/
├── sales/
├── inventory/
├── products/
└── customers/
```

Each feature owns its relevant logic.

This will become extremely useful as the platform grows.

---

# 17.49 Final Architecture

The architecture we've reached is:

```text
                    USERS
                      │
                      ↓
              Next.js Application
                      │
          ┌───────────┴───────────┐
          ↓                       ↓
       POS UI                Admin UI
          │                       │
          └───────────┬───────────┘
                      ↓
             Application Logic
                      │
             ┌────────┴────────┐
             ↓                 ↓
         Supabase          Integrations
             │                 │
      ┌──────┼──────┐      ┌───┴────┐
      ↓      ↓      ↓      ↓        ↓
   Postgres Auth Storage Paystack  Resend
      │
      ↓
     RLS
```

And surrounding everything:

```text
GitHub
  ↓
CI/CD
  ↓
Deployment
```

---