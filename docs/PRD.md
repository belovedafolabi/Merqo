# Dynamic POS System — Product Requirements Document

**Document Version:** 1.0
**Status:** Draft — Requirements Baseline
**Product Type:** Configurable Multi-Industry POS Platform
**Deployment Model:** Independent deployment per client
**Primary Stack:** Supabase + ERN
**Target Infrastructure Budget:** Free preferred; maximum approximately **$10/month**
**Offline Mode:** **Not supported**

---

# 1. Executive Summary

The Dynamic POS is a configurable Point-of-Sale platform designed to support multiple categories of businesses from a single product architecture.

Rather than creating separate POS applications for supermarkets, restaurants, pharmacies, fashion stores, electronics stores, hotels, etc., the system provides a **common core POS engine** with configurable business capabilities.

A business selects its business type during onboarding. The system then configures the appropriate capabilities, terminology, workflows, and settings for that business.

The platform will support:

* Multiple branches
* Multiple Business Units within branches
* Branch-level pricing
* Business-specific POS configurations
* Product and inventory management
* Sales and payments
* Customers
* Store credit
* Layaway/installments
* Returns and refunds
* Accounting
* Reporting
* Custom reports
* Configurable taxes and service charges
* Granular RBAC
* Custom roles
* Audit logging
* Subscription management
* Business branding
* Selected restaurant and pharmacy functionality
* Hardware integration
* Strong transaction integrity and concurrency protection

The product will be deployed independently for each client rather than operating as a conventional shared multi-tenant SaaS platform.

---

# 2. Product Vision

## 2.1 Vision

Build a **highly configurable POS platform capable of adapting to different business models without requiring a separate application for each industry.**

The system should allow the platform owner to progressively introduce new capabilities while allowing individual businesses to activate only the functionality relevant to their operations.

### Core philosophy

> **One POS engine. Multiple business models. Configurable capabilities.**

---

# 3. Problem Statement

Traditional POS systems tend to fall into one of two categories:

### Generic POS

Simple and easy to deploy, but lacks specialized functionality.

### Industry-specific POS

Highly specialized but difficult to adapt to businesses operating across multiple categories.

This creates problems for businesses such as:

> A supermarket that also operates a pharmacy.

or:

> A restaurant that also operates a juice bar.

The business should not need two completely unrelated systems.

The Dynamic POS therefore introduces a hierarchical structure:

```text
Client
 │
 ├── Branch A
 │    │
 │    ├── Supermarket
 │    │
 │    └── Pharmacy
 │
 └── Branch B
      │
      └── Restaurant
```

These operational entities are represented as **Business Units**.

---

# 4. Product Goals

## 4.1 Primary Goals

The system must:

1. Support multiple industries.
2. Allow businesses to select business types during onboarding.
3. Allow multiple branches.
4. Allow multiple Business Units within branches.
5. Allow Business Units to have independent configurations.
6. Maintain separate inventory for Business Units where configured.
7. Prevent products from being shared between Business Units.
8. Support branch-level pricing.
9. Provide a fast POS interface.
10. Support barcode-based sales.
11. Support configurable taxes and service charges.
12. Support multiple payment methods.
13. Support returns and authorized refunds.
14. Support store credit.
15. Support layaway/installment payments.
16. Provide granular RBAC.
17. Support custom roles.
18. Maintain immutable transactional history.
19. Maintain comprehensive audit logs.
20. Protect transactions against concurrency problems.
21. Support configurable business branding.
22. Provide comprehensive reporting.
23. Support subscription management.
24. Remain deployable using primarily free infrastructure.

---

# 5. Non-Goals

The first version will **not** attempt to become a complete ERP.

The following are explicitly outside the product scope:

### Procurement

* Suppliers
* Purchasing
* Purchase orders
* Supplier invoices

### Advanced restaurant management

* Tables
* Reservations
* Table layouts
* Table assignment
* Delivery management
* Kitchen Display System
* Recipes
* Ingredients
* Ingredient deduction
* Modifiers
* Add-ons
* Meal combos
* Multiple kitchens
* Customer tabs
* Tips

### Advanced pharmacy management

* Prescription management
* Patient records
* Doctor information
* Drug interactions
* Controlled medication tracking
* Insurance
* Partial dispensing
* Prescription authorization

