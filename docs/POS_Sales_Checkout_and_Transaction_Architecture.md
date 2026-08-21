# Stage 4 — POS Sales, Checkout & Transaction Architecture

We now define the **transaction engine**, which is the most critical part of the POS.

The core principle is:

> **A completed POS transaction must be atomic, traceable, immutable, concurrency-safe, and financially reproducible.**

A sale should never end up in a state where, for example, payment succeeded but inventory was not deducted, or inventory was deducted but no transaction exists.

---

## 1. POS Transaction Lifecycle

The canonical workflow should be:

```text
Product Selection
       ↓
Cart
       ↓
Customer (Optional)
       ↓
Price Calculation
       ↓
Discount
       ↓
Tax
       ↓
Service Charge
       ↓
Final Total
       ↓
Payment Selection
       ↓
Payment Validation
       ↓
Transaction Authorization
       ↓
Atomic Transaction
   ┌───┼──────────┐
   ↓   ↓          ↓
 Sale Inventory  Payment
     Movement     Record
   └───┼──────────┘
       ↓
 Receipt
       ↓
 Audit Log
```

The important part is the **atomic transaction** near the end.

---

# 2. Cart

The cart is temporary.

It should contain:

```text
Cart
├── Product
├── Variant
├── Quantity
├── Unit Price
├── Discount
├── Tax
└── Line Total
```

A cart does **not** become a permanent financial record until checkout is completed.

---

# 3. Sale vs Cart

These must be separate concepts.

### Cart

Temporary:

```text
OPEN
```

### Sale

Permanent:

```text
COMPLETED
```

or one of the controlled terminal states:

```text
REFUNDED
PARTIALLY_REFUNDED
VOIDED
```

This distinction is important for database integrity.

---

# 4. Sale Number

Every completed transaction receives a human-readable transaction number.

Example:

```text
POS-20260821-000184
```

The number should be:

* unique
* searchable
* printable
* displayed on receipts

The internal database UUID should remain separate.

```text
id:
UUID

transaction_number:
POS-20260821-000184
```

---

# 5. Transaction Number Generation

Do **not** generate transaction numbers purely from frontend logic.

Two cashiers could theoretically generate the same number.

The database should guarantee uniqueness.

---

# 6. Sale Status

The initial state machine should be simple:

```text
DRAFT
   ↓
PENDING_PAYMENT
   ↓
COMPLETED
```

Alternative paths:

```text
DRAFT
 ↓
CANCELLED
```

and later:

```text
COMPLETED
 ↓
PARTIALLY_REFUNDED
 ↓
REFUNDED
```

A completed transaction should **never be edited directly**.

---

# 7. Transaction Immutability

You explicitly selected:

> Transactional data should be immutable.

This is a major architectural rule.

Once a sale is completed:

```text
Sale #184
Total: ₦25,000
```

we do not update it to:

```text
Total: ₦20,000
```

Instead, a refund generates another transaction record referencing the original sale.

---

# 8. Why This Matters

Suppose:

```text
August 21:
Sale = ₦50,000
```

On August 22:

```text
Customer returns ₦10,000 item
```

We preserve:

```text
Original Sale:
₦50,000
```

and create:

```text
Refund:
₦10,000
```

This means reports can always reconstruct what happened.

---

# 9. Sale Lines

A sale consists of line items.

Example:

```text
Sale #184

Coke × 2       ₦1,000
Bread × 1      ₦800
Shoes × 1      ₦25,000
----------------------
Subtotal       ₦26,800
Discount       ₦1,000
Tax            ₦1,290
Service Charge ₦0
----------------------
TOTAL          ₦27,090
```

Each line should retain the actual values used at checkout.

---

# 10. Historical Pricing

This is critical.

Suppose a product currently costs:

```text
₦5,000
```

but it was ₦4,000 when the customer purchased it.

The sale line must contain:

```text
unit_price = 4000
```

It should **not dynamically reference the current product price**.

Otherwise historical receipts would change.

---

# 11. Sale Line Snapshot

Each completed sale line should preserve relevant information such as:

```text
Product ID
Product Name
SKU
Variant
Quantity
Unit Price
Discount
Tax
Line Total
```

The product can subsequently be renamed or archived without corrupting historical transactions.

---

# 12. Customer

