# Stage 14 — Security Architecture & Authorization

This is one of the most important stages of the Dynamic POS because the system handles **financial transactions, inventory, customer information, employee accounts, business configuration, subscription state and administrative operations**.

The security philosophy should be:

> **Deny by default, explicitly grant access, validate on the server, enforce authorization at the database layer, and make sensitive operations auditable.**

Your selected security posture is **strict**.

---

# 1. Security Architecture

The security model should have multiple layers:

```text
                    USER
                     │
                     ↓
              Authentication
                     │
                     ↓
              Session Validation
                     │
                     ↓
            Application Authorization
                     │
                     ↓
              API Validation
                     │
                     ↓
          Supabase Row Level Security
                     │
                     ↓
                 Database
```

The critical principle is:

> **The frontend is never trusted for authorization.**

Hiding a button is not security.

---

# 2. Authentication

The application will use:

> **Supabase Auth**

Initial authentication:

* Email
* Password
* Secure session management

You explicitly rejected:

* MFA/2FA
* Google OAuth
* Microsoft OAuth
* Biometric authentication

Therefore these are **not MVP requirements**.

---

# 3. Login Flow

```text
Email + Password
       ↓
Supabase Auth
       ↓
Authenticated Session
       ↓
Application
       ↓
Load User Profile
       ↓
Load Roles
       ↓
Load Permissions
       ↓
Load Business Context
       ↓
Application Access
```

---

# 4. Subscription Check

Because an expired subscription completely locks the application, subscription status must be checked during authentication/session initialization.

```text
Login
 ↓
Authenticated?
 ↓
User active?
 ↓
Subscription active?
 ↓
Load application
```

If:

```text
subscription.status = expired
```

then:

```text
Normal user → Access denied
```

Super Admin remains exempt.

---

# 5. Session Security

Sessions should:

* use secure cookies/storage mechanisms provided by Supabase
* expire appropriately
* be invalidated when required
* never expose access tokens unnecessarily
* never be stored in application database records as plaintext

---

# 6. User Status

Every application user should have an account status.

Recommended:

```text
ACTIVE
SUSPENDED
DISABLED
INVITED
```

Example:

```text
Employee suspended
        ↓
Existing session invalidated
        ↓
Future requests rejected
```

Suspending a user must not merely hide the account in the UI.

The backend/database authorization layer must reject the user.

---

# 7. User Hierarchy

The hierarchy established earlier:

```text
Super Admin
     │
     ↓
Owner
     │
     ↓
Branch Manager
     │
     ├── Cashier
     ├── Salesperson
     ├── Pharmacist
     ├── Waiter
     ├── Kitchen Staff
     └── Custom Roles
```

However, we should **not hard-code this as a simple inheritance tree**.

The actual authorization system should be permission-based.

---

# 8. RBAC

Authorization uses:

> **Role-Based Access Control**

But because you selected granular permissions, the model should be:

```text
User
 ↓
Role
 ↓
Permissions
```

rather than:

```text
User
 ↓
Role
 ↓
Everything the role can do
```

---

# 9. Permission Model

Permissions should be explicit.

Examples:

```text
products.view
products.create
products.update
products.delete

sales.view
sales.create
sales.refund

discounts.apply
discounts.override

inventory.view
inventory.adjust
inventory.transfer

customers.view
customers.create
customers.update

employees.view
employees.create
employees.update
employees.disable

reports.view
reports.create
reports.export

settings.view
settings.update
```

---

# 10. Permission Granularity

A user could have:

```text
sales.view
sales.create
```

but not:

```text
sales.refund
```

Therefore they can process sales but cannot refund them.

This is much safer than a generic:

```text
sales = true
```

---

# 11. Custom Roles

Owners should be able to create custom roles.

Example:

> Senior Cashier

Permissions:

```text
sales.view
sales.create
customers.create
customers.view
discounts.apply
```

But:

```text
products.delete
employees.create
refunds.approve
```

are denied.

---

