# Stage 11 — Financials, Payments & Internal Accounting

This stage defines the **financial engine of the POS**.

The most important architectural decision here is:

> **Customer POS payments are internal business transactions. Paystack is used only for the client's software-subscription payments to you.**

So when a customer buys ₦50,000 worth of products, the POS does **not** send that payment through Paystack.

It simply records:

```text
Sale
 ↓
Payment Method
 ↓
Financial Ledger
 ↓
Reports
```

Paystack exists separately:

```text
Business Owner
 ↓
Software Subscription
 ↓
Paystack
 ↓
Super Admin
```

This separation should be absolute.

---

# 1. Financial Architecture

The financial system should be built around an internal immutable ledger.

Conceptually:

```text
                    FINANCIAL ENGINE
                           │
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
      SALES             REFUNDS           PAYMENTS
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ↓
                    FINANCIAL LEDGER
                           │
              ┌────────────┼────────────┐
              ↓            ↓            ↓
           Reports       Analytics    Accounting
```

The POS should never calculate financial reports directly from UI-level sales records.

Instead:

```text
Operational transactions
        ↓
Financial events
        ↓
Ledger
        ↓
Reports
```

---

# 2. Payment Methods

You selected:

* Cash
* Card
* Bank transfer
* Store credit

No:

* Split payments
* Partial payments for normal sales
* Mobile payments
* Gift cards

Therefore a completed POS sale has **one payment method**.

Example:

```text
Sale:
₦100,000

Payment:
Card

Status:
PAID
```

---

# 3. Payment Method Configuration

The business should be able to configure which payment methods are active.

Example:

```text
Payment Methods

✓ Cash
✓ Card
✓ Bank Transfer
✓ Store Credit
```

A business could disable a method.

For example, a small store may use:

```text
✓ Cash
✓ Transfer
✗ Card
✗ Store Credit
```

---

# 4. Default Payment Method

You previously requested:

> One payment method should be default to make checkout fast.

Therefore each business unit/branch POS configuration can have:

```text
default_payment_method
```

Example:

```text
Default:
Cash
```

The cashier can immediately complete:

```text
Scan → Total → Enter cash → Complete
```

without manually selecting Cash every time.

---

# 5. Payment vs Sale

These should be separate database concepts.

### Sale

Answers:

> What did the customer buy?

### Payment

Answers:

> How did the customer pay?

Example:

```text
Sale
₦50,000
5 products
```

and:

```text
Payment
₦50,000
Cash
```

This separation is extremely important for refunds, reporting and accounting.

---

# 6. Payment Status

Payments should support:

```text
PENDING
COMPLETED
FAILED
CANCELLED
REVERSED
REFUNDED
```

For ordinary cash transactions, the payment will generally move directly to:

```text
COMPLETED
```

---

# 7. Transaction Lifecycle

A normal sale should follow:

```text
CART
 ↓
CHECKOUT
 ↓
PAYMENT_PENDING
 ↓
PAID
 ↓
COMPLETED
```

Only after the transaction reaches the appropriate committed state should inventory and financial effects be finalized.

---

# 8. Transaction Atomicity

This is one of the most important technical requirements.

Suppose:

```text
Customer buys:
10 products
```

The system must not end up with:

```text
Payment:
SUCCESS

Inventory:
NOT UPDATED

Sale:
MISSING
```

or:

```text
Sale:
CREATED

Payment:
FAILED

Inventory:
DEDUCTED
```

The transaction-processing architecture must guarantee consistency.

---

# 9. Database Transactions

Supabase/PostgreSQL is particularly useful here because PostgreSQL provides transactional guarantees.

The core operation should conceptually behave like:

```text
BEGIN

Validate sale
Validate inventory
Create sale
Create sale items
Create payment
Update inventory
Create inventory movements
Create financial events
Create audit event

COMMIT
```

If a critical operation fails:

```text
ROLLBACK
```

This is much safer than performing unrelated client-side requests sequentially.

---

# 10. Concurrency Checks

You specifically requested concurrency checks.

This is essential.

Imagine:

```text
Stock:
1 iPhone
```

Two cashiers simultaneously sell it.

Without concurrency control:

```text
Cashier A → sees 1
Cashier B → sees 1

Both sell it.

Result:
-1 stock
```

That cannot happen.

---

# 11. Inventory Concurrency

The backend should perform an atomic inventory check/update.

Conceptually:

