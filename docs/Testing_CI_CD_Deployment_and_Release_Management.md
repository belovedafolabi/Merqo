# Stage 32 — Testing, CI/CD, Deployment & Release Management

This stage defines how the Dynamic POS will be **built, tested, deployed, updated, and maintained**. Since you decided on **GitHub + basic CI/CD from Day One**, these processes should exist from the beginning rather than being added after development.

---

## 32.1 Development Philosophy

The project should follow:

> **Build → Validate → Test → Review → Deploy**

No feature should be considered complete merely because it works locally.

A feature is complete when:

1. It works.
2. It passes its relevant tests.
3. It passes lint/type checks.
4. It doesn't introduce regressions.
5. It can safely be deployed.

---

# 32.2 Source Control

**GitHub** will be the source-control platform.

The repository should contain:

```text
main
develop
feature/*
fix/*
chore/*
```

The exact branching strategy can remain lightweight.

Because this is a relatively large system, avoid an unnecessarily complicated Git workflow.

---

# 32.3 Main Branch

`main` represents:

> **Production-ready code.**

Only tested and reviewed changes should reach `main`.

Direct pushes to `main` should be disabled.

---

# 32.4 Feature Branches

New work should normally use:

```text
feature/product-management
feature/customer-credit
feature/report-builder
feature/subscription
```

Bug fixes:

```text
fix/refund-calculation
fix/inventory-race-condition
```

---

# 32.5 Pull Requests

Changes should enter protected branches through Pull Requests.

A PR should trigger automated validation before merge.

Minimum checks:

```text
Lint
Type checking
Unit tests
Build
```

---

# 32.6 Basic CI/CD

You explicitly selected:

> **Basic CI/CD from Day One.**

Therefore we don't need an elaborate DevOps infrastructure.

The initial pipeline can be:

```text
Git Push / PR
      ↓
GitHub Actions
      ↓
Install dependencies
      ↓
Lint
      ↓
Type check
      ↓
Tests
      ↓
Build
      ↓
Deploy
```

---

# 32.7 GitHub Actions

GitHub Actions should handle CI.

The pipeline should use the project's package manager consistently.

Since you commonly use **pnpm**, the project should standardize on pnpm rather than mixing package managers.

---

# 32.8 Dependency Installation

CI should use the lockfile to guarantee reproducible installations.

Conceptually:

```text
pnpm install --frozen-lockfile
```

This prevents CI from silently changing dependency versions.

---

# 32.9 Linting

Every PR should run linting.

The objective is to catch:

* Invalid patterns
* Unused variables
* Unsafe code
* Formatting inconsistencies
* Framework-specific issues

Lint failure should block merging.

---

# 32.10 Type Checking

Because the stack uses TypeScript, type checking is mandatory.

CI should execute the equivalent of:

```text
pnpm typecheck
```

No TypeScript errors should reach production.

---

# 32.11 Build Verification

The production application must successfully build in CI.

This catches problems such as:

* Invalid imports
* Missing environment variables
* Server/client boundary issues
* Framework build errors
* Incorrect configuration

---

# 32.12 Testing Strategy

You previously selected **all testing categories except POS transaction tests**.

However, there's an important distinction:

You excluded a dedicated category called **"POS transaction tests"**, but this does **not** mean the transaction engine should be left untested.

The critical transaction logic should still receive appropriate unit/integration coverage because it is one of the highest-risk parts of the application.

We simply won't create a separate oversized testing category around it.

---

# 32.13 Unit Testing

Unit tests should cover isolated business logic.

Examples:

```text
Tax calculation
Discount calculation
Service charge calculation
Tip calculation
Stock calculation
Store credit calculation
Layaway balance calculation
Subscription countdown
Permission evaluation
Report filters
```

---

# 32.14 Integration Testing

Integration tests verify that multiple components work together.

Examples:

