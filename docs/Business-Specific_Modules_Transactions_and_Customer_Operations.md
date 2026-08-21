# Stage 29 — Business-Specific Modules, Transactions & Customer Operations

This stage builds on the **POS Transaction Engine** and **Customer Management / Store Credit / Layaway** that we have already worked out. We are **not redesigning those systems**; this stage formalizes how they integrate with the Dynamic POS's business-type architecture.

The objective is to make the same POS capable of adapting to different industries through configuration rather than maintaining separate applications.

---

# 29.1 Dynamic Business-Type Architecture

A **business type** is a classification that determines which capabilities, defaults, terminology, workflows and configurations are presented to a business.

It is **not a separate application**.

For example:

```text
Business
   │
   └── Business Type
          │
          ├── Supermarket
          ├── Restaurant
          ├── Pharmacy
          ├── Fashion
          └── Electronics
```

A business can select its type during onboarding.

The selected type establishes sensible defaults.

---

# 29.2 Supported Business Types

Initial supported types:

1. Supermarket
2. Convenience Store
3. Restaurant
4. Pharmacy
5. Clothing/Fashion Store
6. Electronics Store
7. Hardware/Building Materials
8. Beauty Salon
9. Barbershop
10. Hotel
11. Bakery
12. Wholesaler
13. General Retail
14. Other

The **Other** option allows a business to use the generic POS configuration without pretending to belong to an unsupported industry.

---

# 29.3 Business Type ≠ Business Unit

This distinction is critical.

### Business Type

Describes what the overall business is.

Example:

```text
Business Type:
Supermarket
```

### Business Unit

Describes an operational division within the business.

Example:

```text
Business
└── Wuse Branch
    ├── Supermarket
    └── Pharmacy
```

The business type provides defaults.

The business unit determines the actual operational configuration.

---

# 29.4 Configurable Capability System

The platform should use feature/capability configuration rather than hardcoded business-type logic.

Conceptually:

```text
Business Type
      ↓
Default Capabilities
      ↓
Business Configuration
      ↓
Business Unit Configuration
      ↓
Actual POS Behaviour
```

This means an unusual business can enable capabilities that aren't normally associated with its selected type.

---

# 29.5 Capability Examples

Capabilities can include:

```text
restaurant_mode
pharmacy_mode
service_mode
inventory_tracking
customer_accounts
store_credit
layaway
tips
service_charge
```

The final capability catalogue will be defined as part of the application architecture.

---

# 29.6 Business-Type Defaults

For example, selecting:

### Restaurant

could automatically enable:

* Customer tabs
* Tips
* Service charge
* Restaurant-oriented checkout terminology

while disabling irrelevant inventory behaviour.

But the Owner/Admin can modify the configuration where permitted.

---

# 29.7 Restaurant Capabilities

You previously approved the restaurant functionality **except** for the explicitly excluded features.

Therefore the system should support the approved restaurant capabilities without introducing:

* Tables
* Table layouts
* Table reservations
* Table assignment
* Dine-in
* Takeaway
* Delivery
* Kitchen Display System
* Modifiers
* Add-ons
* Meal combos
* Recipes
* Ingredients
* Ingredient deduction
* Multiple kitchens
* Kitchen-specific orders

So the restaurant module remains focused on the capabilities you actually want rather than becoming a full restaurant-management platform.

---

# 29.8 Restaurant POS

A restaurant can therefore use the normal transaction engine with restaurant-specific configuration where applicable.

Example:

```text
Restaurant
    ↓
Product catalogue
    ↓
Restaurant Business Unit
    ↓
POS
    ↓
Customer
    ↓
Sale
```

The core transaction engine remains shared.

---

# 29.9 Tips

Tips are supported.

A transaction can optionally contain:

```text
Subtotal
Discount
Tax
Service charge
Tip
Total
```

Tips should be separately identifiable from revenue.

This is important for reporting.

---

# 29.10 Service Charge

You explicitly decided that service charge should be available to **all business types**.

It should therefore not be hardcoded as a restaurant-only feature.

The Admin can enable/disable it.

Example:

```text
Service charge:
Enabled

Rate:
5%
```

or a configured fixed amount where supported.

---

# 29.11 Tax

Tax is also configurable.

The business Admin determines:

* Whether tax is enabled
* Tax rate
* Tax calculation behaviour

You previously chose the simpler tax model rather than multiple simultaneous tax rates.

Therefore the initial architecture should maintain:

> **One active applicable tax configuration per sale/item context.**

---

# 29.12 Pharmacy Capabilities

The pharmacy module should support the pharmacy-oriented capabilities you approved while **excluding the clinical/prescription system**.

Explicitly excluded:

* Prescription management
* Prescription-required products
* Pharmacist approval
* Patient records
* Doctor information
* Dosage management
* Drug interaction warnings
* Controlled medication tracking
* Partial dispensing
* Insurance

The pharmacy therefore behaves primarily as a specialized retail inventory/POS operation.

---

# 29.13 Pharmacy Product Handling

A pharmacy can still use:

* Product categories
* Product variants
* SKU
* Barcode
* Inventory
* Expiry-related metadata where supported
* Branch pricing
* Customer records
* Sales
* Returns
* Refunds
* Reports

But the system does **not** attempt to become a medical information system.

---

# 29.14 Service Businesses

Businesses such as:

* Salons
* Barbershops

can sell services.

Example:

```text
Haircut
₦10,000

Hair wash
₦3,000

Beard trim
₦5,000
```

These can use the same transaction engine without requiring physical inventory.

---

# 29.15 Hotels

Hotels can use the POS for applicable commercial transactions.

The initial Dynamic POS should **not attempt to become a complete hotel property-management system** unless such functionality was explicitly included in the approved requirements.

The POS remains responsible for:

* Product/service sales
* Customer records
* Payments
* Receipts
* Reporting

rather than room-management infrastructure.

---

# 29.16 Customer Management

Customer records are already part of the platform.

A customer can contain:

```text
Customer
├── Name
├── Phone
├── Email
├── Address
├── Notes
├── Transaction history
├── Store credit
└── Layaway accounts
```

You explicitly excluded:

* Loyalty points
* Membership tiers
* Preferences
* Customer groups

These should remain outside the MVP.

---

# 29.17 Customer Identification

Your previous decision was **A**.

Therefore the customer-identification workflow should remain simple.

Customers should be identifiable through the supported customer information rather than requiring complicated membership systems.

A cashier should be able to:

```text
Search customer
      ↓
Select customer
      ↓
Attach to transaction
```

---

# 29.18 Walk-In Customers

The POS must support sales without creating a customer record.

Example:

```text
Customer:
Walk-in Customer
```

This is essential for fast retail checkout.

---

# 29.19 Customer Transaction History

An identified customer should have access-controlled history showing:

* Purchases
* Returns
* Refunds
* Store credit
* Layaway
* Installment payments
* Outstanding balances

This becomes especially important for customer-linked financial obligations.

---

# 29.20 Store Credit

Store credit is supported.

It must be tied to an existing customer.

Example:

```text
Customer:
John Doe

Store Credit:
₦20,000
```

Store credit should never simply be entered manually as an arbitrary payment method.

It must have a ledger.

---

# 29.21 Store Credit Ledger

Example:

```text
Store Credit Ledger

+ ₦10,000   Refund converted to credit
- ₦4,000    Used for purchase
+ ₦5,000    Credit adjustment
------------------------------
Balance:
₦11,000
```

Every movement is auditable.

---

# 29.22 Store Credit Authorization

Creation and adjustment of store credit should be permission controlled.

For example:

```text
customers.store_credit.view
customers.store_credit.issue
customers.store_credit.adjust
customers.store_credit.use
```

The exact permission matrix will be finalized later.

---

# 29.23 Store Credit Cannot Exceed Available Balance

If:

```text
Credit:
₦5,000
```

the system must reject:

```text
Payment using store credit:
₦7,000
```

unless another approved payment method is supported.

You previously rejected split payments, so the simpler MVP rule is:

> Store credit cannot be used beyond its available balance.

---

# 29.24 Layaway

Layaway is supported through the customer account.

The workflow is:

```text
Select customer
      ↓
Select products
      ↓
Reserve inventory
      ↓
Record total
      ↓
Record initial payment
      ↓
Record outstanding balance
      ↓
Customer makes future payments
      ↓
Balance reaches ₦0
      ↓
Layaway completed
```

---

# 29.25 Layaway Record

A layaway should contain:

```text
Layaway
├── Customer
├── Branch
├── Items
├── Total amount
├── Amount paid
├── Outstanding balance
├── Status
├── Created by
├── Created date
└── Payment history
```

---

# 29.26 Layaway Status

Recommended statuses:

```text
ACTIVE
COMPLETED
CANCELLED
EXPIRED
```

The exact expiration behaviour should remain configurable.

---

# 29.27 Installment Payments

A customer can make multiple payments.

Example:

```text
Total:
₦100,000

Payment 1:
₦30,000

Payment 2:
₦20,000

Payment 3:
₦50,000
```

The system calculates:

```text
Paid:
₦100,000

Outstanding:
₦0
```

and marks the layaway complete.

---

# 29.28 Layaway Inventory Reservation

When a layaway is created, the associated stock should be reserved.

Example:

```text
Physical stock:
10

Layaway:
2

Available:
8
```

This prevents another customer from purchasing the reserved units.

---

# 29.29 Layaway Completion

When fully paid:

```text
Outstanding = ₦0
```

the system marks the layaway as completed.

The exact fulfilment workflow should follow the previously established transaction-engine design.

---

# 29.30 Layaway Cancellation

Cancellation must not simply delete the layaway.

Instead:

```text
ACTIVE
 ↓
CANCELLED
```

and the system releases any applicable inventory reservations.

Any financial consequences must be recorded as ledger events.

---

# 29.31 Returns

Returns are supported through the existing transaction engine.

A return must reference the original sale where applicable.

This provides:

* Product validation
* Quantity validation
* Price validation
* Customer history
* Inventory restoration
* Auditability

---

# 29.32 Refunds

