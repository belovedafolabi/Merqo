# Stage 24 — Business Structure, Branches & Business Units

This stage formalizes the organizational structure of the POS. This is particularly important because your system isn't simply:

> **Business → Branches**

It needs to support a business operating **multiple branches, with different business units/sub-businesses inside those branches**, while still being managed under one client deployment.

This stage is now about **structure and boundaries**, not POS transactions or inventory mechanics.

---

# 24.1 Core Organizational Hierarchy

The system will use:

```text
Client / Business
│
├── Branch 1
│   │
│   ├── Business Unit 1
│   │
│   ├── Business Unit 2
│   │
│   └── Business Unit 3
│
├── Branch 2
│   │
│   ├── Business Unit 1
│   └── Business Unit 2
│
└── Branch 3
    └── Business Unit 1
```

### Example

A client could be:

> **Ade Supermarket Ltd**

with:

```text
Ade Supermarket Ltd
│
├── Wuse Branch
│   ├── Supermarket
│   └── Pharmacy
│
├── Gwarinpa Branch
│   ├── Supermarket
│   └── Bakery
│
└── Maitama Branch
    └── Supermarket
```

All of these belong to the **same client business**.

---

# 24.2 Business

The **Business** is the highest organizational entity belonging to the client.

It represents the company using the POS.

Example:

```text
Ade Supermarket Ltd
```

The business owns:

* Branches
* Business units
* Users/employees
* Products
* Customers
* Configuration
* Financial records
* Reports
* Subscription information

---

# 24.3 Business Does NOT Mean Business Type

This distinction is important.

A **business type** is a classification/configuration concept.

A **business** is the actual client/company.

For example:

```text
Business:
Ade Supermarket Ltd
```

could select:

```text
Business Types:
Supermarket
Pharmacy
```

while its organizational structure might be:

```text
Wuse Branch
 ├── Supermarket
 └── Pharmacy
```

So:

> **Business type ≠ business unit.**

---

# 24.4 Business Type

You previously selected the second interpretation for business type.

The system should therefore treat business type primarily as a **configuration/category**, rather than as a rigid architectural boundary.

Possible types include:

* Supermarket
* Convenience store
* Restaurant
* Pharmacy
* Clothing/Fashion
* Electronics
* Hardware/Building Materials
* Beauty Salon
* Barbershop
* Hotel
* Bakery
* Wholesaler
* General Retail
* Other

A business can select **one or multiple types** during onboarding.

---

# 24.5 Why Multiple Business Types?

Consider:

```text
Ade Retail Ltd
```

It might operate:

```text
Supermarket
Pharmacy
Bakery
```

There is no reason to force the entire client deployment into only one category.

The selected types influence:

* Available features
* Recommended configuration
* Default terminology
* Dashboard widgets
* POS workflows
* Product fields
* Reports
* Permissions

But they should **not unnecessarily restrict the rest of the platform**.

---

# 24.6 Business Type vs Feature Availability

A pharmacy type could enable pharmacy-oriented functionality.

A restaurant type could enable restaurant-oriented functionality.

However:

> **Business type should be a starting configuration, not a permanent limitation.**

For example, a business initially configured as:

```text
Supermarket
```

could later enable:

```text
Pharmacy capabilities
```

if they add a pharmacy.

This is one of the reasons the system needs a configurable platform architecture.

---

# 24.7 Branch

A **Branch** represents a physical operating location.

Example:

```text
Wuse Branch
```

A branch has:

* Address
* Contact information
* Operating status
* Business units
* Employees
* Inventory
* POS configuration
* Sales
* Reports

---

# 24.8 Branch Independence

Branches should operate independently for operational purposes.

For example:

```text
Wuse Branch
Inventory: 500 units

Gwarinpa Branch
Inventory: 200 units
```

Sales at Wuse should not directly affect Gwarinpa's inventory.

This aligns with your branch-specific inventory decision.

---

# 24.9 Business Unit / Sub-Business

A **Business Unit** represents a distinct operational business/sub-business inside a branch.

