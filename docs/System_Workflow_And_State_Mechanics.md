# Dynamic POS — System Workflows & State Machines

**Stage:** Next PRD/Engineering Design Stage
**Status:** Baseline for implementation
**Offline:** Fully eliminated
**Architecture:** Configurable modular POS platform, independently deployed per client

This stage turns the feature list into **actual business processes**. The goal is to make the behavior unambiguous before database schema and implementation.

---

# 1. Core Architectural Model

The most important model is now:

```text
Client Deployment
│
└── Organization
    │
    ├── Branch
    │   ├── Business Unit
    │   │   ├── POS Configuration
    │   │   ├── Inventory
    │   │   ├── Employees
    │   │   └── Transactions
    │   │
    │   └── Business Unit
    │
    └── Branch
        └── Business Unit
```

A **Business Unit** represents an independently configured operation within a branch.

Example:

```text
ABC Supermarket
│
└── Abuja Branch
    │
    ├── Supermarket
    │
    └── Pharmacy
```

The two Business Units remain under the same client organization, but can have different:

* POS configuration
* enabled capabilities
* employees/permissions
* inventory
* operational settings

---

# 2. Business Type vs Business Unit

This distinction is important.

### Business Type

A **classification/template** describing what kind of business a Business Unit operates as.

Examples:

```text
Supermarket
Restaurant
Pharmacy
Clothing Store
Electronics Store
Hotel
Bakery
```

Business Type should **not dictate the entire application's functionality**.

Instead:

```text
Business Type
      ↓
Recommended capabilities
      ↓
Admin chooses/adjusts capabilities
      ↓
Business Unit configuration
```

Therefore, a pharmacy could technically enable capabilities normally associated with retail.

---

# 3. Onboarding Workflow

## Step 1 — Super Admin Creates Client

The Super Admin creates the deployment/client record.

```text
Client
 ↓
Organization
```

The organization receives:

* organization identity
* subscription
* initial Owner account
* default configuration

---

## Step 2 — Owner First Login

Owner logs in.

System checks:

```text
Authentication
      ↓
Organization
      ↓
Subscription
      ↓
Onboarding status
```

If onboarding is incomplete:

```text
→ Onboarding wizard
```

---

# 4. Business Onboarding

The wizard should guide the Owner through:

### Step 1

Business information:

* Business name
* Brand name
* Logo
* Primary color
* Secondary color
* Contact information

### Step 2

Business types:

```text
☐ Supermarket
☐ Convenience Store
☐ Restaurant
☐ Pharmacy
...
```

Multiple types may be selected.

This is important because a client might legitimately operate:

```text
Supermarket + Pharmacy
```

---

# 5. Branch Creation

Owner creates the first branch.

Example:

```text
Head Office
```

Then:

```text
Abuja Branch
Lagos Branch
```

can subsequently be added.

---

# 6. Business Unit Creation

Inside a branch:

```text
Add Business Unit
```

Example:

```text
Branch:
Abuja

Business Units:
├── Supermarket
└── Pharmacy
```

The Owner selects the Business Type.

The system then proposes an initial configuration.

Example:

```text
Pharmacy
 ↓
Recommended capabilities
 ├── Inventory
 ├── Barcode scanning
 ├── Product expiry
 ├── Batch tracking
 └── etc.
```

The Owner can modify the configuration according to the platform's allowed capabilities.

---

# 7. Configuration Principle

The system should distinguish between:

### Mandatory

Features required by the platform.

### Available

Features that can be enabled.

### Disabled

Features intentionally turned off.

This produces:

```text
Feature availability
       ↓
Business configuration
       ↓
User permissions
```

These are **three different layers**.

A user cannot use a feature merely because their role has permission if the Business Unit has disabled the feature.

---

# 8. Employee Onboarding

Owner/authorized manager:

```text
Users
 ↓
Add Employee
```

Enter:

* Name
* Email
* Phone
* Employee identifier
* Role
* Branch
* Business Unit
* Status

Then:

```text
Invite
 ↓
Employee receives email
 ↓
Creates password
 ↓
Account activated
```

---

