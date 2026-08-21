# Stage 25 — Users, Employees, Roles & Granular RBAC

This stage defines **who can access the POS, what they can do, and where they can do it**.

The key architectural principle is:

> **Role determines what a user can do. Scope determines where they can do it.**

This is especially important because your system supports branches and business units.

---

# 25.1 User Hierarchy

The system has two fundamentally different administrative levels.

```text
SUPER ADMIN
    │
    ▼
OWNER
    │
    ▼
BRANCH MANAGER
    │
    ├── CASHIER
    ├── SALESPERSON
    ├── PHARMACIST
    ├── WAITER
    ├── KITCHEN STAFF
    └── CUSTOM ROLES
```

However, this should **not** be implemented as a rigid inheritance tree.

For example:

> A Branch Manager doesn't automatically receive every permission simply because they are above a Cashier.

Instead, the system uses:

```text
Role
+
Permissions
+
Organizational Scope
```

---

# 25.2 Super Admin

The **Super Admin is you/the platform operator**.

You previously established:

> Super Admin gets untethered access.

Therefore, Super Admin is outside the client's normal RBAC restrictions.

The Super Admin can access:

* All client deployments
* Business configuration
* Subscription management
* Client status
* System administration
* Platform-level settings
* Platform analytics
* Deployment information
* Subscription pricing
* Client activation/deactivation
* System-wide configuration

Most importantly:

### Subscription expiry does NOT lock the Super Admin out.

---

# 25.3 Owner

The **Owner** is the highest-level user belonging to a client business.

The Owner controls their entire business.

Typical access:

```text
Business
├── All branches
├── All business units
├── All employees
├── Products
├── Customers
├── Inventory
├── Reports
├── Accounting
├── Configuration
└── Subscription
```

However, even Owner access should still be represented through permissions internally where appropriate.

---

# 25.4 Branch Manager

A Branch Manager operates within an assigned branch.

Example:

```text
User:
John

Role:
Branch Manager

Scope:
Wuse Branch
```

John should not automatically have access to:

```text
Gwarinpa Branch
```

unless explicitly granted.

---

# 25.5 Standard Roles

The initial built-in roles are:

1. Owner
2. Branch Manager
3. Cashier
4. Salesperson
5. Pharmacist
6. Waiter
7. Kitchen Staff
8. Custom Role

These are **templates**, not immutable permission structures.

---

# 25.6 Custom Roles

You explicitly selected:

> Businesses can create custom roles.

Example:

```text
Inventory Supervisor
```

could receive:

```text
inventory.view
inventory.adjust
inventory.count
inventory.transfer.create
```

but not:

```text
users.delete
subscription.manage
```

---

# 25.7 Granular Permissions

Permissions should be granular rather than broad permissions like:

```text
CAN_MANAGE_EVERYTHING
```

Instead:

```text
products.view
products.create
products.edit
products.archive

inventory.view
inventory.adjust
inventory.count
inventory.transfer

sales.view
sales.create
sales.refund
sales.discount

customers.view
customers.create
customers.edit
```

This gives the Owner precise control.

---

# 25.8 Permission Structure

A permission should conceptually contain:

```text id="5z9nkv"
resource.action
```

Examples:

```text
products.view
products.create
products.edit
products.archive

sales.view
sales.create
sales.refund

inventory.view
inventory.adjust

users.view
users.create
users.edit
users.disable
```

---

# 25.9 Permission Categories

The final permission catalogue should be organized into modules.

### Dashboard

```text
dashboard.view
```

### Products

```text
products.view
products.create
products.edit
products.archive
products.configure
```

### Inventory

```text
inventory.view
inventory.adjust
inventory.count
inventory.count.approve
inventory.transfer.create
inventory.transfer.approve
inventory.transfer.receive
```

### Sales

```text
sales.view
sales.create
sales.discount
sales.refund
sales.return
sales.hold
sales.resume
```

### Customers

```text
customers.view
customers.create
customers.edit
customers.archive
customers.view_financials
```

### Employees

```text
users.view
users.create
users.edit
users.disable
users.assign_role
```

### Reports

```text
reports.view
reports.export
reports.create_custom
```

### Configuration

```text
settings.view
settings.edit
```

