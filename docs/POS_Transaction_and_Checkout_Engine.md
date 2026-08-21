# Stage 8 — POS Transaction & Checkout Engine

This stage defines the **core transaction engine** of the POS.

This is the part that must be exceptionally reliable because a POS transaction simultaneously affects:

* the sale
* inventory
* payment records
* customer balances
* discounts
* taxes
* service charges
* receipts
* reports
* audit logs

The central architectural rule should be:

> **A completed sale is an atomic business event. Either every required part succeeds, or the transaction does not complete.**

---

# 1. Transaction Lifecycle

A sale should move through explicit states.

```text
DRAFT
  ↓
PENDING
  ↓
COMPLETED
```

With alternative paths:

```text
DRAFT → SUSPENDED
DRAFT → CANCELLED

PENDING → FAILED
PENDING → CANCELLED

COMPLETED → REFUNDED
COMPLETED → PARTIALLY_REFUNDED
```

We should **never delete a completed transaction**.

---

# 2. Cart vs Transaction

These need to be separate concepts.

### Cart

Temporary working state:

```text
Cashier is currently building a sale.
```

### Transaction

Permanent financial record:

```text
Sale was successfully completed.
```

Therefore:

```text
Cart
 ↓
Checkout
 ↓
Transaction
```

Once converted into a completed transaction, the original cart is no longer the source of truth.

---

# 3. Cart

A cart contains:

```text
Cart
├── Items
├── Customer
├── Discount
├── Tax
├── Service Charge
└── Total
```

Example:

```text
Coke × 2       ₦2,000
Bread × 1      ₦1,500
----------------------
Subtotal       ₦3,500
Discount        -₦500
Tax             ₦300
Service Charge  ₦100
----------------------
TOTAL          ₦3,400
```

---

# 4. Product Snapshot

When an item enters a completed transaction, we should **snapshot important product information**.

For example:

```text
Product:
Coke Zero

SKU:
COC-ZERO-50

Unit Price:
₦1,000
```

The transaction should retain that information even if the product is later changed.

This is critical for historical accuracy.

---

# 5. Why Snapshotting Matters

Suppose today:

```text
Coke = ₦1,000
```

and tomorrow the admin changes it to:

```text
Coke = ₦1,500
```

Yesterday's receipt must still show:

```text
₦1,000
```

not dynamically retrieve the current product price.

Therefore transaction items contain historical values.

---

# 6. Transaction Item

Conceptually:

```text
Transaction Item
├── Product ID
├── Variant ID
├── Product Name Snapshot
├── SKU Snapshot
├── Barcode Snapshot
├── Unit Price
├── Quantity
├── Discount
├── Tax
├── Total
└── Metadata
```

---

# 7. Pricing Calculation

The calculation pipeline should be deterministic.

I recommend:

```text
Base Price
 ↓
Quantity
 ↓
Line Discount
 ↓
Subtotal
 ↓
Tax
 ↓
Service Charge
 ↓
Transaction Discount
 ↓
Grand Total
```

However, we need to be precise about **where discounts occur relative to tax/service charge**.

That should be a configurable business rule, but the default should be consistent.

---

# 8. Recommended Calculation Order

For the initial system:

```text
Line Subtotal
       ↓
Line Discount
       ↓
Discounted Subtotal
       ↓
Tax
       ↓
Service Charge
       ↓
Grand Total
```

This prevents ambiguous calculations.

---

# 9. Discounts

You selected:

* Percentage discounts
* Fixed discounts

Both should be supported.

Example:

```text
Subtotal:
₦10,000

10% discount:
-₦1,000

Tax:
₦450

Total:
₦9,450
```

---

# 10. Fixed Discount

Example:

```text
Subtotal:
₦10,000

Discount:
₦1,500

Tax:
₦425

Total:
₦8,925
```

The system should validate that the discount cannot reduce the applicable amount below zero.

---

# 11. Discount Scope

I recommend supporting:

### Line discount

```text
Coke
₦1,000
↓
10% off
```

### Cart discount

```text
Entire sale
↓
₦1,000 off
```

This is more useful than supporting only one discount type.

---

# 12. Discount Permissions

Not every employee should have unrestricted discounts.

For example:

```text
Cashier
↓
Up to 5%
```

while:

```text
Branch Manager
↓
Up to 20%
```

and:

```text
Owner
↓
Unlimited/configured
```

The exact limits should be configurable.

---

# 13. Discount Authorization

If a cashier attempts:

```text
20% discount
```

but their permitted limit is:

```text
5%
```

the system should request authorization.

```text
Discount exceeds permission
        ↓
Manager authorization
        ↓
Approved
        ↓
Sale continues
```

---

# 14. Taxes

You selected:

> Tax enabled and configured by Admin.

The system should support a business-level tax configuration.

Example:

```text
VAT
7.5%
```

or another configured rate.

---

# 15. Single Tax Rate

You explicitly rejected multiple tax rates.

Therefore the initial transaction engine should use:

```text
Tax Rate:
ONE ACTIVE RATE
```

per applicable configuration.

We should not introduce a complex multi-tax engine.

---

# 16. Tax Snapshot

When a transaction completes, store:

```text
Tax Rate:
7.5%

Tax Amount:
₦750
```

The transaction should not recalculate historical tax using today's configuration.

---

# 17. Service Charge

You decided that service charge should be available to **all business types**.

It should therefore be a generic checkout capability.

Example:

```text
Subtotal:
₦10,000

Service charge:
5%

₦500
```

---

# 18. Service Charge Configuration

You selected:

> Admin configurable.

Therefore an Owner/Admin can configure:

```text
Service Charge:
Enabled

Type:
Percentage / Fixed

Value:
5%
```

and the business can turn it off.

---

# 19. Business Unit POS Configuration

Because each business unit has its own POS configuration:

```text
Supermarket
Service charge:
OFF
```

while:

```text
Restaurant Juice Bar
Service charge:
5%
```

can coexist in the same branch.

This is exactly why business-unit-level POS configuration is useful.

---

# 20. Customers

Customer identification is optional.

You selected:

> Customer can be identified optionally.

Therefore a normal cash sale can be:

```text
Sale
 ↓
No customer
 ↓
Payment
 ↓
Receipt
```

while store credit/layaway requires:

```text
Sale
 ↓
Customer
 ↓
Payment arrangement
```

---

# 21. Customer Creation

Authorized POS users should be able to create customers.

Minimum information:

```text
Name
Phone
Email (optional)
Address (optional)
```

We should avoid collecting unnecessary personal information.

---

# 22. Store Credit

You selected:

> Store credit — YES.

Store credit must be tied to an existing customer.

Therefore:

```text
Customer
 ↓
Store Credit Account
```

---

# 23. Store Credit Example

Customer has:

```text
Credit Balance:
₦20,000
```

They purchase:

```text
₦7,000
```

using store credit.

Remaining:

```text
₦13,000
```

Every credit movement must be recorded.

---

# 24. Store Credit Ledger

We should maintain:

```text
CREDIT
DEBIT
ADJUSTMENT
REFUND_TO_CREDIT
```

rather than simply changing:

```text
customer.credit_balance
```

without history.

This provides accountability.

---

# 25. Store Credit Permissions

Store credit is financially sensitive.

We should have permissions such as:

```text
customer.credit.view
customer.credit.use
customer.credit.adjust
customer.credit.refund
```

Only authorized users should be able to manually adjust balances.

---

# 26. Layaway

Your chosen workflow is:

1. Record customer
2. Record outstanding balance
3. Record payment history
4. Allow multiple installment payments

Therefore layaway should be treated as a **payment arrangement**, not a normal completed sale.

---

# 27. Layaway Lifecycle

```text
LAYAWAY_CREATED
      ↓
PARTIALLY_PAID
      ↓
FULLY_PAID
      ↓
FULFILLED
```

Alternative:

```text
LAYAWAY_CREATED
      ↓
CANCELLED
```

---

# 28. Layaway Example

Product:

```text
Laptop
₦500,000
```

Customer pays:

```text
₦100,000
```

Outstanding:

```text
₦400,000
```

Later:

```text
₦150,000
```

Outstanding:

```text
₦250,000
```

Then:

```text
₦250,000
```

Outstanding:

```text
₦0
```

---

# 29. Layaway Inventory