```text
UPDATE inventory
SET quantity = quantity - 1
WHERE product_id = X
AND branch_id = Y
AND available_quantity >= 1
```

Then verify that the update actually affected a row.

If:

```text
rows_updated = 0
```

the transaction fails because the stock is no longer available.

This should happen **server-side**, never merely in the frontend.

---

# 12. Price Integrity

The POS should also never trust prices sent from the browser.

The client might submit:

```text
product_id = 123
price = ₦1
```

even though the actual price is:

```text
₦100,000
```

The backend should retrieve the authoritative price from the database.

Therefore:

```text
Frontend
   ↓
Product ID
   ↓
Backend
   ↓
Current authorized price
   ↓
Sale calculation
```

---

# 13. Discount Architecture

You selected:

* Percentage discounts
* Fixed discounts

And discounts are allowed.

The system should represent the discount explicitly.

Example:

```text
Subtotal:
₦100,000

Discount:
10%

Discount amount:
₦10,000

Taxable subtotal:
₦90,000
```

The exact tax ordering should be configurable according to your tax rules.

---

# 14. Who Can Give Discounts?

Because you answered that discounts should be permission-controlled, the permission model should include:

```text
discount.apply
discount.fixed
discount.percentage
discount.override
```

You can additionally configure a maximum discount percentage.

Example:

```text
Cashier:
Maximum 5%

Manager:
Maximum 20%

Owner:
Unlimited
```

This is a very useful control against abuse.

---

# 15. Discount Audit

Every discount should record:

```text
Discount type
Discount value
Original amount
Discount amount
Applied by
Transaction
Timestamp
```

Example:

```text
Sale:
₦100,000

Discount:
₦10,000

Applied by:
Cashier #42

Authorized:
Manager #3
```

if authorization was required.

---

# 16. Tax

You selected:

> Tax and service charges are supported.

And earlier:

> Admin-defined tax rate/percentage.

Therefore the system should support a configurable tax configuration.

Example:

```text
VAT
Rate:
7.5%
```

---

# 17. One Active Tax Configuration

You explicitly rejected multiple tax rates.

Therefore we should keep the model simple:

```text
Active Tax:
VAT
7.5%
```

The business can modify the configured tax rate, but historical transactions should retain the rate that was actually applied.

This is critical.

---

# 18. Historical Tax Immutability

Suppose:

```text
January:
Tax = 7.5%
```

A sale occurs.

Later:

```text
Tax = 10%
```

The January transaction must still show:

```text
Tax:
7.5%
```

not:

```text
Tax:
10%
```

Therefore the transaction stores a snapshot of the applied tax.

---

# 19. Service Charge

You selected:

> Service charge should be available for all business types and controlled by the admin.

Therefore:

```text
service_charge_enabled
service_charge_type
service_charge_value
```

can be configured.

For example:

```text
Service charge:
5%
```

A business can turn it off:

```text
Service Charge:
OFF
```

---

# 20. Service Charge Example

```text
Subtotal:
₦100,000

Discount:
₦10,000

Tax:
₦6,750

Service charge:
₦4,500

Total:
₦101,250
```

The actual calculation order should be implemented as a centralized pricing engine rather than separately by different frontend screens.

---

# 21. Pricing Engine

This deserves its own backend service/module.

Conceptually:

```text
calculateTransaction()

Input:
Products
Quantities
Branch
Business Unit
Discount
Tax configuration
Service charge configuration

Output:
Subtotal
Discount
Tax
Service Charge
Grand Total
```

The **same calculation engine** should be used by:

* POS checkout
* Layaway
* Receipts
* Refund calculations
* Reports where applicable

This prevents different parts of the application from calculating different totals.

---

# 22. Rounding

Currency calculations must be handled carefully.

Do not rely on JavaScript floating-point arithmetic for authoritative financial calculations.

For example:

```text
0.1 + 0.2
```

can produce floating-point precision problems.

The backend should use PostgreSQL numeric/decimal types and deterministic rounding rules.

---

# 23. Currency

The initial system should support a business-defined currency.

For your Nigerian deployment:

```text
NGN
₦
```

should be the initial/default configuration.

The architecture can still store:

```text
currency_code
currency_symbol
decimal_places
```

so the system isn't hardcoded to ₦ forever.

---

# 24. Sale Financial Breakdown

Every completed sale should retain a snapshot:

```text
Subtotal
Discount
Tax
Service Charge
Grand Total
Currency
```

Example:

```text
Subtotal       ₦100,000
Discount        -₦5,000
Tax              ₦7,125
Service Charge   ₦4,750
--------------------------------
Total           ₦106,875
```

---

# 25. Refunds

You selected:

> Refunds YES
> Authorization required.

A refund should never modify the original sale.

Instead:

```text
Original Sale
      ↓
Refund Transaction
```

Example:

```text
Original:
₦100,000

Refund:
₦20,000
```

The original remains:

```text
₦100,000
```

while the refund is recorded independently.

---

# 26. Refund Permissions

Recommended permissions:

```text
refund.request
refund.approve
refund.process
refund.full
refund.partial
```

The exact approval workflow can be kept simple.

Example:

```text
Cashier
 ↓
Requests refund
 ↓
Manager approves
 ↓
Refund completed
```

---

# 27. Refund Reasons

Required:

```text
Customer return
Incorrect item
Incorrect quantity
Pricing error
Duplicate transaction
Damaged product
Other
```

"Other" requires an explanation.

---

# 28. Refund Inventory

For a valid product return:

```text
Original Sale
 ↓
Refund
 ↓
Inventory Return
```

Inventory increases accordingly.

But the system should allow an authorized user to indicate that the item **does not return to sellable stock** if your later business requirements need that.

Since you explicitly excluded a damaged-stock subsystem, we should not create a separate damaged inventory system now.

---

# 29. Store Credit as a Payment Method

Store credit is treated as a financial instrument inside the business.

Example:

```text
Sale:
₦20,000

Payment:
Store Credit

Credit ledger:
-₦20,000
```

No external payment provider is involved.

---

# 30. Layaway Payments

Layaway payments are also internal financial events.

Example:

```text
Layaway:
₦500,000

Payment #1:
₦100,000 Cash

Payment #2:
₦100,000 Transfer
```

Each payment gets its own financial record.

---

# 31. Accounts Receivable

Because you support layaway, the system needs a basic accounts-receivable concept.

Example:

```text
Layaway total:
₦500,000

Paid:
₦200,000

Outstanding:
₦300,000
```

This is not a full accounting receivable system.

It is a **POS-level receivable** tied specifically to layaway.

---

# 32. No Customer Credit Sales

Important distinction:

You selected store credit and layaway, but that does **not automatically mean normal "buy now, pay later" sales**.

A standard checkout should remain:

```text
Full payment required
```

unless it is explicitly a:

```text
LAYAWAY
```

transaction.

This keeps your financial model much safer.

---

# 33. Revenue

The system should distinguish:

```text
Gross Sales
Discounts
Returns/Refunds
Net Sales
Tax
Service Charges
```

For example:

```text
Gross Sales:
₦5,000,000

Discounts:
₦250,000

Refunds:
₦100,000

Net Sales:
₦4,650,000
```

Tax and service charge should be separately reported rather than silently included in revenue.

---

# 34. COGS

You wanted intermediate accounting functionality.

Therefore we can support:

> Cost of Goods Sold.

But this depends on whether the business has supplied product cost data.

If:

```text
Selling price:
₦100,000

Cost:
₦60,000
```

then:

```text
Gross Profit:
₦40,000
```

---

# 35. Product Cost

The product system should therefore optionally support:

```text
cost_price
```

or an appropriate branch-level cost.

Since procurement is excluded, this is manually managed.

The system should clearly indicate:

> "Cost data is manually configured."

It should not imply that the cost came from supplier purchasing records.

---

# 36. Gross Profit

Where cost data exists:

```text
Net Sales
-
COGS
=
Gross Profit
```

Example:

```text
Net Sales:
₦4,650,000

COGS:
₦2,800,000

Gross Profit:
₦1,850,000
```

If cost data doesn't exist, the system should say:

> Gross profit unavailable because cost information is incomplete.

It should **not invent a value**.

---

# 37. Financial Ledger

This is the core accounting primitive.

Every financial event creates a ledger entry.

Example:

```text
FINANCIAL LEDGER

SALE
+₦100,000

DISCOUNT
-₦10,000

TAX
+₦6,750

SERVICE_CHARGE
+₦4,500

REFUND
-₦20,000
```

The exact accounting representation can become more sophisticated later.

---

# 38. Immutable Ledger

Once a financial event is posted:

> **It cannot be edited or deleted.**

If something is wrong:

```text
Original Entry
      ↓
Reversal
      ↓
Corrected Entry
```

This follows your earlier decision that transactional data is immutable.