The complete permission catalogue will be finalized later when all modules have been defined.

---

# 25.10 Role vs Permission

A role is simply a collection of permissions.

Example:

```text id="t9j0av"
Cashier
│
├── sales.create
├── sales.hold
├── sales.resume
├── customers.view
└── customers.create
```

Custom role:

```text id="v9u4c1"
Inventory Supervisor
│
├── inventory.view
├── inventory.adjust
├── inventory.count
└── inventory.transfer.create
```

---

# 25.11 Permission Scope

Permissions alone aren't enough.

Consider:

```text
inventory.adjust
```

A user could have that permission but only within:

```text
Wuse Branch
```

So the authorization check becomes:

```text
Does user have permission?
        +
Does user's scope include this resource?
        ↓
      ALLOW
```

---

# 25.12 Scope Levels

The system should support:

### Business scope

```text
Entire business
```

### Branch scope

```text
Wuse Branch
```

### Business-unit scope

```text
Wuse → Pharmacy
```

Potentially:

### Multiple scopes

```text
Wuse → Supermarket
Wuse → Pharmacy
Gwarinpa → Supermarket
```

---

# 25.13 Example

User:

```text id="pbyq8r"
Jane
```

Role:

```text
Cashier
```

Permissions:

```text
sales.create
sales.hold
sales.resume
customers.view
```

Scope:

```text
Wuse → Supermarket
```

Jane can:

```text
Sell in Wuse Supermarket
View customers
Hold sales
```

Jane cannot:

```text
Sell in Wuse Pharmacy
Adjust inventory
Access Gwarinpa
Refund a transaction
```

unless those permissions/scopes are granted.

---

# 25.14 Role Assignment

An Owner or authorized administrator can assign:

```text
User
↓
Role
↓
Scope
```

For example:

```text
Jane
Cashier
Wuse → Supermarket
```

---

# 25.15 Multiple Roles

I recommend supporting **multiple roles per user**.

Example:

```text
John
├── Cashier
└── Inventory Supervisor
```

This is useful for smaller businesses where one employee performs multiple functions.

The effective permissions become the union of the user's assigned roles, subject to organizational scope.

---

# 25.16 Direct Permissions

You previously chose:

> **Q51: Yes + Permission Enabled**

Therefore, the system should support **direct permission assignments** in addition to roles.

Example:

```text
Role:
Cashier

Additional permission:
sales.refund
```

John could therefore receive a specific additional permission without creating an entirely new role.

---

# 25.17 Explicit Permission Denials

I recommend **not** implementing deny rules in the first version.

Use:

```text
Granted
```

rather than:

```text
Granted
Denied
Inherited
```

Why?

Because deny-overrides-grant systems become complicated quickly.

For example:

```text
Owner role
    ↓
inventory.adjust

User restriction
    ↓
DENY inventory.adjust
```

This makes authorization much harder to reason about.

Instead, use explicit role/scope assignments.

---

# 25.18 Effective Permission

The authorization engine calculates:

```text
User
+
Roles
+
Direct permissions
+
Scope
=
Effective permissions
```

Example:

```text
Jane
│
├── Role: Cashier
│     ├── sales.create
│     └── customers.view
│
└── Direct:
      └── sales.refund

Effective:
├── sales.create
├── customers.view
└── sales.refund
```

---

# 25.19 Permission Changes

Permission changes should take effect without requiring the user to be recreated.

However, the system must avoid stale authorization state.

If an Owner removes:

```text
sales.refund
```

the employee should lose that ability promptly.

This will be particularly important when we design the Supabase authorization architecture.

---

# 25.20 Employee Status

Users should have:

```text id="r9y5c6"
ACTIVE
SUSPENDED
INVITED
DISABLED
```

### Invited

Account hasn't completed onboarding.

### Active

Can authenticate and operate.

### Suspended

Temporarily blocked.

### Disabled

No longer allowed to use the application.

Historical activity remains.

---

# 25.21 Employee Invitation

An Owner/authorized administrator can invite an employee.

Workflow:

```text id="w5h7nv"
Create Employee
       ↓
Assign Role
       ↓
Assign Scope
       ↓
Send Invitation
       ↓
Employee Accepts
       ↓
Creates Password
       ↓
Account Active
```