### Customer loyalty

* Loyalty points
* Membership tiers
* Customer groups
* Customer preferences

### POS payment processing

The POS records customer payments but does not act as the payment processor.

### Offline operation

The application **requires an active internet connection**.

---

# 6. Target Businesses

The platform will initially support:

1. Supermarkets
2. Convenience stores
3. Restaurants
4. Pharmacies
5. Clothing/fashion stores
6. Electronics stores
7. Hardware/building-material stores
8. Beauty salons/barbers
9. Hotels
10. Bakeries
11. Wholesalers
12. General retail
13. Other

The architecture must allow additional business types to be introduced without rewriting the core POS engine.

---

# 7. Business Type vs Business Unit

This distinction is critical.

## Business Type

A **business type describes what kind of operation a business performs.**

Examples:

```text
Supermarket
Restaurant
Pharmacy
Fashion Store
Electronics Store
```

It primarily determines the default capabilities and configuration template.

## Business Unit

A **Business Unit is an actual operational entity belonging to the client.**

Example:

```text
ABC Holdings
│
└── Abuja Branch
     │
     ├── ABC Supermarket
     └── ABC Pharmacy
```

The Supermarket and Pharmacy are Business Units.

They may have:

* Different products
* Different inventory
* Different POS configurations
* Different employees
* Different permissions
* Different operational settings

---

# 8. Organization Hierarchy

The system follows:

```text
Super Admin
     │
     ▼
Client / Organization
     │
     ▼
Branches
     │
     ▼
Business Units
     │
     ├── Products
     ├── Inventory
     ├── POS
     ├── Employees
     └── Configuration
```

---

# 9. Super Admin

The Super Admin is the platform owner/developer.

The Super Admin has **untethered access** to the system.

This includes:

* Client management
* Client configuration
* Subscription management
* Pricing management
* Platform configuration
* Feature management
* Client access
* Client support
* Audit access
* System administration
* Platform-level configuration

The subscription lock does **not** apply to the Super Admin.

---

# 10. Owner / Admin

The Owner is the highest-level user belonging to a client organization.

The Owner can manage:

* Business profile
* Branches
* Business Units
* Employees
* Roles
* Permissions
* Products
* Inventory
* Pricing
* Taxes
* Service charges
* Receipts
* Reports
* Branding
* Subscription
* Business configuration

The exact abilities are governed by the permission system.

---

# 11. Employee Roles

Default roles:

* Branch Manager
* Cashier
* Salesperson
* Pharmacist
* Waiter
* Kitchen Staff
* Custom Role

The system must not hard-code authorization logic solely around role names.

Instead:

```text
User
 ↓
Role
 ↓
Permissions
 ↓
Resource
 ↓
Action
```

This allows businesses to create custom organizational structures.

---

# 12. Permission System

Permissions must be granular.

Example:

```text
sales.view
sales.create
sales.cancel

discount.view
discount.create
discount.approve

refund.view
refund.create
refund.approve

inventory.view
inventory.adjust
inventory.transfer

product.view
product.create
product.update
product.archive
```

Permissions should be checked server-side.

The frontend must never be treated as the security boundary.

---

# 13. Product Requirements

The product engine must support:

* Product creation
* Product editing
* Product archiving
* Categories
* Variants
* SKU
* Barcode
* Product attributes
* Images
* Units of measurement
* Cost price
* Selling price
* Pricing levels
* Branch pricing
* Product status
* Product history

Products belong to Business Units.

### Important constraint

The same product **cannot exist in multiple Business Units**.

---

# 14. Inventory Requirements

Inventory must be Business Unit-aware.

The system must support:

* Stock quantities
* Inventory adjustments
* Stock additions
* Stock deductions
* Stock history
* Low-stock thresholds
* Low-stock notifications
* Batch tracking
* Expiry dates
* Expired product controls
* Inventory valuation
* Inventory reports
* Simple stock transfers

---

# 15. Stock Transfers

Stock transfers are supported but intentionally simple.

```text
Source Business Unit
        ↓
Destination Business Unit
        ↓
Product
        ↓
Quantity
        ↓
Confirmation
        ↓
Inventory adjustment
```

The transfer must produce an immutable audit record.

---

# 16. POS Requirements

