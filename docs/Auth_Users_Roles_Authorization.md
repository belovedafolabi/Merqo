# Stage 7 — Authentication, Users, Roles & Authorization

This stage defines **who can access the POS, what they can see, what they can do, and how the system prevents users from bypassing their permissions**.

Given your previous decisions, I recommend making this one of the strongest architectural boundaries in the system.

The core principle is:

> **Authentication determines who you are. Authorization determines what you are allowed to do. Scope determines where you are allowed to do it.**

So a cashier might have permission to create sales, but only within their assigned branch/business unit.

---

# 1. User Hierarchy

The platform has two fundamentally different levels.

```text
SUPER ADMIN
    │
    └── Client Deployment
          │
          └── OWNER / ADMIN
                │
                ├── Branch Manager
                ├── Cashier
                ├── Salesperson
                ├── Pharmacist
                ├── Waiter
                ├── Kitchen Staff
                └── Custom Roles
```

The **Super Admin** is you, as the platform operator.

The **Owner/Admin** belongs to the individual client.

---

# 2. Super Admin

The Super Admin is fundamentally different from normal business users.

The Super Admin has:

* unrestricted platform access
* access to all client deployments
* subscription management
* deployment management
* client management
* system configuration
* platform-level auditing
* platform health information
* ability to access client administration
* ability to manage subscription pricing
* ability to manage subscription duration options
* ability to manage platform-wide settings

Most importantly, based on your decision:

> **Super Admin access is untethered.**

Therefore, subscription expiration does **not** lock the Super Admin out.

---

# 3. Owner / Admin

The Owner is the highest-level user **inside a client's deployment**.

They can manage:

* business information
* business types
* branches
* business units
* employees
* roles
* permissions
* products
* inventory
* pricing
* customers
* POS configuration
* taxes
* service charges
* receipts
* reports
* accounting
* notifications
* subscription
* branding

However, the Owner cannot access Super Admin functionality.

---

# 4. Important Naming Decision

Internally, I recommend avoiding a generic role called simply:

```text
Admin
```

because later we may have:

```text
System Admin
Business Admin
Branch Admin
```

Instead, internally use:

```text
OWNER
```

for the client-level highest role.

The UI can still display **Admin** if you prefer.

---

# 5. Branch Manager

A Branch Manager operates within an assigned branch.

Typical permissions:

```text
Products
Inventory
Employees
Sales
Customers
Reports
Discounts
Refund requests
Stock adjustments
```

But their permissions should still be configurable.

For example, one business could allow a Branch Manager to approve refunds while another doesn't.

---

# 6. Cashier

The Cashier is primarily a transaction-oriented role.

Typical capabilities:

```text
Create sale
Scan products
Search products
Apply permitted discounts
Accept payment
Print receipt
Suspend sale
Resume sale
Process permitted returns
Create customers
View relevant sales
```

They should not automatically be able to:

```text
Delete products
Change prices
Create employees
Change permissions
View sensitive financial reports
Change tax settings
```

---

# 7. Salesperson

A Salesperson can have a similar POS interface but doesn't necessarily control payment or financial operations.

Possible permissions:

```text
View products
Create sales
Create customers
View assigned sales
Apply permitted discounts
```

The actual permission set remains configurable.

---

# 8. Pharmacist

The Pharmacist role exists because the platform supports pharmacy businesses.

However, remember:

**This is not a pharmaceutical management system.**

The role can therefore simply be a specialized preset.

Example:

```text
View products
Sell products
Manage pharmacy inventory
View batches
View expiry information
```

No prescription or medical decision-making functionality is automatically attached.

---

# 9. Waiter

For businesses using restaurant-related POS functionality:

```text
Create orders
View products
Create customers
Apply permitted discounts
View order status
```

Since you rejected table management, reservations, kitchen management, recipes, modifiers, etc., we should not create unnecessary restaurant permissions around those features.

---

# 10. Kitchen Staff

Because the restaurant feature set was intentionally simplified, Kitchen Staff permissions should only exist around whatever kitchen/order functionality is ultimately retained.

The role can therefore be a predefined role template rather than a completely separate architectural system.

---

# 11. Custom Roles

This is one of the most important capabilities.

A business can create:

```text
Inventory Clerk
Accountant
Store Supervisor
Front Desk
Operations Officer
Auditor
```

etc.

They can then select permissions.

---

# 12. Granular Permissions

Permissions should not be:

```text
CAN_MANAGE_PRODUCTS
```

only.

That's too broad.

Instead:

```text
product.view
product.create
product.update
product.archive
product.price.view
product.price.update
```

Similarly:

```text
inventory.view
inventory.adjust
inventory.transfer
inventory.transfer.approve
```