---

# 39. Financial Reversal

Example:

A sale was accidentally posted:

```text
₦100,000
```

The system should not change it to:

```text
₦80,000
```

Instead:

```text
Original:
+₦100,000

Reversal:
-₦100,000

Corrected:
+₦80,000
```

This creates an auditable trail.

---

# 40. Payment Reconciliation

Even though we're not implementing traditional cash registers, the system should still allow basic reconciliation.

For example:

```text
Today's recorded payments:

Cash:
₦500,000

Card:
₦800,000

Transfer:
₦300,000
```

The business can compare these figures with its actual records.

We don't need a complex cash-drawer module.

---

# 41. Payment Reports

The system should provide:

```text
Payment Summary
```

with:

* total sales
* cash payments
* card payments
* transfer payments
* store-credit payments
* refunds
* net payment totals

Filters:

```text
Date
Branch
Business Unit
Payment Method
User
```

---

# 42. Accounting Periods

The system should support reporting periods such as:

```text
Today
Yesterday
This Week
This Month
Last Month
This Quarter
This Year
Custom Range
```

No complicated accounting-period closing system is necessary for MVP.

---

# 43. Daily Financial Summary

The dashboard can display:

```text
Today's Financial Summary

Gross Sales      ₦2,500,000
Discounts          ₦100,000
Refunds             ₦50,000
Net Sales         ₦2,350,000

Tax                 ₦176,250
Service Charges      ₦50,000

Gross Profit*       ₦900,000
```

`*` only if cost information is available.

---

# 44. Business-Level Reporting

Owner/Admin can see:

```text
Entire Business
      ↓
Branch A
Branch B
Branch C
      ↓
Business Units
      ↓
Financial performance
```

Branch managers see only what their permissions permit.

---

# 45. Business Unit Financial Reporting

Because transactions retain the business unit:

```text
Supermarket:
₦5,000,000

Pharmacy:
₦1,500,000

Restaurant:
₦2,300,000
```

The Owner can compare them.

This is one of the strongest benefits of your configurable-platform architecture.

---

# 46. Tax Reporting

The system should provide:

```text
Tax Collected
Tax by period
Tax by branch
Tax by business unit
Tax by transaction
```

Example:

```text
August 2026

Tax collected:
₦350,000
```

The system should make clear that this is a **recording/reporting facility**, not professional tax advice or automatic government filing.

---

# 47. Service Charge Reporting

Similarly:

```text
Service Charges
```

should be independently reportable.

Example:

```text
August:
₦150,000
```

This is particularly useful for restaurants and hotels.

---

# 48. Payment References

Each payment should have an internal unique reference.

Example:

```text
PAY-20260821-000123
```

This is separate from:

* Paystack references
* bank references
* card terminal references

For bank transfers, a business can optionally record an external reference.

---

# 49. Paystack Isolation

The architecture should explicitly separate:

```text
POS Payment Domain
```

from:

```text
Subscription Billing Domain
```

Conceptually:

```text
                    APPLICATION
                         │
            ┌────────────┴────────────┐
            ↓                         ↓
       POS PAYMENTS             SUBSCRIPTION
            │                         │
     Cash/Card/Transfer        Paystack
     Store Credit
```

There should be no code path where customer POS sales accidentally call the subscription Paystack integration.

---

# 50. Subscription Payments

The only Paystack payment flow is:

```text
Owner
 ↓
Subscription Page
 ↓
Select:
Monthly / Quarterly /
Semi-Annual / Annual
 ↓
Paystack
 ↓
Payment Verification
 ↓
Subscription Extended
```

Payment verification must happen server-side.

The frontend must never simply assume:

```text
Paystack window closed
=
Payment successful
```

---

# 51. Subscription Financial Records

The subscription system should maintain its own records:

```text
subscription_id
plan
duration
amount
payment_reference
status
started_at
expires_at
```

These are separate from customer POS financial records.

---

# 52. Financial Security

Financial operations should require:

* server-side validation
* authorization
* transaction atomicity
* immutable records
* audit logging
* concurrency control
* idempotency
* unique transaction references

---

# 53. Idempotency

This is particularly important.

Imagine a cashier clicks:

> **Complete Sale**

twice because the UI freezes.

Without idempotency:

```text
Sale #1
₦100,000

Sale #2
₦100,000
```

The customer gets charged twice.

The backend should use an idempotency key.

Conceptually:

```text
idempotency_key
```