The POS interface must prioritize **speed over visual complexity**.

It must support:

* Barcode scanning
* Product search
* Category filtering
* Product variants
* Cart
* Quantity adjustment
* Discounts
* Tax
* Service charge
* Payment selection
* Store credit
* Hold sale
* Resume sale
* Returns
* Refunds
* Receipt generation

---

# 17. Payment Methods

Supported:

* Cash
* Card
* Bank transfer
* Store credit

The business can configure a **default payment method** for faster checkout.

The following are excluded:

* Split payment
* Mobile payment
* Gift cards
* Paystack customer payment processing

Paystack is used exclusively for **software subscription renewal**.

---

# 18. Discounts

The system supports:

* Fixed discounts
* Percentage discounts

Discounts must be permission-controlled.

A business can define:

* Who can discount
* Maximum discount percentage
* Maximum discount amount
* Whether authorization is required
* Discount reason requirements

Every discount must be auditable.

---

# 19. Taxes

The system supports a configurable tax system.

The administrator can define the applicable tax rate.

Multiple simultaneous tax rates are not required for MVP.

---

# 20. Service Charges

Service charges are available across business types.

The Owner/Admin can enable or disable them.

Supported configuration:

* Percentage
* Fixed amount

---

# 21. Returns & Refunds

Returns are supported.

Refunds require authorization.

The system must record:

* Original transaction
* Returned items
* Quantity
* Reason
* Refund amount
* Initiating user
* Authorizing user
* Timestamp
* Inventory effect
* Financial effect

Transactions must never simply be deleted to reverse a sale.

---

# 22. Store Credit

Store credit is tied to an existing customer.

The system maintains a credit ledger.

Supported:

* Credit issuance
* Credit usage
* Credit refunds
* Balance
* Transaction history
* Permission control

---

# 23. Layaway / Installments

Layaway requires a customer.

The system records:

1. Customer
2. Products
3. Original amount
4. Amount paid
5. Outstanding balance
6. Payment history
7. Installment payments
8. Completion status

---

# 24. Customer Management

The system supports:

* Customer creation
* Customer editing
* Search
* Identification
* Transaction history
* Store credit
* Layaway

Excluded:

* Loyalty
* Membership tiers
* Customer groups
* Preferences

---

# 25. Restaurant Capabilities

The restaurant configuration can activate restaurant-specific capabilities that are included in the core product.

However, the first version deliberately avoids building a full restaurant-management system.

The restaurant primarily uses the common:

* Product/menu
* POS
* Customer
* Payment
* Reporting
* Inventory

architecture.

---

# 26. Pharmacy Capabilities

The pharmacy configuration supports:

* Pharmacy products
* Batch tracking
* Expiry tracking
* Inventory
* POS
* Reporting

The system does not attempt to become a pharmacy-management/clinical system.

---

# 27. Accounting

The accounting module is intermediate rather than a full accounting ERP.

It supports:

* Revenue
* COGS
* Gross profit
* Expenses
* Net profit
* Payment summaries
* Store credit balances
* Layaway balances

---

# 28. Reporting

Standard reports include:

### Sales

* Sales by date
* Sales by branch
* Sales by Business Unit
* Sales by employee
* Sales by product
* Sales by category
* Sales by payment method

### Inventory

* Current stock
* Stock movement
* Low stock
* Expiry
* Valuation

### Financial

* Revenue
* COGS
* Gross profit
* Expenses
* Net profit
* Tax
* Discounts
* Refunds

### Customer

* Customer transactions
* Store credit
* Layaway

---

# 29. Custom Reports

Authorized users can construct custom reports using supported data dimensions.

Reports should support:

* Filters
* Sorting
* Date ranges
* Grouping
* Aggregation
* Saved configurations
* Export

Formats:

* CSV
* Excel
* PDF

---

# 30. Receipt System

Receipts support:

* Digital receipt
* Printed receipt
* Multiple templates
* Business logo
* Business name
* Primary color
* Secondary color
* Transaction information
* Payment information
* Tax
* Service charge
* Discount

The customer-facing receipt must **not display any offline transaction indicator**, because offline transactions do not exist in this architecture.

---

# 31. Branding

Each organization can configure:

* Brand name
* Logo
* Primary color
* Secondary color