Refunds are supported.

You previously decided:

> **Refunds require authorization.**

Therefore, the employee initiating a refund may not necessarily have permission to complete it.

Workflow:

```text
Refund requested
      ↓
Permission check
      ↓
Authorization
      ↓
Refund processed
      ↓
Inventory/financial records updated
```

---

# 29.33 Refund Authorization

A permission such as:

```text
transactions.refund
```

should determine who can perform refunds.

For higher-security workflows, the system should record:

* Requesting user
* Authorizing user
* Reason
* Amount
* Original transaction
* Timestamp

---

# 29.34 Discounts

Discounts are supported:

* Percentage
* Fixed amount

Example:

```text
10% discount
```

or:

```text
₦2,000 discount
```

---

# 29.35 Who Can Give Discounts?

Discount capability is permission-controlled.

Therefore:

```text
transactions.discount
```

can be granted to:

* Cashier
* Manager
* Owner
* Custom role

depending on the business's configuration.

The system should not assume that every cashier can discount sales.

---

# 29.36 Discount Audit

Every discount should retain:

```text
Discount type
Discount amount
Original amount
Final amount
User
Timestamp
Transaction
```

This helps prevent abuse.

---

# 29.37 Business-Level Configuration

The Owner/Admin should be able to configure:

* Business type
* Enabled capabilities
* Tax
* Service charge
* Default payment method
* Receipt configuration
* Customer requirements
* Discount permissions
* Refund permissions
* Business-unit configuration

This is what makes the platform **configurable rather than merely multi-industry**.

---

# 29.38 Business Unit POS Configuration

Each business unit can have its own POS configuration.

For example:

```text
Wuse Branch
│
├── Supermarket
│      └── POS Configuration A
│
└── Pharmacy
       └── POS Configuration B
```

This was explicitly approved in Q22.

---

# 29.39 Business Unit Product Restriction

Because you confirmed:

> **The same product cannot exist in multiple business units.**

The system must enforce that rule at the data/business-logic layer rather than merely hiding products in the UI.

This prevents accidental cross-unit duplication.

---

# 29.40 Transaction Ownership

Every transaction must identify the relevant operational context:

```text
Business
Branch
Business Unit
POS/Register context
Employee
```

This is important for:

* Reports
* Permissions
* Inventory
* Auditing
* Business-unit separation

---

# 29.41 Customer Ownership

Customers belong to the business rather than to a single employee.

Where relevant, transaction relationships identify:

```text
Business
Branch
Business Unit
Customer
```

This means a customer can transact across branches within the same client business.

---

# 29.42 Financial Separation

The POS's operational payments remain distinct from the **software subscription payment system**.

Customer purchases:

```text
Customer
   ↓
POS
   ↓
Business
```

Software subscription:

```text
Business Owner
   ↓
Admin Dashboard
   ↓
Paystack
   ↓
Your Platform
```

These must never be mixed.

---

# 29.43 Business-Type Configuration Example

Consider:

```text
ABC Enterprise
```

Business type:

```text
Supermarket
```

Branches:

```text
Wuse
Maitama
```

Wuse contains:

```text
Supermarket
Pharmacy
```

The system can therefore have:

```text
ABC Enterprise
│
├── Wuse
│   ├── Supermarket
│   └── Pharmacy
│
└── Maitama
    └── Supermarket
```

Each operational unit can have its own POS configuration while remaining under the same business.

---

# 29.44 What This Stage Does NOT Build

To preserve the scope, we explicitly exclude:

❌ Loyalty points
❌ Membership tiers
❌ Customer groups
❌ Customer preferences
❌ Prescription management
❌ Patient records
❌ Doctor records
❌ Drug interaction engine
❌ Insurance processing
❌ Controlled-drug tracking
❌ Tables
❌ Table reservations
❌ Table layouts
❌ Dine-in management
❌ Delivery management
❌ Kitchen Display System
❌ Recipes
❌ Ingredients
❌ Modifiers
❌ Add-ons
❌ Meal combos
❌ Procurement
❌ Supplier management

---

# 29.45 Stage 29 — Final Functional Scope

### Dynamic Platform

* Business types
* Business-type defaults
* Configurable capabilities
* Business-unit configuration
* Business-unit POS configuration

### Customers

* Customer records
* Walk-in customers
* Customer identification
* Transaction history
* Store credit
* Store credit ledger

### Layaway

* Customer-linked layaway
* Inventory reservation
* Initial payment
* Outstanding balance
* Payment history
* Multiple installments
* Completion
* Cancellation

### Transactions

* Existing POS Transaction Engine
* Returns
* Refunds
* Refund authorization
* Discounts
* Discount authorization
* Tax
* Service charge
* Tips

### Industry Adaptation

* Supermarket
* Convenience
* Restaurant
* Pharmacy
* Fashion
* Electronics
* Hardware
* Salon
* Barbershop
* Hotel
* Bakery
* Wholesale
* General retail
* Other

### Core Principle

> **One transaction engine + one customer system + one product/inventory system + configurable business capabilities = the Dynamic POS.**

That is the architectural direction we should preserve going forward.