```text
API → Database
Auth → Authorization
Transaction → Inventory
Refund → Inventory
Layaway → Customer
Store Credit → Customer Ledger
Subscription → Payment verification
```

---

# 32.15 API Testing

Critical API endpoints should be tested for:

* Valid requests
* Invalid requests
* Unauthorized requests
* Forbidden requests
* Missing data
* Duplicate requests
* Concurrent requests
* Database failures

---

# 32.16 Authorization Testing

Authorization is particularly important because of the granular RBAC architecture.

Tests should verify:

```text
Cashier
  ↓
Can sell
Cannot manage employees
Cannot change system settings
Cannot modify protected reports
```

while:

```text
Owner
  ↓
Can manage permitted business resources
```

and:

```text
Super Admin
  ↓
Can access client deployments independently
```

---

# 32.17 RLS Testing

Supabase Row Level Security should be tested explicitly.

The objective is to prove that unauthorized users cannot retrieve records merely by manipulating request parameters.

For example:

```text
User A
 ↓
Wuse Branch
```

must not be able to request:

```text
Maitama Branch data
```

unless their permissions explicitly allow it.

---

# 32.18 Inventory Testing

Inventory tests should cover:

* Stock addition
* Stock deduction
* Stock adjustment
* Stock transfer
* Stock reservation
* Stock release
* Low-stock calculation
* Out-of-stock behaviour
* Concurrent stock changes

---

# 32.19 Customer Credit Testing

Store credit should be tested for:

* Credit creation
* Credit usage
* Credit adjustment
* Insufficient credit
* Refund-to-credit
* Ledger integrity
* Concurrent usage

---

# 32.20 Layaway Testing

Layaway should test:

```text
Create layaway
Initial payment
Subsequent payment
Outstanding balance
Full payment
Cancellation
Inventory reservation
Inventory release
```

---

# 32.21 Subscription Testing

Subscription testing should cover:

* Monthly subscription
* Quarterly subscription
* Semi-annual subscription
* Annual subscription
* Payment verification
* Duplicate payment callback
* Expiry
* 7-day warning
* Reminder scheduling
* Client lock
* Session invalidation
* Super Admin exemption
* Renewal after expiration

---

# 32.22 Audit Testing

Tests should verify that important actions create audit entries.

For example:

```text
Refund
 ↓
Transaction updated
 ↓
Audit entry created
```

If the audit operation is required for an operation's integrity, failure should be handled appropriately rather than silently ignored.

---

# 32.23 End-to-End Testing

E2E tests should simulate real user workflows.

Examples:

### Sale

```text
Login
 ↓
Open POS
 ↓
Search product
 ↓
Add product
 ↓
Checkout
 ↓
Select payment
 ↓
Complete sale
 ↓
Receipt
```

### Refund

```text
Login
 ↓
Find transaction
 ↓
Request refund
 ↓
Authorization
 ↓
Complete refund
 ↓
Inventory updated
```

### Subscription

```text
Admin login
 ↓
Subscription
 ↓
Select duration
 ↓
Pay
 ↓
Payment verified
 ↓
Subscription extended
```

---

# 32.24 Browser Testing

The responsive application should be tested on:

* Chrome
* Edge
* Firefox
* Safari where practical

The POS should receive particular attention because browser behaviour can affect scanners, printing and keyboard interaction.

---

# 32.25 Responsive Testing

Test at minimum:

```text
Desktop
Laptop
Tablet
Mobile
```

The POS and Admin dashboard should not be treated as identical responsive layouts.

---

# 32.26 Hardware Testing

Hardware testing should cover:

### Barcode scanners

* Rapid scanning
* Repeated scanning
* Unknown barcode
* Duplicate barcode
* Keyboard focus

### Printers

* Receipt layout
* Long receipt
* Empty/invalid print request
* Print failure

### Customer display

* Cart synchronization
* Price updates
* Transaction completion
* Reset after sale

---

# 32.27 Test Environments

The project should have at least:

```text
Development
Staging
Production
```

### Development

Used locally by developers.

### Staging

Used for integration testing and release validation.

### Production

Real client deployment.

---

# 32.28 Environment Variables

Each environment should have its own configuration.

Examples:

```text
Development
Staging
Production
```

Secrets should never be committed to GitHub.

---

# 32.29 Environment Files

The repository may contain:

```text
.env.example
```

containing variable names and safe placeholders.

Actual secrets remain outside source control.

---

# 32.30 Production Secrets

Production secrets should be configured through the hosting/provider secret-management mechanisms.

Never:

```text
commit .env
```

or place secret credentials inside source code.

---

# 32.31 Deployment Architecture

Given the current decisions, the recommended starting architecture is:

```text
                     GitHub
                        │
                        ▼
                 GitHub Actions
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
          Validation             Build
                                  │
                                  ▼
                               Vercel
                                  │
                                  ▼
                           Next.js Application
                                  │
                     ┌────────────┴────────────┐
                     ▼                         ▼
                Supabase                    Resend
                     │
             ┌───────┼────────┐
             ▼       ▼        ▼
           Auth      DB     Storage
```

Paystack is only connected to the **subscription billing workflow**.

---

# 32.32 Why Vercel

Vercel is a strong fit for the frontend/application layer because:

* It works naturally with Next.js.
* Deployment is straightforward.
* GitHub integration is strong.
* Preview deployments are useful.
* The initial free tier can support development and early deployments.

However, the architecture should avoid depending on paid Vercel-only capabilities.

---

# 32.33 Supabase Responsibilities

Supabase should primarily handle:

```text
PostgreSQL
Authentication
Row Level Security
Storage
Database access
```

The system should avoid unnecessarily duplicating these capabilities with other paid infrastructure.

---

# 32.34 No Redis Requirement by Default

Because the architecture has changed significantly from some of your earlier projects:

* No offline synchronization
* No BullMQ requirement
* No persistent queue requirement
* No complex background worker architecture

Redis should **not automatically be introduced** unless a genuine requirement emerges.

This helps maintain the ≤$10/month target.

---

# 32.35 Background Jobs

Some operations may eventually require scheduled/background execution, especially:

* Subscription reminder emails
* Cleanup
* Scheduled notifications

These should initially use the cheapest available native/platform mechanism rather than introducing a dedicated paid worker infrastructure.

---

# 32.36 Email Architecture

Email should remain centralized:

```text
Application
     ↓
Email Service
     ↓
Resend
```

The application should not scatter direct Resend calls throughout feature modules.

---

# 32.37 Deployment Per Client

Each client receives an independent deployment.

Conceptually:

```text
                Your Platform
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
      Client A     Client B     Client C
        │            │            │
      Vercel       Vercel       Vercel
        │            │            │
    Supabase      Supabase      Supabase
```

This provides strong isolation.

---

# 32.38 Deployment Configuration

Each deployment should have configuration for:

```text
Business identity
Supabase project
Resend
Paystack
Subscription
Branding
Application URL
```

Business-specific configuration should be stored in the appropriate database/configuration layer rather than requiring code modifications.

---

# 32.39 Deployment Automation

The ideal workflow is:

```text
Merge to main
      ↓
CI passes
      ↓
Deployment automatically triggered
      ↓
Production build
      ↓
Deployment
```

This removes unnecessary manual deployment steps.

---

# 32.40 Preview Deployments

Feature branches/PRs should ideally generate preview environments where supported.

This allows UI and functionality to be reviewed before production deployment.

---

# 32.41 Database Migrations

Database schema changes must be version controlled.

Never make undocumented production database changes manually.

Conceptually:

```text
Migration 001
Migration 002
Migration 003
...
```

The database schema becomes part of the source-controlled application.

---

# 32.42 Migration Safety

Before production migration:

```text
Development
 ↓
Migration tested
 ↓
Staging
 ↓
Validation
 ↓
Production
```

Destructive migrations require particular caution because transactional history is immutable.

---

# 32.43 Rollbacks

Application deployments should have a rollback strategy.

If a release causes:

```text
Critical POS failure
```

the previous application version should be restorable.

Database rollback requires more caution because data migrations may be irreversible.

Therefore migrations should preferably be designed to be backward-compatible where practical.

---

# 32.44 Release Strategy

Initially use:

> **Simple continuous delivery.**

Small changes should be released frequently rather than accumulating months of changes into one massive release.

---

# 32.45 Versioning

The application should maintain a version identifier.

Example:

```text
v1.0.0
v1.0.1
v1.1.0
```

This helps identify which version a client deployment is running.

---

# 32.46 Client Deployment Updates

Because each client has an independent deployment, updates can technically be rolled out individually.

This gives the Super Admin greater control over:

* Deployment timing
* Version management
* Rollbacks
* Client-specific configuration

---

# 32.47 Critical Release Protection

Changes involving:

* Transactions
* Inventory
* Refunds
* Permissions
* Authentication
* Subscription enforcement

should require stronger review than ordinary UI changes.

---

# 32.48 CI Pipeline — Minimum

The initial CI pipeline should execute:

```text
1. Checkout
2. Setup Node
3. Setup pnpm
4. Install dependencies
5. Lint
6. Type check
7. Unit tests
8. Integration tests
9. Build
```

If any critical step fails:

```text
❌ PR cannot merge
```

---

# 32.49 CI Pipeline — Future

As the product matures:

```text
Lint
 ↓
Type Check
 ↓
Unit Tests
 ↓
Integration Tests
 ↓
E2E
 ↓
Security Checks
 ↓
Build
 ↓
Deploy Staging
 ↓
Smoke Tests
 ↓
Production
```

The initial implementation should not become unnecessarily complex.

---

# 32.50 Definition of Done

A feature is complete when:

* Requirements are implemented
* UI works
* Backend works
* Authorization works
* Database behaviour is correct
* Relevant tests pass
* Type checking passes
* Lint passes
* Build passes
* Audit behaviour is implemented where required
* Documentation is updated where necessary

---

# 32.51 Stage 32 — Final Scope

### Source Control

✅ GitHub
✅ Branches
✅ Pull Requests
✅ Protected main branch

### CI/CD

✅ GitHub Actions
✅ Lint
✅ Type checking
✅ Tests
✅ Build
✅ Automated deployment

### Testing

✅ Unit tests
✅ Integration tests
✅ API tests
✅ Authorization tests
✅ RLS tests
✅ Inventory tests
✅ Customer/credit tests
✅ Layaway tests
✅ Subscription tests
✅ Audit tests
✅ E2E tests
✅ Browser testing
✅ Responsive testing
✅ Hardware testing

### Infrastructure

✅ Vercel candidate
✅ Supabase
✅ Resend
✅ Paystack for subscription only
✅ Environment separation
✅ Database migrations
✅ Deployment automation
✅ Rollback strategy

### Cost

✅ Free-first
✅ Minimal infrastructure
✅ No unnecessary Redis
✅ No unnecessary workers
✅ No paid monitoring requirement
✅ Target ≤ $10/month

---

## Stage 32 Architectural Outcome

The development lifecycle is now:

```text
                 GITHUB
                    │
                    ▼
              PULL REQUEST
                    │
                    ▼
              GITHUB ACTIONS
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
     LINT         TESTS        TYPECHECK
       └────────────┼────────────┘
                    ▼
                  BUILD
                    │
                    ▼
                 STAGING
                    │
                    ▼
               PRODUCTION
                    │
                    ▼
             CLIENT DEPLOYMENT
```

This gives the Dynamic POS a proper engineering foundation **before we begin implementation**, rather than trying to bolt testing, deployment, security, and infrastructure onto the project later.