The administrative interface uses a neutral black/white foundation while allowing business branding to be layered on top.

---

# 32. Online-Only Architecture

The POS requires an active internet connection.

There is:

* No offline mode
* No local transaction queue
* No synchronization engine
* No offline conflict-resolution engine

The transaction path is:

```text
POS
 ↓
Express API
 ↓
Database transaction
 ↓
Inventory update
 ↓
Transaction committed
 ↓
Receipt
```

This substantially reduces architectural complexity.

---

# 33. Concurrency Requirements

Concurrency protection remains mandatory.

Example:

```text
Stock = 1

Cashier A ──┐
            ├──> Database
Cashier B ──┘
```

The system must guarantee consistent inventory results.

Required mechanisms include:

* Atomic database operations
* Transactions
* Appropriate locking/concurrency controls
* Optimistic concurrency where appropriate
* Idempotency
* Duplicate request protection
* Immutable transaction records

---

# 34. Transaction Immutability

Transactional records cannot be directly modified or deleted after completion.

Corrections must be represented through new transactions/events.

For example:

```text
Original Sale
     ↓
Return
     ↓
Refund
```

rather than:

```text
Original Sale
     ↓
DELETE
```

This is necessary for financial integrity and auditability.

---

# 35. Audit System

The system must maintain audit records for sensitive operations.

Examples:

* Login
* Product creation
* Product modification
* Inventory adjustment
* Stock transfer
* Sale
* Discount
* Refund
* Store credit
* Layaway
* Employee creation
* Permission changes
* Configuration changes
* Subscription changes

Audit records should contain enough information to reconstruct who performed an action, what was affected, and when it occurred.

---

# 36. Security

Security level:

> **Strict / High**

Authentication:

* Email/password
* Secure session management

Authorization:

* RBAC
* Granular permissions
* Server-side authorization
* Database-level controls

Excluded:

* MFA
* Google OAuth
* Microsoft OAuth
* Biometrics

---

# 37. Subscription System

Subscription pricing is controlled by the Super Admin.

The Owner selects:

* Monthly
* Quarterly
* Semi-annually
* Annually

Pricing is configurable by Super Admin.

Payment is made through Paystack.

---

# 38. Subscription Expiration

Seven days before expiry, the system begins warning the Owner.

The dashboard should prominently display:

> **Subscription expires in X days**

with:

> **Renew Subscription**

The configured email notification schedule should also be triggered.

When the subscription expires:

```text
Subscription expires
        ↓
Active sessions terminated
        ↓
Login disabled
        ↓
Application locked
```

The Super Admin remains unrestricted.

---

# 39. Email

Resend is the email provider.

Email is used for:

* Subscription notifications
* Administrative notifications
* System notifications
* Other approved system communications

The primary administrative email is the Owner/Admin email.

---

# 40. Notifications

Channels:

* In-app
* Email

Notifications should be event-driven.

Examples:

* Subscription expiry
* Inventory alerts
* Suspicious activity
* Employee changes
* Important administrative events
* System events

---

# 41. Hardware

Initial hardware compatibility:

* Barcode scanners
* Receipt printers
* Customer displays
* Tablets
* Phones

The initial application platform is:

> **Responsive Web**

Hardware integration should avoid proprietary dependencies where possible.

---

# 42. Performance Requirements

The POS should be optimized for extremely fast interactions.

Priority areas:

1. Barcode scanning
2. Product search
3. Cart operations
4. Quantity updates
5. Checkout
6. Payment selection
7. Receipt generation

The administrative dashboard can prioritize information density and visual richness; the POS cannot.

---

# 43. CI/CD

CI/CD begins on **Day One**.

Source control:

> GitHub

Basic pipeline:

```text
Code
 ↓
Pull Request
 ↓
Lint
 ↓
Type Check
 ↓
Tests
 ↓
Build
 ↓
Deploy
```

The system should automatically prevent deployment when required checks fail.

---

# 44. Testing Strategy

Testing should cover:

* Unit tests
* Integration tests
* API tests
* Authentication
* Authorization
* Product management
* Inventory
* Sales
* Refunds
* Store credit
* Layaway
* Subscription
* Reports
* Security
* UI
* Database integrity
* Concurrency