# 12. Role Scope

Roles must also have scope.

For example:

```text
Branch Manager
Scope:
Branch A
```

while:

```text
Owner
Scope:
Entire Business
```

A permission alone is insufficient.

You need:

```text
Permission + Scope
```

---

# 13. Business Scope

Every relevant database operation should resolve:

```text
User
 ↓
Business
 ↓
Branch
 ↓
Business Unit
```

This prevents someone assigned to:

> Branch A

from accessing:

> Branch B

simply by changing a URL.

---

# 14. Business Units

Your architecture allows:

```text
Branch A
 ├── Supermarket
 └── Pharmacy
```

A business unit therefore has its own:

* inventory
* POS configuration
* operational settings

and, based on your earlier answer:

> The same product cannot exist in multiple business units.

This rule needs to be enforced at the data/business-logic layer rather than merely communicated to users.

---

# 15. Branch-Level Pricing

You selected:

> Pricing configurable at Branch level.

Therefore pricing authorization must account for branch scope.

A manager of Branch A should not be able to modify:

> Branch B's product price.

Even if the product itself is visible to them.

---

# 16. Supabase Row Level Security

RLS is one of the most important security mechanisms in this architecture.

Tables should generally have RLS enabled.

Conceptually:

```text
SELECT *
FROM products
```

doesn't automatically mean:

> return every product.

RLS determines which rows the authenticated user is allowed to see.

---

# 17. Example RLS Principle

A Branch Manager should only receive records where:

```text
product.branch_id
```

belongs to an authorized branch.

The database enforces this.

Even if someone bypasses the frontend:

```text
GET /api/products?branch_id=other_branch
```

the database still refuses unauthorized rows.

---

# 18. Never Trust Client-Supplied IDs

This is a major rule.

Never assume:

```json
{
  "branch_id": "branch-A"
}
```

means the user has access to Branch A.

The backend must derive/validate the user's authorized scope.

---

# 19. Authorization Context

A useful internal authorization context:

```text
user_id
business_id
role_ids
permission_ids
branch_ids
business_unit_ids
is_super_admin
```

This context should be used consistently throughout the application.

---

# 20. Super Admin

The Super Admin is a special security boundary.

You specified:

> Super Admin has untethered access.

This means Super Admin can access the entire deployment regardless of business-level permissions.

However:

> Super Admin should **not** be treated as an ordinary business Owner.

It should be a separate administrative authority.

---

# 21. Super Admin Isolation

Super Admin functionality should be separated from the normal business dashboard.

For example:

```text
/admin
```

rather than mixing:

```text
/business/dashboard
```

and Super Admin functions together.

This reduces accidental privilege exposure.

---

# 22. Super Admin Database Access

We should avoid implementing:

```text
is_super_admin = true
```

as the only security mechanism.

Super Admin status should be tightly controlled.

Ideally:

* dedicated role
* server-side verification
* database policies
* audited access

---

# 23. Privilege Escalation Protection

Users must never be able to:

* modify their own role
* grant themselves permissions
* modify another user's role without authorization
* assign Super Admin
* modify their business ownership
* change their business scope

For example, this request must be rejected:

```json
{
  "role": "owner"
}
```

if submitted by a normal employee.

---

# 24. Custom Role Protection

A user should only be able to assign permissions they are themselves authorized to delegate.

This prevents:

```text
Manager
 ↓
Creates custom role
 ↓
Gives it owner-level permissions
```

unless the manager is explicitly authorized to delegate those permissions.

---

# 25. Permission Delegation

We should distinguish between:

```text
Can use permission
```

and:

```text
Can grant permission
```

For example:

```text
employees.create
```

doesn't automatically imply:

```text
roles.assign
```

This is important.

---

# 26. Sensitive Operations

The following operations should require explicit permissions and additional validation:

* Refund
* Large discount
* Product deletion
* Inventory adjustment
* Stock transfer
* Employee role changes
* Permission changes
* Subscription changes
* Business configuration changes
* Data deletion