Customer identification is optional.

You selected:

> Customer identification — A

So a normal walk-in sale can be:

```text
Customer:
None
```

while another sale can be:

```text
Customer:
John Doe
```

---

# 13. When Customer Identification Is Required

It becomes necessary for features such as:

* store credit
* layaway/installments
* customer account history

Therefore:

```text
Normal sale
→ Customer optional

Store credit
→ Customer required

Layaway
→ Customer required
```

---

# 14. Store Credit

Store credit should not mean:

> "Cashier manually enters a negative amount."

It should be an actual customer financial balance.

Example:

```text
Customer:
John

Store Credit:
₦20,000
```

The system maintains the credit ledger.

---

# 15. Store Credit Ledger

Conceptually:

```text
Customer Credit Account
        ↓
Credit Ledger
├── Credit Issued
├── Credit Used
├── Credit Adjustment
└── Credit Refund
```

Example:

```text
Credit issued:
+₦10,000

Used:
-₦3,000

Remaining:
₦7,000
```

---

# 16. Store Credit Authorization

Store credit should be permission-controlled.

For example:

```text
customer.credit.issue
customer.credit.use
customer.credit.adjust
```

A cashier may be permitted to **use** credit without being permitted to **issue or adjust** it.

This is why your granular RBAC decision is important.

---

# 17. Layaway / Installments

Your required workflow is:

```text
Customer
Outstanding Balance
Payment History
Multiple Installments
```

A layaway should therefore have its own entity.

Example:

```text
Layaway
├── Customer
├── Original Sale/Order
├── Total Amount
├── Amount Paid
├── Outstanding Balance
├── Status
└── Payment History
```

---

# 18. Layaway Status

Keep it simple:

```text
ACTIVE
COMPLETED
CANCELLED
```

Example:

```text
Total:
₦100,000

Paid:
₦40,000

Outstanding:
₦60,000
```

Customer can subsequently make:

```text
₦20,000
₦20,000
₦20,000
```

until:

```text
Outstanding:
₦0
```

---

# 19. Layaway vs Normal Sale

A layaway should **not** be treated as a completed sale immediately.

This distinction matters because the customer has not completed payment.

The final accounting/inventory behavior needs to be explicitly defined.

For the first version, I recommend:

> **Inventory is reserved/deducted when the layaway is created, while revenue recognition/payment status remains separate until fully paid.**

However, this introduces additional inventory-state complexity.

We should therefore formalize this in the accounting stage.

---

# 20. Suspended Sales

You selected:

> Hold/suspend sale — YES.

A cashier should be able to temporarily move a cart out of the active checkout screen.

Example:

```text
Customer A
   ↓
Cart
   ↓
HOLD
```

Then:

```text
Customer B
   ↓
New Cart
```

Later:

```text
Resume Customer A
```

---

# 21. Suspended Sale Storage

Suspended sales are not completed transactions.

They should therefore not:

* deduct inventory
* create revenue
* create payment records
* appear as completed sales

They are essentially persisted carts.

---

# 22. Suspended Sale Expiration

To prevent abandoned carts accumulating indefinitely, we should eventually support expiration/cleanup.

For example:

```text
Suspended:
24 hours
```

Then:

```text
Expired
```

But the exact retention period can be configurable.

---

# 23. Discounts

You selected:

* Percentage discounts
* Fixed discounts

Both should be supported.

### Percentage

```text
Subtotal:
₦10,000

Discount:
10%

Discount amount:
₦1,000
```

### Fixed

```text
Subtotal:
₦10,000

Discount:
₦1,000
```

---

# 24. Discount Scope

We need to distinguish:

### Line discount

```text
Product A
₦10,000
Discount:
10%
```

### Sale discount

```text
Entire sale
₦50,000
Discount:
₦5,000
```

I recommend supporting both.

This is useful across practically every supported business type.

---

# 25. Discount Permissions

You said:

> Who can give discounts? — Yes.

Given your granular RBAC architecture, discount authority should be permission-based.

For example:

```text
sales.discount.apply
sales.discount.override_limit
```

The business can decide:

```text
Cashier:
Up to 5%

Manager:
Up to 20%

Owner:
Unlimited
```

This is much more flexible than hard-coding roles.

---

# 26. Discount Audit

Every applied discount should record:

```text
Discount Type
Discount Value
Original Amount
Discount Amount
Applied By
Timestamp
Authorization
```

This makes discount abuse detectable.

---

# 27. Tax

You selected:

> Tax enabled.

and:

> Admin-defined.

The tax system should initially support one applicable tax configuration per sale/line rather than building a complicated multi-tax engine.

Example:

```text
Tax:
VAT

Rate:
7.5%
```

---

# 28. Tax Configuration

The administrator should be able to configure:

```text
Tax Name
Rate
Active/Inactive
Inclusive/Exclusive
```

This is important because businesses may operate differently.

---

# 29. Tax Inclusive vs Exclusive

You selected:

> Tax/service charge — B.

This should translate into a configurable model.

The system should support:

### Tax-inclusive pricing

```text
Product:
₦10,750

VAT included:
₦750
```

### Tax-exclusive pricing

```text
Product:
₦10,000

VAT:
₦750

Total:
₦10,750
```

The business configuration determines which model is used.

---

# 30. Service Charge

You specifically requested service charge as a **universal feature**.

Therefore it should not be restaurant-only.

Possible examples:

```text
Restaurant:
10%

Salon:
5%

Hotel:
10%

Retail:
Disabled
```

---

# 31. Service Charge Configuration

Admin should be able to configure:

```text
Enabled
Name
Rate/Amount
Percentage/Fixed
Taxable
```

This gives the business flexibility without creating industry-specific code.

---

# 32. Calculation Order

We need one canonical calculation sequence.

I recommend:

```text
Base Item Prices
       ↓
Line Discounts
       ↓
Subtotal
       ↓
Sale Discount
       ↓
Discounted Subtotal
       ↓
Tax
       ↓
Service Charge
       ↓
Final Total
```

The exact relationship between tax and service charge should be determined by the business configuration.

The calculation engine should never rely on frontend arithmetic.

---

# 33. Money Representation

This is extremely important.

Do **not** store financial values as JavaScript floating-point numbers.

Avoid:

```text
19.99
```

being directly used for financial persistence.

Use a fixed-precision monetary representation in PostgreSQL, with currency explicitly associated with the transaction.

For the Nigerian deployment:

```text
NGN
```

---

# 34. Payment Methods

Your selected methods are:

```text
Cash
Card
Bank Transfer
```

No:

* mobile payment
* split payment
* partial payment

for normal POS checkout.

---

# 35. Default Payment Method

The POS should allow the business to select a default payment method.

Example:

```text
Default:
Cash
```

The cashier can switch to:

```text
Card
Transfer
```

with one action.

This is primarily a **speed optimization**.

---

# 36. Client POS Payments vs Subscription Payments

This distinction must remain extremely clear.

### POS customer payment

```text
Customer
 ↓
Business
```

These payments are **not processed through the platform's Paystack integration**.

The POS simply records:

```text
Cash
Card
Bank Transfer
```

as the business's payment method.

---

### Software subscription payment

```text
Business Owner
 ↓
POS Platform
 ↓
Paystack
```

This is where Paystack is used.

---

# 37. Cash Payment

For cash:

```text
Total:
₦8,500

Customer gives:
₦10,000

Change:
₦1,500
```

The system should calculate the change automatically.

---

# 38. Card Payment

The POS records:

```text
Payment Method:
CARD

Amount:
₦8,500

Status:
CONFIRMED
```

The system does not need to process the card transaction itself in the initial architecture.

The external physical card terminal handles the actual payment.

The cashier records the payment in the POS.

---

# 39. Bank Transfer

Similarly:

```text
Payment Method:
BANK_TRANSFER
```

The POS records that the business received/confirmed the transfer.

For security, businesses may configure whether:

```text
Cashier
```

can mark transfers as received or whether:

```text
Manager
```

authorization is required.

---

# 40. Payment Confirmation

The transaction should not become completed merely because:

```text
Cashier clicked "Complete Sale"
```

The system must validate:

```text
Payment amount
Transaction state
Inventory availability
Authorization
```

before committing.

---

# 41. Duplicate Transactions

A major problem to prevent:

```text
Cashier clicks Complete
      ↓
Network delay
      ↓
Clicks again
      ↓
Two sales
```

The backend must use idempotency.