**POS transaction testing is not part of the initially selected automated testing scope**, but the underlying transaction/business logic must still be validated through appropriate unit/integration coverage.

---

# 45. Observability

Because of the budget constraint, the initial system will use free/native mechanisms.

Required:

* Performance monitoring
* Database monitoring
* Uptime monitoring
* API monitoring
* Basic built-in logging
* Basic error handling

No external paid observability platform is required for MVP.

---

# 46. Infrastructure & Cost Constraint

This is a major product constraint.

The system should operate using:

> **Free services wherever realistically possible.**

Target:

> **$0/month preferred**

Absolute target:

> **Approximately $10/month maximum**

This constraint must influence architecture decisions.

We should therefore avoid unnecessary:

* Microservices
* Paid queues
* Paid monitoring
* Paid search infrastructure
* Paid analytics
* Third-party workflow platforms
* Managed infrastructure that can be replaced by Supabase/native functionality

---

# 47. Proposed Technology Architecture

The working architecture is:

```text
                  ┌─────────────────┐
                  │     Browser     │
                  │                 │
                  │ React POS       │
                  │ Admin Dashboard │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  Express / Node │
                  │                 │
                  │ REST API        │
                  │ Business Logic  │
                  │ RBAC            │
                  └────────┬────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
       ┌──────────────┐         ┌──────────────┐
       │  Supabase    │         │   Resend     │
       │              │         │              │
       │ PostgreSQL   │         │ Email        │
       │ Auth         │         └──────────────┘
       │ Storage      │
       └──────────────┘

                  ┌──────────────┐
                  │   Paystack   │
                  │              │
                  │ Subscription │
                  └──────────────┘
```

The exact hosting arrangement still needs to be finalized during the **Technical Architecture stage**, especially because the requirement is for an Express backend while also keeping hosting essentially free.

---

# 48. Architecture Principles

The engineering team must follow these principles:

### 1. Configuration over hardcoding

Business-specific behavior should be configurable wherever practical.

### 2. Core engine over industry duplication

Do not create:

```text
SupermarketPOS
RestaurantPOS
PharmacyPOS
```

Instead create:

```text
Core POS
+
Configuration
+
Business capabilities
```

### 3. Database integrity over frontend convenience

The backend/database is responsible for protecting:

* Money
* Inventory
* Permissions
* Transactions

### 4. Auditability

Sensitive operations must be traceable.

### 5. Extensibility

Future business types should not require rewriting the core architecture.

### 6. Cost efficiency

Every infrastructure dependency must justify its cost.

### 7. Simplicity

Do not introduce infrastructure merely because it is technically fashionable.

---

# 49. Success Criteria

The product is successful when a new client can:

```text
Create account
     ↓
Select business type
     ↓
Configure organization
     ↓
Create branch
     ↓
Create Business Unit
     ↓
Configure POS
     ↓
Add products
     ↓
Configure inventory
     ↓
Create employees
     ↓
Assign permissions
     ↓
Start selling
```

without requiring custom development for that client.

---

# 50. Most Important Architectural Decision

The defining characteristic of this product is **not** that it supports 13 business types.

It is that the architecture allows us to add the **14th, 15th, and 20th business type without rebuilding the application.**

Therefore, the next technical-design stage should focus heavily on the:

> **Configuration + Capability + Business Unit architecture.**

That is the part that will determine whether this genuinely becomes a Dynamic POS or eventually degenerates into a collection of hard-coded industry-specific features.

---

## Next Stage: Technical Architecture Specification

I recommend that we **do not jump directly into coding yet**.

The next document should be the **Technical Architecture Specification**, where we define the actual implementation of:

1. **Supabase + Express + React architecture**
2. Database schema
3. Business → Branch → Business Unit relationships
4. Product/inventory ownership model
5. RBAC and permission schema
6. Configuration/capability engine
7. POS transaction architecture
8. Concurrency strategy
9. Payment model
10. Store-credit ledger
11. Layaway ledger
12. Accounting model
13. Audit architecture
14. Subscription architecture
15. API structure
16. Frontend architecture
17. State management
18. Caching strategy
19. File/storage strategy
20. CI/CD architecture
21. Deployment architecture
22. Free/≤$10 infrastructure plan
23. Security architecture
24. Testing architecture