---

# 27. Refund Authorization

You explicitly selected:

> Refunds require authorization.

Recommended workflow:

```text
Cashier
 ↓
Refund request
 ↓
Authorization check
 ↓
Authorized user
 ↓
Approve
 ↓
Refund
```

The authorization requirement should be configurable by permission.

---

# 28. Refund Immutability

A completed refund must never simply be edited.

Instead:

```text
Original Sale
     ↓
Refund Transaction
```

The original transaction remains immutable.

---

# 29. Transaction Immutability

You explicitly selected:

> Transactional data is immutable.

Therefore, completed sales should not be updated in-place to alter historical facts.

Bad:

```text
Sale total:
₦100,000

UPDATE total = ₦50,000
```

Better:

```text
Original Sale:
₦100,000

Refund:
₦50,000
```

The audit history remains intact.

---

# 30. Financial Ledger Principle

The system should treat completed financial transactions as append-only records.

Corrections happen through:

* refunds
* adjustments
* reversals
* correction transactions

rather than rewriting history.

---

# 31. Concurrency Control

You explicitly requested concurrency checks.

This is critical for POS.

Example:

```text
Stock = 1
```

Two terminals attempt to sell it simultaneously.

Without protection:

```text
Terminal A → sells 1
Terminal B → sells 1

Result:
Stock = -1
```

We need transactional concurrency control.

---

# 32. Atomic Stock Updates

The stock update should happen atomically.

Conceptually:

```text
BEGIN

Check available stock

IF stock >= requested_quantity
    decrement stock
ELSE
    reject transaction

COMMIT
```

This logic should execute on the database/server side.

---

# 33. Optimistic Concurrency

For certain editable resources, we can use a version field:

```text
version = 4
```

User A edits:

```text
version 4 → 5
```

User B attempts to save an outdated version:

```text
version 4
```

The system rejects it.

This prevents silent overwrites.

---

# 34. Unique Transaction IDs

Transactions need unique identifiers.

For example:

```text
SAL-20260821-000102
```

But the display ID is not enough.

The database should also have a UUID primary key.

Therefore:

```text
id:
UUID

receipt_number:
human-readable unique identifier
```

---

# 35. Idempotency

Financial operations should support idempotency.

Example:

```text
POST /refund
Idempotency-Key: abc123
```

If the same request is accidentally sent twice:

```text
Request 1 → refund created
Request 2 → existing refund returned
```

instead of creating two refunds.

---

# 36. Payment Security

Client POS payments are:

* Cash
* Card
* Bank Transfer
* Store Credit

You clarified that:

> Actual customer POS payments remain outside the platform.

Therefore Paystack is **not** responsible for normal POS transactions.

Paystack is only used for:

> Software subscription payments.

---

# 37. Paystack Security Boundary

```text
POS customer payment
        ↓
External payment method
        ↓
Recorded in POS
```

while:

```text
Software subscription
        ↓
Paystack
        ↓
Webhook verification
        ↓
Subscription
```

These are completely separate domains.

---

# 38. Secrets

Secrets must never be placed in:

* frontend source code
* GitHub
* public environment files
* database records

Examples:

```text
PAYSTACK_SECRET_KEY
RESEND_API_KEY
SUPABASE_SERVICE_ROLE_KEY
```

must remain server-side.

---

# 39. Supabase Service Role Key

This is especially important.

The Supabase service-role key bypasses RLS.

Therefore:

> **It must never be exposed to the browser.**

It should only exist in trusted server-side execution environments.

---

# 40. Public Supabase Key

The public/anon key may be exposed to the frontend as intended by Supabase's architecture, but it must never be treated as authorization.

Security comes from:

```text
Auth
+
RLS
+
Application authorization
```

not from hiding the anon key.

---

# 41. Input Validation

Every API endpoint should validate input.

For example:

```text
Product price
```

must be:

```text
number
>= 0
valid precision
```

rather than blindly trusting:

```json
{
  "price": "-999999999"
}
```

---

# 42. Validation Layers

Use:

```text
Frontend validation
        +
Backend validation
        +
Database constraints
```

The frontend improves UX.

The backend provides actual security.

The database provides final integrity.

---

# 43. Database Constraints

Important constraints should exist in PostgreSQL.

Examples:

```text
NOT NULL
UNIQUE
CHECK
FOREIGN KEY
```

For example:

```text
quantity >= 0
price >= 0
discount >= 0
```

where appropriate.

---

# 44. SQL Injection

Do not construct SQL using raw string concatenation.

Use:

* Supabase client/query builder
* parameterized queries
* controlled query generation

The custom report builder must be particularly strict here.

---

# 45. XSS Protection

User-generated fields such as:

* product names
* customer names
* business names
* notes

must be safely rendered.

Never inject arbitrary HTML into the application.

---

# 46. CSRF

If cookie-based authentication is used, state-changing operations need appropriate CSRF protection depending on the exact frontend/backend architecture.

This should be finalized during implementation after choosing the precise Supabase-ERN deployment pattern.

---

# 47. Rate Limiting

We should rate-limit sensitive endpoints such as:

```text
Login
Password reset
Refund requests
Role changes
Report generation
Subscription payment initiation
```

We don't need an expensive external rate-limit service.

A lightweight implementation can initially leverage available platform/database mechanisms and application-level controls.

---

# 48. Login Protection

Protect against brute force attempts.

Potential controls:

```text
Repeated failures
      ↓
Temporary throttling
```

Supabase Auth already provides part of the authentication infrastructure, but application-level controls should complement it.

---

# 49. Audit System

You already selected:

> Full audit system.

Audit records should include:

```text
actor
action
resource
resource_id
business
branch
timestamp
IP/device metadata where appropriate
before
after
reason
```

---

# 50. Audit Examples

```text
USER_ROLE_CHANGED

PRODUCT_PRICE_CHANGED

REFUND_APPROVED

REFUND_COMPLETED

DISCOUNT_APPLIED

INVENTORY_ADJUSTED

STOCK_TRANSFER_CREATED

STOCK_TRANSFER_COMPLETED

SUBSCRIPTION_RENEWED

BUSINESS_SETTINGS_CHANGED
```

---

# 51. Audit Records Are Append-Only

Audit logs should not be editable by normal application users.

Ideally:

```text
Audit
 ↓
INSERT
```

but no ordinary:

```text
UPDATE
DELETE
```

permissions.

---

# 52. Audit vs Activity Log

Do not confuse:

### Activity

> John created product X.

with:

### Audit

> John changed product X's price from ₦10,000 to ₦8,500 at 14:32, authorized under permission Y.

Audit records are security records.

---

# 53. Data Encryption

Data should be encrypted:

### In transit

HTTPS/TLS.

### At rest

Use Supabase/PostgreSQL infrastructure encryption where provided.

Sensitive secrets should never be stored unencrypted.

---

# 54. Sensitive Customer Data

Customer information should be minimized.

Only collect what the POS actually needs.

For example:

```text
Name
Phone
Email (if required)
Address (only if required)
```

Do not collect unnecessary personal data.

---

# 55. Password Security

Passwords should never be stored directly by the application.

Supabase Auth handles password authentication/storage.

The application should never have access to plaintext passwords.

---

# 56. Database Backups

A production POS needs recovery capability.

The exact backup strategy depends on the Supabase plan selected.

Because you're targeting free infrastructure, we should distinguish:

### Development

Free environment.

### Production

Free where feasible, but backup limitations must be explicitly acknowledged.

If business-critical production data grows, paid infrastructure may eventually become necessary.

---

# 57. Security vs Free Budget

There is an important architectural reality:

> **A completely free production system cannot guarantee enterprise-grade disaster recovery, observability and uptime indefinitely.**

Our goal should therefore be:

```text
Maximum security
+
Free/native tooling
+
Minimal infrastructure
```