Each checkout attempt should have a unique idempotency key.

---

# 42. Idempotency

Example:

```text
idempotency_key:
checkout-8e31...
```

If the same request reaches the server twice:

```text
Request 1 → creates Sale #184
Request 2 → returns Sale #184
```

rather than creating Sale #185.

This is particularly important for unstable networks, even though we have now **completely removed offline POS capability**.

---

# 43. Concurrency

Two cashiers may attempt to sell the last product simultaneously.

Example:

```text
Stock:
1

Cashier A:
Sell 1

Cashier B:
Sell 1
```

Only one should succeed.

The backend must enforce this at the database level.

---

# 44. Atomic Checkout

The checkout operation should conceptually happen within one PostgreSQL transaction:

```text
BEGIN

Validate sale

Validate permissions

Validate inventory

Create sale

Create sale lines

Create payment

Create inventory movements

Update inventory balance

Create audit record

COMMIT
```

If anything fails:

```text
ROLLBACK
```

Everything is reverted.

---

# 45. Why Frontend Validation Isn't Enough

The frontend might say:

```text
Stock:
5
```

but another cashier could sell 3 before the first cashier completes checkout.

Therefore:

> **The backend must always revalidate inventory.**

The frontend validation is only for UX.

---

# 46. Refunds

You selected:

> Refunds YES.

and:

> Refunds require authorization.

Therefore refunds should have a dedicated workflow.

```text
Completed Sale
      ↓
Refund Request
      ↓
Authorization
      ↓
Refund
      ↓
Inventory Movement
      ↓
Financial Record
      ↓
Audit
```

---

# 47. Refund Types

Initially:

### Full refund

Entire transaction refunded.

### Partial refund

Specific line(s) or quantities refunded.

This is necessary even though you excluded **partial payments**.

Partial **refunds** are a different concept and should remain supported.

---

# 48. Refund Authorization

Example:

```text
Cashier:
Can request refund

Manager:
Can approve refund
```

or:

```text
Cashier:
Cannot refund
```

depending on permissions.

The authorization requirement should be configurable.

---

# 49. Refund Cannot Exceed Sale

The system must ensure:

```text
Refunded quantity <= Sold quantity
```

and:

```text
Total refunded <= Original transaction total
```

This must be enforced server-side.

---

# 50. Refund Inventory

If an item is returned:

```text
Original:
-1 inventory

Refund:
+1 inventory
```

The system records the movement.

The exact treatment of returned physical goods can later be expanded, but we should not introduce your excluded "damaged stock" subsystem.

---

# 51. Exchanges

You explicitly selected:

> Exchanges — NO.

Therefore the POS should not have an exchange workflow.

A user can:

```text
Refund
+
New Sale
```

if the business wants to effectively perform an exchange.

---

# 52. Receipts

You selected:

> Receipts YES.

And:

> Multiple templates, Admin-only configuration.

Therefore:

```text
Receipt Template
```

is a configurable business setting.

Possible templates:

```text
Compact
Standard
Detailed
```

The actual template collection can be designed during UI work.

---

# 53. Digital Receipt

You selected digital receipts but excluded:

* Email receipts
* SMS receipts
* WhatsApp receipts

Therefore "digital receipt" should initially mean a receipt accessible/generated digitally by the application.

For example:

```text
View Receipt
Download/Print
```

rather than sending it automatically through a messaging channel.

---

# 54. Receipt Data

Receipts must use the **transaction snapshot**, not the current product catalog.

So even if:

```text
Product renamed
Price changed
Category changed
```

the old receipt remains correct.

---

# 55. Receipt Branding

Your configurable branding should appear on receipts:

```text
Business Logo
Business Name
Primary Color
Secondary Color
Contact Information
```

depending on the selected template.

---

# 56. Audit Record

A completed transaction should create an audit record.

For example:

```text
SALE_COMPLETED

Actor:
Cashier 004

Branch:
Abuja

Business Unit:
Supermarket

Transaction:
POS-20260821-000184

Amount:
₦27,090

Timestamp:
...
```

---

# 57. Accounting Integration

You selected:

> Accounting — In-app.

Therefore every completed sale should eventually create accounting/financial records.

We should **not** integrate QuickBooks, Xero, etc. initially.

This keeps the platform within the free/low-cost target.