When the layaway is created, inventory should be **reserved** according to the inventory architecture from Stage 6.

This prevents:

```text
Customer A reserves laptop
```

and then:

```text
Customer B buys the same laptop
```

from causing an inventory conflict.

---

# 30. Layaway Completion

When fully paid:

```text
Layaway
 ↓
Fulfilled
 ↓
Sale finalized
 ↓
Inventory permanently deducted
 ↓
Receipt generated
```

The exact reservation-to-deduction mechanics will be implemented transactionally.

---

# 31. Payment Methods

You selected:

* Cash
* Card
* Bank transfer

These are the only normal POS payment methods initially.

No:

* mobile payments
* split payments

---

# 32. Default Payment Method

You wanted one payment method to be the default for fast checkout.

Therefore business-unit configuration can contain:

```text
Default Payment Method:
Cash
```

or:

```text
Card
```

or:

```text
Transfer
```

---

# 33. Payment Architecture

Important distinction:

### Customer POS payment

```text
Customer
 ↓
Business
```

This happens outside the platform's Paystack subscription billing.

### Software subscription payment

```text
Business Owner
 ↓
Paystack
 ↓
POS Platform
```

These are completely separate.

---

# 34. POS Cash Payment

For cash:

```text
Total:
₦25,000

Customer gives:
₦30,000

Change:
₦5,000
```

The system calculates change automatically.

---

# 35. Card Payment

The system records:

```text
Payment Method:
CARD
```

but should not assume that the POS itself processes the customer's card through Paystack.

The exact hardware/payment terminal integration can remain external.

The cashier confirms the payment was successfully received.

---

# 36. Bank Transfer

Similarly:

```text
Payment Method:
BANK_TRANSFER
```

The cashier records/validates that payment was received.

This is **not** the same as the Paystack subscription flow.

---

# 37. Payment State

Payments should have explicit states:

```text
PENDING
COMPLETED
FAILED
CANCELLED
REFUNDED
```

---

# 38. Transaction Atomicity

This is extremely important.

Imagine:

```text
Sale:
₦50,000

Inventory:
5 units
```

The transaction must not end up as:

```text
Payment = SUCCESS
Inventory = unchanged
Sale = missing
```

or:

```text
Inventory = deducted
Payment = failed
Sale = missing
```

These are unacceptable.

---

# 39. Atomic Transaction

The backend should perform the critical database operations in a PostgreSQL transaction:

```text
BEGIN
 ↓
Validate permissions
 ↓
Validate stock
 ↓
Validate prices
 ↓
Calculate totals
 ↓
Create sale
 ↓
Create sale items
 ↓
Create payment
 ↓
Deduct inventory
 ↓
Create inventory movements
 ↓
Create audit events
 ↓
COMMIT
```

If a critical operation fails:

```text
ROLLBACK
```

---

# 40. Concurrency Checks

You specifically requested concurrency checks.

Consider:

```text
Stock = 1
```

Two cashiers simultaneously attempt to sell it.

Without concurrency protection:

```text
Cashier A → sees 1
Cashier B → sees 1

A sells
B sells

Final stock:
-1
```

That's unacceptable.

---

# 41. Database-Level Concurrency

The stock validation and deduction must happen atomically at the database level.

Conceptually:

```text
UPDATE inventory
SET quantity = quantity - 1
WHERE product_id = X
AND quantity >= 1;
```

Then verify:

```text
Rows affected = 1
```

If:

```text
Rows affected = 0
```

the transaction fails because stock is unavailable.

This is much safer than:

```text
SELECT quantity
```

followed by a separate:

```text
UPDATE
```

---

# 42. Idempotency

We also need protection against duplicate requests.

Imagine a cashier clicks:

```text
COMPLETE SALE
```

twice.

Or the browser sends the request twice.

Without idempotency:

```text
Sale A
Sale B
```

could both be created.

---

# 43. Idempotency Key

Each checkout attempt should have a unique idempotency key.

Conceptually:

```text
checkout_attempt_id
```

The database should enforce uniqueness.

If the same request arrives again:

```text
Existing transaction
      ↓
Return existing result
```

rather than creating another sale.

---

# 44. Double Payment Protection

The same principle applies to payment records.

A payment reference or transaction identifier should not be processed twice.