Examples:

```text
Wuse Branch
├── Supermarket
└── Pharmacy
```

or:

```text
Restaurant Branch
├── Restaurant
└── Juice Bar
```

or:

```text
Hotel Branch
├── Hotel
├── Restaurant
└── Spa
```

---

# 24.10 Business Unit Is Not Another Branch

This distinction is critical.

A branch represents:

> **Where the operation physically exists.**

A business unit represents:

> **What distinct operation exists within that location.**

Therefore:

```text
Wuse Branch
 ├── Supermarket
 └── Pharmacy
```

is preferable to creating:

```text
Wuse Supermarket Branch
Wuse Pharmacy Branch
```

---

# 24.11 Business Unit Independence

You selected:

> **Q21 = C**

Therefore, business units do not need to become completely independent companies inside the system.

They remain under the branch/business hierarchy.

They can have their own:

* POS configuration
* Operational settings
* Users
* Inventory context
* Reports
* Feature configuration

while remaining controlled by the parent business.

---

# 24.12 Business Unit POS Configuration

You explicitly selected:

> **Q22 = YES**

Therefore every business unit can have its own POS configuration.

Example:

### Supermarket

```text
Default payment:
Cash

Receipt:
Supermarket receipt

Tax:
Configured rate

Service charge:
Disabled
```

### Pharmacy

```text
Default payment:
Card

Receipt:
Pharmacy receipt

Tax:
Different configured settings
```

They exist inside the same branch but don't need identical POS settings.

---

# 24.13 Business Unit Product Ownership

You corrected Q23 and explicitly said:

> **Keep my answer.**

Therefore:

> **The same product cannot exist in multiple business units.**

This is a strong architectural rule.

For example:

```text
Wuse Branch
├── Supermarket
│   └── Coca-Cola
│
└── Pharmacy
```

Coca-Cola cannot simultaneously belong to both units.

This prevents ambiguous inventory ownership and pricing.

---

# 24.14 Product Assignment

A product therefore has an organizational context.

Conceptually:

```text
Product
   ↓
Business
   ↓
Branch
   ↓
Business Unit
```

The exact database implementation can optimize this later, but the business rule remains:

> A product is assigned to one business unit within a branch.

---

# 24.15 Pricing

You previously selected:

> **Pricing configurable at Branch Level.**

This creates an important distinction.

The business unit determines **operational ownership/context**, while the branch provides the pricing scope.

For example:

```text
Coca-Cola
Global/base price: ₦1,000

Wuse Branch:
₦1,000

Gwarinpa Branch:
₦1,050
```

If the business unit has its own configuration, the POS can still operate using the branch's configured pricing.

---

# 24.16 Branch Configuration

Branch configuration can include:

* Currency
* Tax configuration
* Service charge
* Pricing
* Receipt configuration
* Default payment method
* Inventory rules
* POS behavior
* Operational settings

Some settings can inherit from the business-level defaults.

---

# 24.17 Configuration Inheritance

To avoid forcing administrators to configure every branch manually, use:

```text
Business Default
      ↓
Branch Override
      ↓
Business Unit Override
```

For example:

```text
Tax:
Business = 7.5%

Branch:
inherits 7.5%

Business Unit:
inherits 7.5%
```

If the branch needs something different:

```text
Branch = 5%
```

then the branch takes precedence.

This should be explicit and visible in the UI.

---

# 24.18 Configuration Hierarchy

The general rule should be:

```text
System Default
      ↓
Business
      ↓
Branch
      ↓
Business Unit
```

The most specific applicable configuration wins.

However, not every setting needs to support every level.

We should only allow overrides where they make operational sense.

---

# 24.19 Branch Status

Branches should support:

```text
ACTIVE
INACTIVE
ARCHIVED
```

An inactive branch cannot process normal POS sales.

Historical data remains accessible.

---

# 24.20 Business Unit Status

Likewise:

```text
ACTIVE
INACTIVE
ARCHIVED
```