This gives us much better control.

---

# 13. Permission Structure

I recommend:

```text
<resource>.<action>
```

Examples:

```text
product.view
product.create
product.update
product.archive

inventory.view
inventory.adjust
inventory.transfer.create
inventory.transfer.approve

sale.create
sale.view
sale.cancel
sale.refund

customer.view
customer.create
customer.update

employee.view
employee.create
employee.update
employee.deactivate
```

---

# 14. Sensitive Permissions

Some permissions should be explicitly treated as high-risk.

For example:

```text
sale.refund
sale.void
discount.override
inventory.adjust
price.update
employee.permissions.update
subscription.manage
financial.report.view
```

These can later trigger additional authorization requirements.

---

# 15. Permission Scope

This is where the Dynamic POS becomes more sophisticated.

Having a permission isn't enough.

A user also needs a **scope**.

For example:

```text
Cashier
    ↓
sale.create
    ↓
Branch: Wuse Branch
```

They cannot necessarily use that permission at:

```text
Garki Branch
```

---

# 16. Scope Hierarchy

I recommend:

```text
Deployment
    │
    ├── Branch
    │     │
    │     ├── Business Unit
    │     │
    │     └── Business Unit
    │
    └── Branch
```

Permissions can be scoped to:

```text
ALL
BRANCH
BUSINESS_UNIT
```

---

# 17. Example

A Branch Manager:

```text
inventory.view
```

Scope:

```text
Branch: Wuse
```

They can see:

```text
Wuse inventory
```

but not:

```text
Garki inventory
```

unless explicitly granted.

---

# 18. Business Unit Access

Because you selected:

> Business units have their own POS configuration.

A user can also be assigned to a business unit.

Example:

```text
Wuse Branch
│
├── Supermarket
│
└── Pharmacy
```

A Pharmacy employee could be assigned:

```text
Branch:
Wuse

Business Unit:
Pharmacy
```

This prevents them from accidentally operating the supermarket POS.

---

# 19. Multiple Business Unit Access

Some employees may need access to both.

For example:

```text
Branch Manager
```

could have:

```text
Wuse / Supermarket
Wuse / Pharmacy
```

while a Pharmacy Cashier has:

```text
Wuse / Pharmacy
```

only.

---

# 20. User Assignment Model

A user should therefore have something conceptually like:

```text
User
│
├── Role
│
├── Branch Access
│
├── Business Unit Access
│
└── Permission Overrides
```

This is much more flexible than simply attaching one role to a user.

---

# 21. Permission Overrides

Custom exceptions should be supported.

Example:

Role:

```text
Cashier
```

normally has:

```text
discount.apply
```

but a particular cashier may additionally receive:

```text
discount.high_value
```

This should be possible without creating another role.

---

# 22. Role Templates

When a new business is created, the system should automatically create predefined roles.

For example:

```text
Owner
Branch Manager
Cashier
Salesperson
Pharmacist
Waiter
Kitchen Staff
```

The business can then modify or clone them.

---

# 23. Roles Should Be Configurable

The predefined roles should **not** be hard-coded into application logic.

Instead:

```text
Role
   ↓
Permissions
```

The application checks permissions.

This means the business can modify what "Cashier" means without requiring a code deployment.

---

# 24. Authentication

For the stack, I recommend:

> **Supabase Auth**

This keeps authentication inside the existing free/low-cost architecture.

The initial authentication model should be:

```text
Email + Password
```

You previously rejected:

* Google OAuth
* Microsoft OAuth
* MFA/2FA
* biometric authentication

So these should remain outside the initial scope.

---

# 25. Password Security

Passwords should never be stored by the application directly.

Supabase Auth handles password storage and authentication mechanisms.

The application should only deal with the authenticated user identity.

---

# 26. Application User Profile

We should separate:

```text
Supabase Auth User
```

from:

```text
Application Employee Profile
```

Conceptually:

```text
auth.users
     │
     ↓
employees
     │
     ├── role
     ├── branch
     ├── business unit
     └── status
```

This gives us much more flexibility.

---

# 27. Employee Status

Employees should have states such as:

```text
INVITED
ACTIVE
SUSPENDED
DEACTIVATED
```

---

# 28. Employee Invitation

Owner/authorized users can invite employees.

Workflow:

```text
Create Employee
       ↓
Assign Role
       ↓
Assign Branch
       ↓
Assign Business Unit
       ↓
Invitation Email
       ↓
Employee Sets Password
       ↓
Account Activated
```

Resend will handle the email.

---

# 29. Employee Deactivation

When an employee leaves:

```text
ACTIVE
   ↓
DEACTIVATED
```

Their historical transactions remain intact.