The detailed accounting ledger will be defined in the next financial architecture stage.

---

# 58. Transaction Architecture

The conceptual model is now:

```text
SALE
 │
 ├── Sale Lines
 │      └── Product Snapshot
 │
 ├── Customer
 │
 ├── Discount
 │
 ├── Tax
 │
 ├── Service Charge
 │
 ├── Payment
 │
 ├── Inventory Movements
 │
 ├── Receipt
 │
 ├── Accounting Entries
 │
 └── Audit Record
```

---

# 59. Critical Invariant

The system must enforce:

> **A completed sale must have a valid payment record, valid sale lines, valid totals, and corresponding inventory/accounting records where applicable.**

And:

> **No completed sale may be modified destructively.**

---

# 60. Failure Scenario

Suppose checkout executes:

```text
Sale created
↓
Payment created
↓
Inventory update FAILS
```

The system must **not** leave:

```text
Sale = completed
Payment = recorded
Inventory = unchanged
```

Instead:

```text
ROLLBACK
```

The entire database transaction fails.

The cashier can retry.

---

# 61. What About External Payment Terminals?

Because physical card terminals are external to the application, there is an unavoidable operational scenario:

```text
Card terminal:
Payment successful

POS:
Payment failed to save
```

This is why payment recording needs careful idempotency and reconciliation architecture.

We will address that during the **financial and reconciliation stage** rather than pretending the POS can know what happened inside an external terminal.

---

# 62. POS Performance Requirements

The POS interface should prioritize:

```text
Scan
→ Add
→ Checkout
→ Pay
→ Complete
```

with as few interactions as possible.

The UI should avoid unnecessary modal windows and page navigation.

---

# 63. Keyboard/Scanner Workflow

Barcode scanners commonly behave like keyboard input.

Therefore the POS should support:

```text
Scanner
 ↓
Focused barcode input
 ↓
Enter
 ↓
Product added
```

The cashier should not need to manually click a search field every time.

---

# 64. Responsive POS

The same POS should work on:

```text
Desktop
Tablet
Phone
```

but the interface should adapt.

Desktop:

```text
Products | Cart | Checkout
```

Tablet:

```text
Products
   ↓
Cart
```

Phone:

```text
Product Search
 ↓
Cart
 ↓
Checkout
```

---

# 65. POS and Business Configuration

The POS should automatically adapt to the business unit's enabled features.

For example:

### Restaurant

```text
Service Charge: ON
Tips: ON
Customer Tabs: ON
```

### Clothing Store

```text
Variants: ON
Service Charge: OFF
Tips: OFF
```

### Pharmacy

```text
Batch Tracking: ON
Expiry Tracking: ON
```

The same underlying POS application is used.

Only configuration changes.

---

# 66. Important Architectural Principle

We should avoid code like:

```text
if businessType === "restaurant"
```

everywhere.

Instead prefer:

```text
if featureEnabled("service_charge")
```

or:

```text
businessUnit.configuration.serviceCharge.enabled
```

This keeps the system genuinely dynamic.

---

# 67. Business Type vs Feature

This distinction is extremely important for the PRD.

**Business type is classification.**

**Feature configuration determines behavior.**

Example:

```text
Business Type:
Restaurant
```

may activate recommended defaults:

```text
Service Charge → ON
Tips → ON
Customer Tabs → ON
```

But the owner can change them where permitted.

Therefore business type should **not dictate the entire application**.

---

# 68. Recommended Architecture

The flow becomes:

```text
Business Type
      ↓
Recommended Configuration
      ↓
Owner Configuration
      ↓
Feature Flags / Settings
      ↓
POS Behavior
```

This is the architecture that will make the platform scalable across your target industries.

---

# 69. Stage 4 Decisions Now Established

We have now defined:

* Cart architecture
* Sale architecture
* Sale lines
* Transaction numbers
* Transaction states
* Immutable transactions
* Customer association
* Store credit
* Layaway foundation
* Suspended sales
* Discounts
* Discount authorization
* Taxes
* Service charges
* Payment methods
* Default payment method
* Idempotency
* Concurrency protection
* Atomic checkout
* Refunds
* Refund authorization
* Inventory interaction
* Receipt architecture
* Audit interaction
* Responsive POS behavior
* Dynamic business configuration

---