If the same request arrives twice:

```text
Request #1 → Process
Request #2 → Return existing result
```

This should be mandatory for critical financial operations.

---

# 54. Financial Audit

Every financial operation should produce an audit event.

Example:

```text
USER:
Cashier 42

ACTION:
Refund

TRANSACTION:
TX-10092

AMOUNT:
₦50,000

REASON:
Customer return

AUTHORIZED BY:
Manager 7

TIMESTAMP:
...
```

---

# 55. Financial Dashboard

The Owner/Admin dashboard should eventually contain:

```text
Today's Sales
Today's Net Sales
Refunds
Discounts
Tax
Service Charges
Payment Breakdown
Gross Profit
Outstanding Layaway
Store Credit Liability
```

---

# 56. What We Are NOT Building

To preserve your scope and budget, we are deliberately **not** implementing:

* QuickBooks integration
* Xero integration
* Sage integration
* automated bank reconciliation
* payroll
* expense management
* supplier accounts
* purchase orders
* accounts payable
* full double-entry accounting UI
* invoicing platform
* external payment gateway for customer purchases

The internal accounting functionality remains focused on what a POS actually needs.

---

# 57. Free/Low-Cost Architecture

Your requirement is:

> Prefer free. Maximum paid-service budget ≈ $10/month.

This architecture fits that constraint.

### Supabase

Use for:

* PostgreSQL
* Authentication
* Row Level Security
* database functions
* storage
* realtime where needed

### Resend

Use for:

* subscription notifications
* system emails

The free tier should be sufficient at early scale.

### Paystack

Used only when a client pays for their software subscription.

### GitHub

Used for:

* source control
* CI/CD
* automated tests

### Hosting

We'll address the final hosting architecture separately, but the application should be designed to minimize paid infrastructure.

---

# 58. Critical Architectural Rule

The frontend should **never be the authority for financial calculations**.

Bad:

```text
React/Vue
 ↓
calculate total
 ↓
insert sale
```

Correct:

```text
Frontend
 ↓
Submit transaction intent
 ↓
Backend
 ↓
Validate
 ↓
Calculate
 ↓
Commit
 ↓
Return authoritative result
```

The frontend can calculate totals for responsiveness, but the backend must recalculate and validate them before committing.

---

# 59. Stage 11 Final Architecture

The financial model becomes:

```text
                    POS
                     │
                     ↓
                TRANSACTION
                     │
             ┌───────┼────────┐
             ↓       ↓        ↓
           SALE    PAYMENT  INVENTORY
             │       │
             └───────┼────────┘
                     ↓
               FINANCIAL EVENT
                     │
                     ↓
                LEDGER
                     │
          ┌──────────┼──────────┐
          ↓          ↓          ↓
       Reports    Analytics   Accounting
```

Meanwhile:

```text
                 SUBSCRIPTION
                      │
                      ↓
                   PAYSTACK
                      │
                      ↓
              SUBSCRIPTION LEDGER
```

These two financial domains remain separate.

---

# 60. Stage 11 Locked Decisions

| Area                              | Decision                           |
| --------------------------------- | ---------------------------------- |
| POS customer payments             | Internal                           |
| Paystack                          | Subscription only                  |
| Payment methods                   | Cash, Card, Transfer, Store Credit |
| Split payments                    | No                                 |
| Partial normal-sale payments      | No                                 |
| Default payment method            | Yes                                |
| Discounts                         | Fixed + percentage                 |
| Discount permissions              | Granular                           |
| Tax                               | Yes                                |
| Multiple tax rates                | No                                 |
| Service charge                    | Yes                                |
| Service charge configurable       | Yes                                |
| Refunds                           | Yes                                |
| Refund authorization              | Yes                                |
| Refund records                    | Immutable                          |
| Financial ledger                  | Yes                                |
| Ledger immutability               | Yes                                |
| Reversals                         | Yes                                |
| Concurrency protection            | Yes                                |
| Idempotency                       | Yes                                |
| Server-side calculations          | Required                           |
| COGS                              | Yes, when cost data exists         |
| Gross profit                      | Yes, when cost data exists         |
| Internal accounting               | Yes                                |
| External accounting integrations  | No                                 |
| Payment reconciliation            | Basic                              |
| Cash-register management          | No                                 |
| Cashier shifts                    | No                                 |
| Payroll                           | No                                 |
| Supplier accounting               | No                                 |
| Customer POS Paystack integration | No                                 |

---