For example:

```text
payment_reference UNIQUE
```

where appropriate.

---

# 45. Transaction Number

Every completed transaction needs a human-readable reference.

Example:

```text
POS-20260821-000184
```

or a similar format.

It should be:

* unique
* searchable
* printable
* auditable

---

# 46. Transaction IDs

We should distinguish:

```text
Internal ID
```

from:

```text
Human-readable receipt number
```

For example:

```text
id:
UUID

transaction_number:
POS-20260821-000184
```

The UUID is for system relationships.

The transaction number is for humans.

---

# 47. Transaction Immutability

You explicitly selected:

> Transactional data is immutable.

Therefore once completed:

```text
SALE
```

cannot simply be edited.

If something is wrong:

```text
Original sale
      ↓
Refund / reversal / adjustment
```

creates a new financial event.

---

# 48. Why Immutability Matters

Without immutability:

```text
Yesterday:
₦100,000 sale

Today:
Someone edits it to ₦50,000
```

Historical reports become unreliable.

Instead:

```text
Original sale:
₦100,000

Refund:
₦50,000
```

The history remains intact.

---

# 49. Returns

You selected returns.

A return should reference the original sale.

Example:

```text
Sale #10294
 ↓
Item:
Nike Shoes
 ↓
Return:
1 unit
```

The system verifies that the customer cannot return more units than were originally sold, accounting for previous returns.

---

# 50. Refunds

Refunds require authorization.

Workflow:

```text
Refund Request
      ↓
Permission Check
      ↓
Authorization
      ↓
Refund Record
      ↓
Inventory Reversal
      ↓
Financial Reversal
      ↓
Audit Event
```

---

# 51. Refund Method

For the initial system, I recommend refunding through the original payment method where practical.

Example:

```text
Cash sale
→ Cash refund

Card sale
→ Card refund

Transfer sale
→ Transfer refund
```

But because actual card/transfer processing may happen through external terminals/banks, the system should primarily **record the refund**, rather than pretending it electronically reversed an external payment.

---

# 52. Suspended Sales

You selected:

> Hold/suspend sale.

A suspended sale is:

```text
temporary cart state
```

rather than a completed financial transaction.

Example:

```text
Customer forgot wallet
 ↓
Cashier suspends sale
 ↓
Customer returns
 ↓
Cashier resumes sale
```

---

# 53. Suspended Sale Data

It should preserve:

```text
Products
Quantities
Prices
Customer
Discount
Tax configuration
Business unit
Cashier
Created time
```

However, when resumed, the system should revalidate:

* product availability
* permissions
* applicable configuration

before completion.

---

# 54. Why Revalidate?

Suppose:

```text
Price yesterday:
₦1,000
```

Sale suspended.

Today:

```text
Price:
₦1,500
```

The business needs a defined rule for whether the suspended sale retains the old price or uses the new one.

**My recommendation: preserve the price captured when the sale was suspended**, while still validating that the product remains sellable and available.

This should be documented as a business rule.

---

# 55. Receipt Generation

You selected:

> Multiple receipt templates.

The Owner/Admin chooses the template.

The system should support configurable templates such as:

```text
Classic
Minimal
Detailed
Branded
```

The exact templates can be designed later.

---

# 56. Receipt Branding

The receipt can contain:

```text
Business Logo
Business Name
Branch Name
Address
Phone
Transaction Number
Cashier
Date/Time
Items
Discount
Tax
Service Charge
Total
Payment Method
```

---

# 57. Digital Receipt

You selected digital receipts.

Since you rejected email/SMS/WhatsApp receipts, "digital receipt" should initially mean:

> A receipt that can be viewed/downloaded digitally from the POS/application.

For example:

```text
Receipt
 ↓
Generate PDF / printable view
```

No external messaging service is required.

---

# 58. Receipt Printing

Receipt printing should support common thermal printer workflows.

The application should avoid coupling itself to one printer vendor.

We should design a printer abstraction layer.

Conceptually:

```text
POS
 ↓
Receipt Service
 ↓
Printer Adapter
 ↓
Supported Printer
```

---

# 59. Customer Display

You selected customer displays.

The architecture should eventually allow:

```text
Cashier Screen
       │
       ├────────→ Customer Display
       │
       ↓
     Checkout
```

The customer sees:

```text
Items
Prices
Discount
Tax
Total
```

This should be implemented as a browser-based display where practical rather than requiring expensive proprietary software.

---

# 60. Transaction Architecture

The final conceptual flow is:

```text
                 CART
                   │
                   ↓
              VALIDATION
                   │
          ┌────────┴────────┐
          ↓                 ↓
       Customer          Inventory
       Validation         Validation
          │                 │
          └────────┬────────┘
                   ↓
              CALCULATE
                TOTAL
                   ↓
                PAYMENT
                   ↓
            ATOMIC DATABASE
              TRANSACTION
                   │
        ┌──────────┼───────────┐
        ↓          ↓           ↓
       SALE      STOCK       AUDIT
      RECORD     MOVEMENT     EVENT
        │
        ↓
      RECEIPT
```

---

# 61. Failure Handling

If something goes wrong during completion:

```text
Payment/transaction operation fails
          ↓
No completed sale
          ↓
No partial inventory deduction
          ↓
No successful financial record
          ↓
Error returned to POS
```

The system should never leave a half-completed sale.

---

# 62. Important Boundary: External Payments

Because POS card and transfer payments are not being processed through the platform's own Paystack integration, we should **not pretend the software can verify an external payment automatically** unless a specific terminal/bank integration is added.

For MVP:

```text
Cash
→ Cashier confirms

Card
→ Cashier confirms external terminal payment

Transfer
→ Cashier confirms received transfer
```

These actions must still be audited.

---

# 63. Transaction Audit

A completed transaction should have associated audit information:

```text
Created by
Branch
Business Unit
Register/session if applicable
Timestamp
Payment method
Discount authorization
Refund authorization
```

This feeds the broader audit system.

---

# 64. Recommended POS Transaction Tables

Conceptually:

```text
sales
sale_items

payments
payment_methods

sale_discounts
sale_taxes
sale_service_charges

suspended_sales

refunds
refund_items

layaways
layaway_payments

store_credit_accounts
store_credit_transactions

transaction_sequences
```

The final schema will be designed after we complete the remaining domain architecture.

---

# 65. Stage 8 — Final Decisions

| Area                     | Decision                         |
| ------------------------ | -------------------------------- |
| Cart                     | Temporary state                  |
| Completed sale           | Immutable                        |
| Product snapshot         | Yes                              |
| Barcode checkout         | Yes                              |
| Search checkout          | Yes                              |
| Percentage discounts     | Yes                              |
| Fixed discounts          | Yes                              |
| Line discounts           | Yes                              |
| Cart discounts           | Yes                              |
| Discount authorization   | Permission-controlled            |
| Tax                      | Single configurable rate         |
| Service charge           | Configurable                     |
| Customer identification  | Optional                         |
| Store credit             | Yes                              |
| Layaway                  | Yes                              |
| Installments             | Multiple payments                |
| Payment methods          | Cash/Card/Transfer               |
| Split payments           | No                               |
| Partial normal payments  | No                               |
| Suspend sale             | Yes                              |
| Resume sale              | Yes                              |
| Returns                  | Yes                              |
| Exchanges                | No                               |
| Refunds                  | Yes                              |
| Refund authorization     | Yes                              |
| Receipt templates        | Multiple                         |
| Receipt printing         | Yes                              |
| Digital receipts         | Yes                              |
| Email receipts           | No                               |
| SMS/WhatsApp receipts    | No                               |
| Transaction immutability | Yes                              |
| Idempotency              | Yes                              |
| Concurrency checks       | Yes                              |
| Atomic transactions      | Yes                              |
| Inventory deduction      | Transactional                    |
| External POS payments    | Recorded, not Paystack-processed |
| Paystack                 | Subscription renewal only        |

---

## The Most Important Engineering Decisions From This Stage

Three things should **never be compromised**:

### 1. Atomicity

A sale cannot partially succeed.

### 2. Idempotency

One checkout attempt cannot accidentally create two sales.

### 3. Concurrency control

Two cashiers cannot successfully sell the same final unit simultaneously.

These three requirements are more important to the integrity of a POS than almost any UI feature.

---