We should **never delete their historical identity** from transactions.

For example:

```text
Sale #10482
Created by:
John Doe
```

must remain meaningful even after John leaves.

---

# 30. Session Management

Users should have authenticated sessions.

We should support:

```text
Login
Logout
Session expiration
Session refresh
```

Supabase Auth handles much of the underlying session infrastructure.

---

# 31. Account Locking

Since MFA/2FA isn't being implemented initially, we should compensate with basic protections.

Examples:

* rate limiting login attempts
* temporary login throttling
* password reset controls
* session expiration
* suspicious authentication logging

These should be implemented without introducing a paid authentication service.

---

# 32. Authorization Architecture

The request flow should conceptually be:

```text
User
 ↓
Supabase Auth
 ↓
Authenticated Identity
 ↓
Application Role
 ↓
Permission
 ↓
Scope
 ↓
Business Rule
 ↓
Database
```

Every layer matters.

---

# 33. Frontend Authorization

The UI should hide actions the user cannot perform.

For example:

```text
Cashier
```

should not see:

```text
Settings → Employee Permissions
```

But **hiding the button is not security**.

---

# 34. Backend Authorization

The backend must independently verify:

```text
Is the user authenticated?
Is the user authorized?
Does the user have the permission?
Is the resource within their scope?
```

A malicious user cannot simply call an API endpoint directly.

---

# 35. Database Authorization

This is where Supabase becomes particularly powerful.

We should use:

> **PostgreSQL Row Level Security (RLS).**

RLS should enforce tenant/deployment and organizational boundaries at the database level.

Even if application code makes a mistake, database policies provide another protection layer.

---

# 36. RLS Example

Conceptually:

```text
User
 ↓
JWT
 ↓
User ID
 ↓
Employee
 ↓
Business
 ↓
Branch
 ↓
Allowed records
```

A cashier belonging to Branch A should not be able to query Branch B's inventory simply by manipulating a request parameter.

---

# 37. Super Admin Exception

There is an important architectural distinction here.

The Super Admin needs unrestricted access across deployments.

Therefore the Super Admin's authorization path must be deliberately separated from ordinary business-user RLS.

We should **not** simply give the Super Admin's browser a magical client-side flag such as:

```text
isSuperAdmin = true
```

That would be insecure.

The privilege must be enforced server-side.

---

# 38. Super Admin Architecture

Conceptually:

```text
                    AUTHENTICATION
                          │
              ┌───────────┴───────────┐
              ↓                       ↓
        SUPER ADMIN              BUSINESS USER
              │                       │
              ↓                       ↓
     Platform Authorization       RBAC + Scope
              │                       │
              ↓                       ↓
       All Deployments          Allowed Records
```

The implementation details will be finalized when we design the deployment architecture.

---

# 39. Subscription Expiration

You decided:

> When subscription expires, completely lock the application.

Therefore:

```text
Subscription Active
       ↓
Application Accessible
```

but:

```text
Subscription Expired
       ↓
Application Locked
       ↓
Existing sessions invalidated
       ↓
Login blocked
```

---

# 40. Super Admin Exception

Again:

```text
Subscription Expired
        │
        ├── Client users → BLOCKED
        │
        └── Super Admin → ACCESS ALLOWED
```

This is critical for subscription management.

---

# 41. Expiry Enforcement

We should not rely only on frontend logic such as:

```text
if expired:
    show lock screen
```

That is insufficient.

The backend must reject authenticated client requests when the deployment is expired.

---

# 42. Subscription Middleware

Conceptually:

```text
Request
  ↓
Authenticate
  ↓
Identify Deployment
  ↓
Check Subscription
  ↓
Check Authorization
  ↓
Execute Request
```

Except for Super Admin requests.

---

# 43. Login After Expiration

If the subscription is expired:

```text
POST /login
```

should not result in an active business session.

Instead:

```text
Subscription expired.
Please renew to continue.
```

The renewal process can then be made available through the appropriate subscription interface.

---

# 44. Critical Exception

We need to ensure the Owner can still reach the **minimum renewal mechanism** needed to renew an expired subscription.

There is a slight architectural tension between:

> "Login is not enabled"

and:

> "Owner should be able to renew."

We'll resolve this during the subscription architecture stage by making renewal a **restricted subscription-renewal flow**, not general application access.

That means an expired client cannot operate the POS or access normal business functionality.

---

# 45. Sensitive Actions

Certain actions should require explicit authorization.

Based on your previous answers, refunds definitely require authorization.

Potential examples:

```text
Refund
Large discount
Price override
Stock adjustment
Sale cancellation
Account permission changes
```

The exact list will be configured in the security stage.

---

# 46. Refund Authorization

A cashier attempts:

```text
Refund ₦150,000
```

System:

```text
Authorization required
```

An authorized manager/owner can approve it.

The system records:

```text
Requested by:
Cashier

Approved by:
Branch Manager

Timestamp:
...

Reason:
...
```

This creates a strong audit trail.

---

# 47. Discount Permissions

Discounts should work similarly.

Example:

```text
Cashier
```

may have:

```text
discount.apply
```

but not:

```text
discount.override
```

A manager may have the latter.

---

# 48. Permission Matrix

Eventually the admin UI should provide something like:

```text
                    View  Create Update Delete Approve
Products             ✓      ✓      ✓      -       -
Inventory            ✓      -      ✓      -       ✓
Sales                ✓      ✓      -      -       -
Refunds              ✓      -      -      -       ✓
Employees            ✓      ✓      ✓      -       -
Reports              ✓      -      -      -       -
Settings             ✓      -      ✓      -       -
```

The exact UI should remain simple despite the granular backend.

---

# 49. Principle of Least Privilege

Every new role should start with:

```text
NO permissions
```

and receive only what is required.

We should not make every employee effectively an administrator.

---

# 50. Audit Integration

Authorization events should feed directly into the audit system.

For example:

```text
Permission changed
Role changed
Employee created
Employee suspended
Refund approved
Discount approved
```

These become immutable audit events.

---

# 51. No Direct Role Logic

Avoid code such as:

```text
if (user.role === "cashier") {
   ...
}
```

throughout the application.

Instead:

```text
if (hasPermission("sale.create")) {
   ...
}
```

This is one of the most important decisions for keeping the platform dynamic.

---

# 52. Business Type Should Not Control Authorization

Similarly, avoid:

```text
if businessType === "pharmacy"
```

inside authorization logic.

Instead:

```text
if hasPermission("inventory.batch.view")
```

Business type should determine **which capabilities are enabled**, not dictate the fundamental security architecture.

---

# 53. Recommended Authorization Model

The final model becomes:

```text
USER
 │
 ├── ROLE
 │     └── PERMISSIONS
 │
 ├── DIRECT PERMISSION OVERRIDES
 │
 ├── BRANCH ACCESS
 │
 └── BUSINESS UNIT ACCESS
```

with:

```text
RLS
+
Backend authorization
+
Frontend capability visibility
```

working together.

---

# 54. Security Boundary

The security model should therefore be:

```text
                 ┌─────────────────┐
                 │  SUPABASE AUTH  │
                 └────────┬────────┘
                          ↓
                 ┌─────────────────┐
                 │  APPLICATION    │
                 │  AUTHORIZATION  │
                 └────────┬────────┘
                          ↓
                 ┌─────────────────┐
                 │      RBAC       │
                 └────────┬────────┘
                          ↓
                 ┌─────────────────┐
                 │     SCOPE       │
                 └────────┬────────┘
                          ↓
                 ┌─────────────────┐
                 │  BUSINESS RULES │
                 └────────┬────────┘
                          ↓
                 ┌─────────────────┐
                 │ POSTGRES RLS    │
                 └────────┬────────┘
                          ↓
                       DATABASE
```

---

# Stage 7 — Final Decisions

| Area                         | Decision       |
| ---------------------------- | -------------- |
| Authentication               | Supabase Auth  |
| Login                        | Email/password |
| MFA                          | Not initially  |
| Google OAuth                 | No             |
| Microsoft OAuth              | No             |
| Biometrics                   | No             |
| Client highest role          | Owner/Admin    |
| Platform highest role        | Super Admin    |
| Custom roles                 | Yes            |
| Granular permissions         | Yes            |
| Permission overrides         | Yes            |
| Branch-level access          | Yes            |
| Business-unit access         | Yes            |
| RBAC                         | Yes            |
| Database RLS                 | Yes            |
| Backend authorization        | Yes            |
| Frontend permission-aware UI | Yes            |
| Employee invitations         | Yes            |
| Employee deactivation        | Yes            |
| Login throttling             | Yes            |
| Audit integration            | Yes            |
| Refund authorization         | Yes            |
| Subscription expiry lock     | Yes            |
| Super Admin expiry exception | Yes            |
| Direct role-based code logic | No             |

---

## Architectural Rule Established

The most important rule from this stage is:

> **Roles are configurations, not application logic.**

The application should understand **permissions and scopes**, not individual job titles.

That means if a client later creates:

> "Senior Sales Supervisor"

with permissions:

```text
sale.create
sale.view
discount.apply
discount.override
customer.create
report.sales.view
```

we don't need to modify the application code at all.

That is exactly what makes this a **Dynamic POS platform rather than a collection of industry-specific POS systems.**

---