If a pharmacy closes inside a supermarket:

```text
Wuse
├── Supermarket ACTIVE
└── Pharmacy ARCHIVED
```

Historical pharmacy transactions remain intact.

---

# 24.21 Opening / Closing Branches

Branch creation should not automatically mean the branch is ready for sales.

A branch may need:

```text
Created
 ↓
Configured
 ↓
Business unit created
 ↓
Products assigned
 ↓
Users assigned
 ↓
Activated
```

This avoids partially configured branches becoming operational accidentally.

---

# 24.22 Branch Managers

A Branch Manager can be assigned to one or more branches depending on permissions.

Example:

```text
Manager A
 ├── Wuse
 └── Gwarinpa
```

or:

```text
Manager B
 └── Wuse
```

The RBAC system determines what they can actually do.

---

# 24.23 User Scope

Users should have an organizational scope.

For example:

```text
Owner
→ Entire Business

Branch Manager
→ Wuse Branch

Cashier
→ Wuse Branch / Supermarket Unit
```

This is separate from the **permission** itself.

A user might have:

```text
inventory.adjust
```

but only within:

```text
Wuse → Supermarket
```

This distinction is extremely important.

### Permission

> **What can you do?**

### Scope

> **Where can you do it?**

---

# 24.24 Cross-Branch Access

The Owner should have business-wide visibility.

A Branch Manager should generally be restricted to their assigned branch unless granted broader access.

Custom roles should be able to receive broader scopes where appropriate.

---

# 24.25 Business Unit Access

The same concept applies to business units.

A user could have:

```text
Branch:
Wuse

Business Unit:
Pharmacy
```

meaning they cannot automatically access:

```text
Wuse → Supermarket
```

unless their permissions/scope allow it.

---

# 24.26 Cross-Business-Unit Transactions

A transaction belongs to the business unit through which it was created.

Example:

```text
Wuse
└── Pharmacy
    └── POS Transaction #1001
```

It should not be ambiguous whether the sale belongs to:

```text
Pharmacy
```

or:

```text
Supermarket
```

---

# 24.27 Cross-Business-Unit Customers

Customers remain **business-wide**.

Therefore:

```text
John Doe
```

can buy from:

```text
Wuse → Supermarket
```

and later:

```text
Wuse → Pharmacy
```

without requiring duplicate customer accounts.

---

# 24.28 Cross-Business-Unit Reporting

The Owner can view:

```text
Business
├── All branches
├── All business units
└── Consolidated reports
```

while managers can be restricted to their scope.

Reports should support filtering by:

* Branch
* Business unit
* Date
* Product
* Category
* Employee
* Transaction type

---

# 24.29 Business-Wide Product Catalogue

The business maintains the master catalogue.

However, because you decided that a product cannot exist in multiple business units, assignment determines where it is operationally available.

This allows:

```text
Master Product Catalogue
       ↓
Business Unit Assignment
       ↓
Branch Inventory
```

without creating duplicate product definitions.

---

# 24.30 Branch Transfers

The simple stock transfer system defined previously operates primarily at branch level.

Example:

```text
Wuse Supermarket
       ↓
20 Coca-Cola
       ↓
Gwarinpa Supermarket
```

The transfer should know both the source and destination business units.

This prevents ambiguity.

---

# 24.31 Business Unit Deletion

Business units should not be hard-deleted if they have historical data.

Instead:

```text
ACTIVE
 ↓
INACTIVE
 ↓
ARCHIVED
```

Historical:

* Transactions
* Inventory movements
* Reports
* Audit events

remain intact.

---

# 24.32 Branch Deletion

Same principle.

A branch with historical transactions should be archived rather than physically deleted.

This protects financial and audit integrity.

---

# 24.33 Business-Level Settings

The business remains the top-level configuration authority for:

* Branding
* Default tax
* Default service charge
* Receipt templates
* User policies
* Security policies
* Notification preferences
* General POS configuration
* Subscription state

---

# 24.34 Business Branding

Your earlier branding decision belongs at the business level:

```text
Business
├── Brand name
├── Logo
├── Primary color
└── Secondary color
```

Branches/business units can optionally inherit this branding.

---

# 24.35 Branch Branding

I recommend **not** allowing completely independent branding per branch in the MVP.

Otherwise the configuration becomes unnecessarily complicated.

Default:

```text
Business Branding
       ↓
All Branches
       ↓
All Business Units
```

Future branch-specific branding can be added if there's a genuine customer requirement.

---

# 24.36 Subscription Scope

The subscription belongs to the **Business/client deployment**, not to an individual branch or business unit.

Therefore:

```text
Business Subscription
       ↓
Branch A
Branch B
Branch C
Business Units...
```

There is one subscription state for the entire client deployment.

---

# 24.37 Subscription Expiry

Your previously locked rule remains:

When the subscription expires:

```text
Business
   ↓
Application Locked
```

Users cannot log in and active sessions are terminated.

**Super Admin remains unrestricted.**

This stage does not change that behavior.

---

# 24.38 Business Structure Database Concept

At a high level:

```text
businesses
    │
    ├── branches
    │      │
    │      └── business_units
    │
    ├── users
    ├── products
    ├── customers
    └── subscription
```

Then operational records reference the appropriate scope.

---

# 24.39 Recommended Organizational IDs

Every relevant entity should be traceable to:

```text
business_id
branch_id
business_unit_id
```

where applicable.

This will be particularly useful for:

* Authorization
* Reporting
* Inventory
* Auditing
* Data isolation
* Analytics

---

# 24.40 Important Architectural Rule

The system should **never infer organizational scope from the frontend**.

For example, hiding:

```text
Gwarinpa Branch
```

from a Wuse manager in the UI is not security.

The backend/database authorization layer must enforce:

```text
User scope
→ Requested resource scope
→ Permission
→ Allow/Deny
```

This becomes especially important with Supabase Row Level Security.

---

# 24.41 Final Organizational Model

The resulting architecture is:

```text
                         SUPER ADMIN
                             │
                             ▼
                       CLIENT BUSINESS
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
           BRANCH A       BRANCH B       BRANCH C
              │              │              │
          ┌───┴───┐          │          ┌───┴───┐
          ▼       ▼          ▼          ▼       ▼
      UNIT A   UNIT B     UNIT A     UNIT A   UNIT B
          │       │          │          │       │
          ▼       ▼          ▼          ▼       ▼
       POS /   POS /      POS /      POS /    POS /
       Stock   Stock      Stock      Stock    Stock
```

Meanwhile:

```text
Customers
Products
Users
Reports
Subscription
```

belong to the broader **Business** context, with appropriate branch/unit scoping where required.

---

# 24.42 Stage 24 Decision Summary

| Capability                                     | Decision                    |
| ---------------------------------------------- | --------------------------- |
| Multiple branches                              | ✅                           |
| Sub-businesses/business units                  | ✅                           |
| Business types                                 | Configurable classification |
| Multiple business types                        | ✅                           |
| Business-unit POS configuration                | ✅                           |
| Business-unit inventory context                | ✅                           |
| Same product in multiple business units        | ❌                           |
| Branch-specific inventory                      | ✅                           |
| Branch-level pricing                           | ✅                           |
| Branch-specific configuration                  | ✅                           |
| Business-wide customers                        | ✅                           |
| Business-wide product catalogue                | ✅                           |
| Cross-branch customers                         | ✅                           |
| Cross-branch reporting                         | ✅                           |
| Cross-branch stock transfers                   | ✅                           |
| Business-unit-to-business-unit stock transfers | ❌ MVP                       |
| Branch managers                                | ✅                           |
| Scoped user access                             | ✅                           |
| Granular permissions                           | ✅                           |
| Business-wide subscription                     | ✅                           |
| Business branding                              | ✅                           |
| Branch-specific branding                       | ❌ MVP                       |
| Hard deletion of operational entities          | ❌                           |
| Archive/inactivate                             | ✅                           |