# 9. Role Resolution

When a user performs an operation:

```text
User
 ↓
Organization membership
 ↓
Branch access
 ↓
Business Unit access
 ↓
Role
 ↓
Permissions
 ↓
Capability enabled?
 ↓
Action allowed
```

This prevents a cashier from gaining access simply because they know an API endpoint.

---

# 10. Product Creation Workflow

Authorized user selects:

```text
Products
 ↓
Create Product
```

Information:

* Product name
* SKU
* Barcode
* Category
* Description
* Product type
* Variants
* Inventory settings
* Pricing
* Tax configuration
* Reorder threshold
* Expiry/batch information where applicable

Product creation is permitted to:

* Super Admin
* Owner/Admin
* Branch Manager
* authorized Custom Roles

---

# 11. Product Availability

You specified:

> The same product cannot exist in multiple Business Units.

Therefore, the product must belong to **one Business Unit**.

Example:

```text
Abuja Supermarket
 └── Coca Cola

Abuja Pharmacy
 └── Coca Cola
```

The system should **not** allow the same product record to be shared between those Business Units.

However, the same physical product can be created independently if the businesses genuinely need separate catalog records.

---

# 12. Pricing Workflow

Pricing is branch-level.

Therefore:

```text
Product
   ↓
Branch Price
   ↓
Business Unit POS
```

The POS retrieves the price applicable to its branch.

Price changes should be audited.

Example:

```text
₦5,000
 ↓
Manager changes to ₦5,500
 ↓
Audit event
```

Historical sales retain their original transaction price.

---

# 13. Inventory Workflow

Inventory belongs to the Business Unit.

```text
Business Unit
 ↓
Inventory
 ↓
Product
 ↓
Quantity
```

Example:

```text
Abuja Supermarket
Coca Cola
Quantity: 150
```

and separately:

```text
Abuja Pharmacy
Coca Cola
Quantity: 20
```

They are independent inventory records.

---

# 14. Inventory Adjustment

Authorized employee:

```text
Inventory
 ↓
Adjustment
 ↓
Select product
 ↓
Enter quantity
 ↓
Select reason
 ↓
Confirm
```

The system:

```text
BEGIN
 ↓
Lock inventory record
 ↓
Calculate new quantity
 ↓
Update inventory
 ↓
Create inventory movement
 ↓
Create audit event
 ↓
COMMIT
```

---

# 15. Stock Transfer Workflow

You chose **YES**, but simple.

A transfer involves:

```text
Source Business Unit
        ↓
Destination Business Unit
        ↓
Product
        ↓
Quantity
```

The important question is whether transfers should be allowed only between Business Units within the **same branch**, or also between different branches.

### Recommended:

Allow:

```text
Business Unit → Business Unit
```

within the same organization, subject to permissions.

This gives you:

```text
Abuja Supermarket → Abuja Pharmacy
```

and:

```text
Abuja Branch → Lagos Branch
```

without introducing procurement complexity.

---

# 16. Stock Transfer State

Keep the workflow simple:

```text
DRAFT
  ↓
PENDING
  ↓
COMPLETED
```

Optional:

```text
PENDING → CANCELLED
```

Inventory should only change when the transfer is completed.

---

# 17. POS Sale Workflow

The fundamental transaction:

```text
Cashier
 ↓
Open POS
 ↓
Search/scan product
 ↓
Add to cart
 ↓
Adjust quantity
 ↓
Select customer (optional)
 ↓
Apply discount (if permitted)
 ↓
Calculate preview
 ↓
Payment
 ↓
Server validation
 ↓
Transaction
 ↓
Receipt
```

---

# 18. Checkout Transaction

When the cashier clicks **Pay**:

```text
Frontend
 ↓
POST /sales
 ↓
Authentication
 ↓
Authorization
 ↓
Capability check
 ↓
Product validation
 ↓
Price validation
 ↓
Inventory validation
 ↓
Discount validation
 ↓
Tax calculation
 ↓
Service charge calculation
 ↓
Payment validation
 ↓
Database transaction
```

Then:

```text
Sale created
Sale items created
Payment recorded
Inventory deducted
Inventory movement created
Audit event created
```

Then:

```text
COMMIT
 ↓
Receipt returned
```

---

# 19. What Happens if Checkout Fails?

Everything rolls back.

Example:

```text
Inventory = 2

Sale requests = 3
```

Result:

```text
SALE_REJECTED
INSUFFICIENT_STOCK
```

No:

* sale
* payment record
* inventory movement
* inventory deduction

is created.

---

# 20. Payment Methods

Supported:

```text
Cash
Card
Bank Transfer
Store Credit
```

One payment method can be designated as the Business Unit's default.

Example:

```text
Default = Cash
```

The POS opens with Cash selected.

---

# 21. Important Payment Clarification

The POS's **customer payments are not processed through Paystack**.

Paystack is exclusively for:

```text
Client
 ↓
Software subscription
 ↓
Paystack
```

Normal sales:

```text
Customer
 ↓
Business
```

are simply recorded by the POS.

This avoids unnecessarily coupling the actual POS with a payment gateway.

---

# 22. Discount Workflow

Employee selects:

```text
Discount
```

System checks:

```text
Is discount capability enabled?
       ↓
Does employee have permission?
       ↓
Is discount within allowed policy?
       ↓
Apply
```

Every discount should be recorded.

Audit:

```text
Employee
Discount
Amount
Sale
Timestamp
```

---

# 23. Service Charge Workflow

Service charge is available across business types.

It is controlled through Business Unit configuration.

Example:

```text
Service Charge:
Enabled ✓

Type:
Percentage

Value:
5%
```

The backend calculates it.

The cashier does not manually determine the amount.

---

# 24. Tax Workflow

Tax is similarly configured by the business.

For example:

```text
Tax:
Enabled

Rate:
7.5%
```

At checkout:

```text
Subtotal
 ↓
Discount
 ↓
Tax
 ↓
Service Charge
 ↓
Total
```

The exact ordering should be fixed at implementation level so every report uses the same calculation.

---

# 25. Hold/Suspend Sale

Cashier:

```text
Cart
 ↓
Hold Sale
```

The system stores the incomplete sale.

State:

```text
SUSPENDED
```

It does **not** deduct inventory or record revenue.

---

# 26. Resume Sale

```text
Suspended Sales
 ↓
Select sale
 ↓
Resume
 ↓
Cart restored
```

Before completing payment, the system performs fresh product/inventory validation.

This prevents stale suspended carts from bypassing current inventory rules.

---

# 27. Return Workflow

```text
Customer
 ↓
Return request
 ↓
Find original sale
 ↓
Select item
 ↓
Specify quantity
 ↓
Reason
 ↓
Authorization
 ↓
Process return
```

The system validates:

```text
Original sale exists
Returned quantity ≤ purchased quantity
Item is refundable
Refund hasn't already been processed
```

---

# 28. Refund Workflow

Refund authorization is required.

```text
Employee requests refund
        ↓
Authorization required
        ↓
Authorized employee approves
        ↓
Refund executed
        ↓
Inventory restored where applicable
        ↓
Audit event
```

The system must preserve the original sale.

It should **not modify the original sale into a fake historical state**.

Instead:

```text
Original Sale
     +
Refund Transaction
```

---

# 29. Immutable Transaction Principle

Sales, payments and refunds become immutable historical records.

Instead of:

```text
UPDATE sale SET total = ...
```

use:

```text
Original Sale
+
Adjustment/Refund transaction
```

This gives you reliable accounting and auditability.

---

# 30. Store Credit Workflow

Customer:

```text
John Doe
Store Credit: ₦20,000
```

At checkout:

```text
Payment
 ↓
Store Credit
```

System verifies:

```text
Balance ≥ sale amount
```

Then atomically:

```text
Sale created
+
Store credit deducted
```

---

# 31. Layaway Workflow

You selected the simpler model.

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

Example:

```text
Total: ₦100,000
Initial payment: ₦30,000
Outstanding: ₦70,000
```

---

# 32. Layaway Installments

Customer returns:

```text
Layaway
 ↓
Make payment
 ↓
Payment history updated
 ↓
Outstanding balance recalculated
```

Example:

```text
₦70,000
 ↓
₦20,000
 ↓
₦50,000
```

When:

```text
Outstanding = ₦0
```

the system marks:

```text
COMPLETED
```

---

# 33. Customer Management

Customer identification is optional for ordinary sales.

Therefore:

```text
Walk-in customer
```

is supported.

But these features require a customer record:

* Store credit
* Layaway
* Customer-specific historical records

The system should not force customer creation for every ordinary retail transaction.

---

# 34. Cash/Register Workflow

You removed the traditional cash-register functionality.

Therefore, there is no mandatory:

```text
Register opening
Cash drawer assignment
Cashier shift
Expected cash
Actual cash
Register reconciliation
```

The POS can still record:

```text
Cash payment
Cashier
Timestamp
Business Unit
Sale
```

This keeps the system simpler.

---

# 35. Restaurant Workflow

Because you explicitly excluded:

* Tables
* Dine-in
* Takeaway
* Delivery
* Kitchen
* Recipes
* Ingredients
* Modifiers
* Add-ons
* Meal combos
* Customer tabs
* Tips

the Restaurant Business Type essentially uses the **same core commerce engine**.

This is important architecturally.

The system should not pretend to be a restaurant-management platform when those workflows are deliberately excluded.

Restaurant-specific capabilities should therefore be limited to whichever general features you retained.

---

# 36. Pharmacy Workflow

Likewise, you excluded:

* Prescription management
* Patient records
* Doctor information
* Drug interactions
* Controlled medication tracking
* Insurance
* Pharmacist approval

Therefore, Pharmacy is primarily:

```text
Retail POS
+
Inventory
+
Batch/expiry capabilities where enabled
```

It should not be marketed internally as a full pharmacy management system.

---

# 37. Notifications Workflow

Events generate notifications.

Example:

```text
Subscription nearing expiry
       ↓
Notification event
       ↓
In-app notification
       +
Email
```

Other notification events can include:

```text
Suspicious transaction
Cash variance
New employee
```

according to the final capability configuration.

---

# 38. Audit Workflow

Important actions produce:

```text
Audit Event
```

Example:

```text
User:
John

Action:
PRODUCT_PRICE_UPDATED

Entity:
Product 123

Old:
₦5,000

New:
₦5,500

Timestamp:
...
```

Audit logs should be append-only.

---

# 39. Deletion Workflow

You chose the recommendation to avoid destructive deletion of important records.

Therefore:

### Configuration data

Can generally be archived.

### Transactional data

Cannot be deleted.

### Historical references

Must remain valid.

Example:

If a product is discontinued:

```text
Product
status = ARCHIVED
```

Old sales still reference it.

---

# 40. Subscription Workflow

Normal lifecycle:

```text
TRIAL/INITIALIZED
       ↓
ACTIVE
       ↓
EXPIRING_SOON
       ↓
EXPIRED
       ↓
RENEWED
       ↓
ACTIVE
```

When subscription is approaching expiry:

```text
7 days
 ↓
Notification
 ↓
Renew button
```

The Owner can select:

```text
Monthly
Quarterly
Semi-Annual
Annual
```

---

# 41. Subscription Renewal

```text
Owner
 ↓
Renew
 ↓
Select duration
 ↓
Paystack checkout
 ↓
Payment confirmation
 ↓
Paystack verification
 ↓
Subscription updated
 ↓
Receipt/payment record
 ↓
Notification
```

Never activate a subscription based solely on the frontend's claim that payment succeeded.

The backend must verify the payment.

---

# 42. Subscription Expiry

At expiration:

```text
Subscription
 ↓
EXPIRED
```

Then:

```text
Normal user login → DENIED
Existing sessions → INVALIDATED
Application access → LOCKED
```

Super Admin:

```text
UNRESTRICTED
```

---

# 43. Super Admin Workflow

The Super Admin is outside the normal client hierarchy.

```text
Super Admin
     │
     ├── Organizations
     ├── Deployments
     ├── Subscriptions
     ├── Pricing
     ├── System Configuration
     ├── Client Support
     └── Audit/Administrative Access
```