---

# 25.22 Authentication

Your earlier security decisions excluded:

❌ MFA/2FA
❌ Google OAuth
❌ Microsoft OAuth
❌ Biometric authentication

Therefore the initial authentication model is:

> **Email + password**

Supabase Auth will handle the underlying authentication mechanism.

---

# 25.23 Password Security

The application should never store raw passwords.

Authentication credentials are managed by Supabase Auth.

The application database stores the user's business/employee profile separately.

Conceptually:

```text id="3v1vpc"
Supabase Auth User
        │
        │ 1:1
        ▼
Application User Profile
```

---

# 25.24 Employee Profile

The application profile can contain:

```text id="9qg6jz"
User ID
First name
Last name
Display name
Phone
Email
Employee ID
Status
Role assignments
Scope assignments
Created at
Updated at
```

---

# 25.25 Employee ID

Businesses should be able to assign internal employee identifiers.

Example:

```text id="c5y2i1"
EMP-0012
```

This is useful for:

* Reports
* Audit logs
* Staff identification
* Operational management

---

# 25.26 Cashier Identification

For POS operations, the UI should make the active employee obvious.

Example:

```text id="1v3g3w"
Logged in as:
Jane Doe
Cashier
Wuse Supermarket
```

This helps prevent employees from accidentally performing transactions under the wrong account.

---

# 25.27 Sensitive Actions

Some actions should require additional authorization even if a user can operate the POS.

You already established:

> Refunds require authorization.

Therefore:

```text id="p3e5qn"
Cashier
 ↓
Request Refund
 ↓
Authorization
 ↓
Approved
 ↓
Refund
```

The authorization mechanism can be defined in the transaction/security stages.

---

# 25.28 Discount Permissions

You also established that discounts are permission-controlled.

Therefore:

```text id="q9j5yk"
sales.discount
```

should be a distinct permission.

The business can decide whether:

```text id="z89a5c"
Cashier → YES
```

or:

```text id="8nj9b1"
Cashier → NO
Manager → YES
```

---

# 25.29 Maximum Discount Controls

I recommend supporting configurable limits.

For example:

```text id="3eq1ju"
Cashier:
Maximum discount = 5%

Manager:
Maximum discount = 20%

Owner:
Unlimited
```

This should eventually become part of the business configuration.

It provides stronger control than simply granting or denying discount access.

---

# 25.30 Role Management UI

Owner should have a role-management interface:

```text id="qk5n3s"
Roles
────────────────────────────

Owner
Branch Manager
Cashier
Salesperson
Pharmacist
Waiter
Kitchen Staff
Inventory Supervisor
Custom Role
```

Selecting a role:

```text id="e9d3xh"
Cashier

Sales
☑ Create sale
☑ Hold sale
☑ Resume sale
☐ Refund
☐ Delete sale

Customers
☑ View
☑ Create
☐ Archive

Inventory
☐ Adjust
☐ Transfer
```

---

# 25.31 Permission Groups

To avoid an overwhelming list, permissions should be grouped by module.

Example:

```text id="9y4l7t"
SALES
  Create
  View
  Discount
  Refund
  Return
  Hold
  Resume

INVENTORY
  View
  Adjust
  Count
  Transfer
```

This gives administrators a manageable UI while retaining granular permissions underneath.

---

# 25.32 Role Templates

Built-in roles should come with sensible defaults.

For example:

### Cashier

Primarily:

```text id="7s9lxi"
Sales
Customers
Receipts
```

### Branch Manager

Primarily:

```text id="8s7c2q"
Sales
Inventory
Customers
Employees
Reports
Branch configuration
```

### Pharmacist

Primarily:

```text id="m2xk8j"
Sales
Products
Customers
Pharmacy-related operations
```

Since prescription management was explicitly excluded, the Pharmacist role does **not** require prescription-specific permissions.

---

# 25.33 Role Customization

Built-in roles should be editable by the Owner.

However, I recommend preserving a distinction:

```text
System Role
```

vs.

```text
Custom Role
```

This allows us to upgrade the platform without corrupting the client's custom authorization structure.

---

# 25.34 Role Deletion

A role currently assigned to employees should not be hard-deleted.

Workflow:

```text id="7kt3bq"
Role
 ↓
Deactivate
 ↓
Reassign affected users
 ↓
Archive
```

---

# 25.35 Employee Deletion

Employees should similarly be disabled rather than deleted if they have historical activity.

For example:

```text id="1j3x8a"
Jane
```

may have performed:

```text
2,431 transactions
```

Deleting her identity would damage auditability.

So:

```text id="kq2g8q"
Disable employee
```

rather than destroying the record.

---

# 25.36 Audit Trail

All sensitive authorization changes should enter the audit system.

Examples:

```text id="w8r7yk"
Role created
Role modified
Permission granted
Permission removed
Employee invited
Employee disabled
Employee role changed
Employee scope changed
```

The audit system will be defined separately.

---

# 25.37 Permission Change Example

Owner changes:

```text id="3a9yud"
Jane
Cashier
```

from:

```text
Wuse → Supermarket
```

to:

```text
Wuse → Pharmacy
```

The system records:

```text id="1y4f4p"
Previous scope:
Wuse → Supermarket

New scope:
Wuse → Pharmacy

Changed by:
Owner

Timestamp:
...
```

---

# 25.38 Authorization Architecture

The conceptual authorization request is:

```text id="f9ocm4"
REQUEST
   │
   ▼
Authenticated User
   │
   ▼
Is account active?
   │
   ▼
Does user have permission?
   │
   ▼
Does scope match resource?
   │
   ▼
Is business/subscription active?
   │
   ▼
ALLOW / DENY
```

This becomes especially important with your subscription-lock requirement.

---

# 25.39 Subscription vs Authorization

Subscription status is **not itself a role permission**.

Instead:

```text id="6q3gqk"
Authenticated
      +
Authorized
      +
Subscription Active
      ↓
Application Access
```

If the subscription expires:

```text id="g7j3xv"
Application Access = DENIED
```

except for Super Admin.

---

# 25.40 Super Admin Bypass

Super Admin is special.

Conceptually:

```text id="m9r4tw"
if user.role == SUPER_ADMIN
    unrestricted platform access
else
    normal business authorization
```

This must be implemented carefully rather than relying on a frontend role check.

---

# 25.41 Security Principle

**Never trust the role stored in the browser.**

For example, changing:

```text id="7kqjxn"
role = owner
```

in browser developer tools must accomplish nothing.

Authorization must be enforced server-side/database-side.

This will be a major part of our Supabase RLS architecture.

---

# 25.42 Final RBAC Model

The final model is:

```text id="0wqz9s"
USER
 │
 ├── ROLE(S)
 │     │
 │     └── PERMISSIONS
 │
 └── SCOPE(S)
       │
       ├── BUSINESS
       ├── BRANCH
       └── BUSINESS UNIT
```

Therefore:

> **Role = what you can do**

> **Scope = where you can do it**

> **Authentication = who you are**

> **Subscription = whether the client deployment is currently active**

This separation gives us a clean security architecture.

---

# 25.43 Stage 25 Decision Summary

| Capability                    | Decision |
| ----------------------------- | -------- |
| Super Admin                   | ✅        |
| Untethered Super Admin        | ✅        |
| Owner                         | ✅        |
| Branch Manager                | ✅        |
| Cashier                       | ✅        |
| Salesperson                   | ✅        |
| Pharmacist                    | ✅        |
| Waiter                        | ✅        |
| Kitchen Staff                 | ✅        |
| Custom roles                  | ✅        |
| Granular permissions          | ✅        |
| Multiple roles/user           | ✅        |
| Direct permissions            | ✅        |
| Permission scopes             | ✅        |
| Business scope                | ✅        |
| Branch scope                  | ✅        |
| Business-unit scope           | ✅        |
| Employee invitations          | ✅        |
| Employee status               | ✅        |
| Email/password authentication | ✅        |
| MFA/2FA                       | ❌        |
| Google OAuth                  | ❌        |
| Microsoft OAuth               | ❌        |
| Biometrics                    | ❌        |
| Permission denial rules       | ❌        |
| Hard-delete employees         | ❌        |
| Hard-delete assigned roles    | ❌        |
| Audit authorization changes   | ✅        |
| Subscription-aware access     | ✅        |