rather than pretending $0 infrastructure provides unlimited enterprise guarantees.

---

# 58. Deployment Security

Environment variables should be separated:

```text
Development
Staging
Production
```

Each environment should have separate:

* database credentials
* API keys
* secrets
* deployment configuration

---

# 59. GitHub Security

Since GitHub is your source-control platform:

Enable basic protections such as:

* branch protection
* pull requests
* required CI checks
* secret scanning where available
* dependency alerts
* protected production branch

---

# 60. CI Security

The CI pipeline should run:

```text
Install dependencies
 ↓
Lint
 ↓
Type check
 ↓
Unit tests
 ↓
Build
```

Deployment only happens if these pass.

---

# 61. Dependency Security

Dependencies should be monitored for known vulnerabilities.

Use the package manager's audit/security mechanisms and GitHub dependency tooling where available.

Avoid installing packages simply because they are convenient.

Every dependency adds:

> attack surface + maintenance cost.

---

# 62. File Upload Security

The business can upload:

* logo
* branding assets

Uploads should be restricted by:

```text
File type
File size
Dimensions where appropriate
```

Do not allow arbitrary executable files.

---

# 63. Business Branding Isolation

A business must not be able to reference another business's branding files.

Supabase Storage policies must follow the same business/branch authorization model.

---

# 64. Storage Security

For example:

```text
business/{business_id}/branding/logo.png
```

and Storage RLS/policies ensure only authorized users can manage it.

---

# 65. API Authorization

Every protected API operation should conceptually execute:

```text
Authenticate
 ↓
Identify user
 ↓
Identify business
 ↓
Resolve role
 ↓
Resolve permissions
 ↓
Resolve scope
 ↓
Validate request
 ↓
Execute
```

---

# 66. Database Authorization

Even after API authorization:

```text
Supabase RLS
```

provides a second security boundary.

This is intentional defense in depth.

---

# 67. Security Architecture Summary

```text
                 ┌──────────────┐
                 │    User      │
                 └──────┬───────┘
                        ↓
                ┌───────────────┐
                │ Supabase Auth │
                └───────┬───────┘
                        ↓
                 Session Valid?
                        ↓
                 Subscription?
                        ↓
                 ┌──────────────┐
                 │ RBAC Engine  │
                 └──────┬───────┘
                        ↓
              Permission + Scope
                        ↓
                 API Validation
                        ↓
                 ┌────────────┐
                 │    RLS     │
                 └─────┬──────┘
                       ↓
                  PostgreSQL
                       ↓
                    Audit
```

---

# 68. Security Requirements — Locked

| Area                           | Decision           |
| ------------------------------ | ------------------ |
| Authentication                 | Supabase Auth      |
| Email/password                 | Yes                |
| MFA/2FA                        | No                 |
| Google OAuth                   | No                 |
| Microsoft OAuth                | No                 |
| Biometrics                     | No                 |
| Authorization                  | Granular RBAC      |
| Custom roles                   | Yes                |
| Permission delegation          | Restricted         |
| Business scope                 | Yes                |
| Branch scope                   | Yes                |
| Business-unit scope            | Yes                |
| RLS                            | **Mandatory**      |
| Server-side authorization      | **Mandatory**      |
| Transaction immutability       | Yes                |
| Concurrency protection         | Yes                |
| Idempotency                    | Yes                |
| Refund authorization           | Yes                |
| Audit system                   | Yes                |
| Super Admin                    | Untethered access  |
| Subscription lock              | Yes                |
| Input validation               | Yes                |
| Database constraints           | Yes                |
| SQL injection protection       | Yes                |
| XSS protection                 | Yes                |
| Rate limiting                  | Yes                |
| Secret management              | Yes                |
| Encryption in transit          | Yes                |
| Encryption at rest             | Platform-supported |
| External paid security tooling | No initially       |
| Service-role key in frontend   | **Never**          |
| Raw SQL from custom reports    | **Never**          |

---