You specifically chose **untethered access**.

Therefore, the Super Admin must not be blocked by an individual client's subscription status.

---

# 44. Subscription Pricing

Pricing is centrally controlled.

Super Admin:

```text
Subscription Pricing
```

can configure:

```text
Monthly
Quarterly
Semi-Annual
Annual
```

with prices.

Clients simply select the duration.

There is **one product/feature tier**, not multiple feature-based plans.

---

# 45. Business Configuration State

Each Business Unit should have a configuration state.

Conceptually:

```text
Business Type
      ↓
Default Configuration
      ↓
Admin Customization
      ↓
Active Configuration
```

Changing configuration must be audited.

Example:

```text
Inventory
Enabled → Disabled
```

The system should warn the administrator if disabling a feature affects existing data.

---

# 46. Configuration Safety

For example, if the business has:

```text
5,000 inventory records
```

the Owner shouldn't simply be allowed to disable inventory without a warning such as:

> Disabling inventory will prevent inventory management and stock deduction for this Business Unit. Existing inventory records will be preserved.

The data remains.

The functionality becomes unavailable.

---

# 47. Data Ownership Model

Every business-critical record should have a clear ownership chain.

Example:

```text
Sale
 ↓
Business Unit
 ↓
Branch
 ↓
Organization
```

This allows the backend to enforce authorization consistently.

---

# 48. Critical Security Rule

Never authorize using only:

```text
user.role === "admin"
```

Instead authorization should evaluate:

```text
User
+
Organization
+
Branch
+
Business Unit
+
Role
+
Permission
+
Capability
+
Subscription
```

This is one of the most important security characteristics of the entire platform.

---

# 49. End-to-End Sale State Machine

The final sale lifecycle can be:

```text
CART
 │
 ├── HOLD → SUSPENDED
 │             │
 │             └── RESUME → CART
 │
 └── CHECKOUT
        ↓
     VALIDATING
        ↓
      PAYMENT
        ↓
     COMPLETED
        │
        └── RETURN/REFUND
```

There should be no:

```text
COMPLETED → EDIT
```

A completed sale cannot simply be edited.

---

# 50. Inventory State

Inventory itself does not need a complicated state machine.

Instead:

```text
Inventory Balance
      ↑
      │
┌─────┴─────────┐
│               │
Sale          Adjustment
│               │
Return        Transfer
```

Every change generates an **inventory movement**.

This gives us an auditable inventory ledger.

---

# 51. Why This Model Is Strong

This design keeps the platform broad without turning it into an enormous collection of unrelated applications.

The core engine remains:

```text
Products
 ↓
Pricing
 ↓
Inventory
 ↓
Customers
 ↓
POS
 ↓
Payments
 ↓
Reporting
```

Business types primarily influence:

```text
Configuration
+
Terminology
+
Recommended capabilities
+
Workflow presentation
```

rather than creating entirely separate codebases.

That is the key to making the **Dynamic POS** concept maintainable.

---

# 52. Final Architectural Principle

The system should follow:

> **Configure behavior; don't fork the application.**

We should never create:

```text
pharmacy-pos/
restaurant-pos/
supermarket-pos/
```

Instead:

```text
dynamic-pos/
```

with:

```text
Business Type
      ↓
Capabilities
      ↓
Configuration
      ↓
Permissions
      ↓
UI + API behavior
```

This keeps the independent deployment model while allowing every client deployment to behave differently.

---

## Next Stage

The workflows are now sufficiently defined to move into the **database architecture/schema stage**.

That stage will be particularly important because we need to design the PostgreSQL/Supabase schema around:

* Organization → Branch → Business Unit hierarchy
* Business types and capabilities
* Granular RBAC
* Branch-level pricing
* Business-unit inventory
* Inventory ledger
* Stock transfers
* Immutable sales
* Refunds
* Store credit
* Layaway/installments
* Subscription lifecycle
* Audit logs
* Notifications
* Custom reports
* Concurrency protection
* Soft deletion/archiving