# Stage 18 — POS Transaction Engine

This stage defines the **transactional core of the entire POS**. Everything else—reports, inventory, receipts, analytics, customer balances, audit logs—depends on getting this part right.

The key principle is:

> **The browser is responsible for the POS experience; the server/database is responsible for determining whether a transaction is actually valid.**

---

## 18.1 Transaction Lifecycle

A normal sale follows this flow:

```text
Product Scan/Search
        ↓
Add to Cart
        ↓
Resolve Current Price
        ↓
Adjust Quantity
        ↓
Apply Discount
        ↓
Calculate Tax
        ↓
Calculate Service Charge
        ↓
Calculate Final Total
        ↓
Customer Identification (optional/required by workflow)
        ↓
Select Payment Method
        ↓
Submit Sale
        ↓
SERVER VALIDATION
        ↓
Inventory Concurrency Check
        ↓
Create Sale
        ↓
Create Sale Items
        ↓
Record Payment
        ↓
Deduct Inventory
        ↓
Update Customer Balance (if applicable)
        ↓
Create Audit Record
        ↓
Generate Receipt
        ↓
Complete
```

---

# 18.2 The Cart Is Not the Transaction

This distinction is important.

While the cashier is building the cart:

```text
Cart ≠ Sale
```

The cart is temporary client-side state.

The actual sale only exists after successful server-side processing.

Therefore, closing the browser or navigating away before checkout should **not** create a sale.

---

# 18.3 Product Selection

Products can enter the cart through:

### Barcode

```text
Scanner
 ↓
Barcode
 ↓
Product lookup
```

### Search

```text
Search
 ↓
Product result
 ↓
Add to cart
```

### Product selection

```text
Category
 ↓
Product
 ↓
Add to cart
```

---

# 18.4 Product Identity

Every sellable product should have a stable internal identifier.

For example:

```text
product_id
```

The barcode is an attribute used to locate the product.

This means we should never use:

```text
barcode = product_id
```

as a fundamental assumption.

A product can potentially have:

* SKU
* barcode
* internal ID
* variant ID

---

# 18.5 Product Variants

Because you selected product variants, a product such as:

```text
T-Shirt
```

could contain:

```text
Small
Medium
Large
XL
```

Each sellable variant should have its own inventory identity.

Conceptually:

```text
Product
   │
   ├── Variant S
   ├── Variant M
   ├── Variant L
   └── Variant XL
```

The inventory should be associated with the **sellable variant**, not merely the parent product.

---

# 18.6 Price Resolution

You selected:

> Pricing configurable at Branch Level.

Therefore, the POS should resolve price approximately like:

```text
Product
   ↓
Variant
   ↓
Current Branch
   ↓
Branch Price
```

The POS should not simply use a global product price when a branch-specific price exists.

---

# 18.7 Price Snapshot

When a sale is completed, the sale item should store the price actually used.

For example:

```text
Product current price:
₦10,000

Sale price:
₦9,500
```

The sale should permanently retain:

```text
unit_price = ₦9,500
```

If the administrator changes the product price tomorrow, yesterday's sale must remain ₦9,500.

---

# 18.8 Historical Immutability

This connects directly to your decision:

> Transactional data is immutable.

A completed sale should not be edited like an ordinary database record.

Instead:

```text
Original Sale
     ↓
Refund / Reversal
     ↓
New Transaction
```

This preserves the financial history.

---

# 18.9 Quantity

Suppose:

```text
Product price = ₦2,000
Quantity = 3
```

Then:

```text
Subtotal = ₦6,000
```

The quantity must be validated against available inventory at checkout.

Not merely when the item is added to the cart.

---

# 18.10 Why Checkout Validation Is Necessary

Imagine:

```text
Inventory = 5
```

Cashier A adds:

```text
Quantity = 5
```

Cashier B sells:

```text
Quantity = 3
```

before A checks out.

A's cart may still display:

```text
5 available
```

But the database is now:

```text
2 available
```

Therefore the checkout operation must revalidate.

---

# 18.11 Concurrency Protection

This is one of the most important database rules.

We need an atomic inventory operation equivalent to:

```text
UPDATE inventory
SET quantity = quantity - requested_quantity
WHERE
    product_variant_id = ?
    AND branch_id = ?
    AND quantity >= requested_quantity;
```

Then we check how many rows were affected.

If:

```text
1 row updated
```

the inventory deduction succeeded.

If:

```text
0 rows updated
```

the transaction cannot proceed.

This prevents overselling.

---

# 18.12 Example

Inventory:

```text
5
```

Two cashiers simultaneously attempt to sell 3.

The database effectively processes:

```text
Cashier A → 5 >= 3 → succeeds → 2
Cashier B → 2 >= 3 → fails
```

The second cashier receives an inventory conflict rather than creating an invalid sale.

---

# 18.13 Transaction Atomicity

The sale should be treated as one database transaction.

Conceptually:

```text
BEGIN

1. Validate user
2. Validate permissions
3. Validate branch
4. Validate product
5. Validate price
6. Validate discount
7. Validate inventory
8. Create sale
9. Create sale items
10. Deduct inventory
11. Record payment
12. Update customer account
13. Create audit entry

COMMIT
```

If something critical fails:

```text
ROLLBACK
```

---

# 18.14 What Must Never Happen

We must prevent situations like:

```text
Sale created
↓
Payment recorded
↓
Inventory deduction fails
```

leaving us with:

```text
Sale exists
Payment exists
Inventory doesn't reflect sale
```

Atomic database transactions are therefore essential.

---

# 18.15 Idempotency

Another critical protection.

Imagine the cashier clicks:

**Complete Sale**

and the network briefly freezes.

They click it again.

Without protection:

```text
Click 1 → Sale #1001
Click 2 → Sale #1002
```

The customer gets charged twice or inventory is deducted twice.

We need an idempotency mechanism.

---

# 18.16 Client Transaction ID

When checkout begins, the client generates a unique transaction/request identifier.

Example:

```text
checkout_request_id
```

The database should enforce uniqueness.

If the same request arrives twice:

```text
Request A → process
Request A → return existing result
```

instead of creating another sale.

This is especially important for a POS.

---

# 18.17 Payment Methods

Your initial payment methods are:

```text
Cash
Card
Bank Transfer
Store Credit
```

One can be configured as the default payment method for faster checkout.

---

# 18.18 Payment Method Architecture

Payment methods should be represented as data rather than hard-coded UI assumptions.

For example:

```text
payment_method
├── CASH
├── CARD
├── BANK_TRANSFER
└── STORE_CREDIT
```

This makes future payment methods easier to introduce.

---

# 18.19 Cash Payment

For cash:

```text
Total = ₦12,500
Customer gives = ₦15,000
```

The system calculates:

```text
Change = ₦2,500
```

The cashier should see the change before completing the transaction.

---

# 18.20 Card Payment

The system should record:

```text
Payment method = CARD
Amount = ₦12,500
Status = COMPLETED
```

Because you haven't selected an integrated card processor for customer POS payments, this is initially a **manual payment recording mechanism**.

The system records that the cashier received card payment; it does not process the card itself.

---

# 18.21 Bank Transfer

Similarly:

```text
Payment method = BANK_TRANSFER
```

records that the customer paid via bank transfer.

The POS should not assume that selecting "Transfer" automatically verifies the bank transaction.

That would require an appropriate payment/bank integration.

---

# 18.22 Store Credit

Store credit is different.

If:

```text
Customer credit balance = ₦20,000
Sale = ₦7,000
```

then:

```text
Remaining credit = ₦13,000
```

The transaction must simultaneously:

1. create the sale
2. record store-credit payment
3. reduce the customer's credit balance

All atomically.

---

# 18.23 Store Credit Cannot Be Anonymous

As you specified, store credit is tied to an established customer.

Therefore:

```text
Payment method = STORE_CREDIT
```

requires:

```text
customer_id != NULL
```

and sufficient credit balance.

---

# 18.24 Layaway

Layaway is another special transaction type.

You selected:

* Customer record
* Outstanding balance
* Payment history
* Multiple installment payments

Therefore a layaway should have its own lifecycle.

```text
Layaway Created
      ↓
Deposit / Initial Payment
      ↓
Outstanding Balance
      ↓
Installment
      ↓
Installment
      ↓
Fully Paid
```

---

# 18.25 Layaway vs Normal Sale

A normal sale:

```text
Sale → Paid → Complete
```

A layaway:

```text
Layaway
 ↓
Partially Paid
 ↓
Outstanding Balance
 ↓
Fully Paid
 ↓
Complete
```

The accounting model must therefore distinguish them.

---

# 18.26 Layaway Payment History

Each payment should be independently recorded.

For example:

```text
Layaway #102

₦20,000 — Initial payment
₦10,000 — 12 Aug
₦15,000 — 19 Aug
```

Remaining:

```text
₦55,000
```

This history must not be overwritten.

---

# 18.27 Discounts

You selected:

* Percentage discount
* Fixed discount

The system should support both.

Example:

```text
Product subtotal = ₦50,000

10% discount
= ₦5,000

Final before tax
= ₦45,000
```

Or:

```text
₦5,000 fixed discount
```

---

# 18.28 Who Can Discount?

You selected:

> Yes

with permissions controlling access.

Therefore discount capability should be permission-based.

Example:

```text
sales.discount.apply
```

A cashier without this permission cannot apply a discount.

A manager with it can.

---

# 18.29 Discount Authorization

For stronger control, we can eventually support:

```text
discount permission
+
maximum discount limit
```

For example:

```text
Cashier → maximum 5%
Manager → maximum 20%
Owner → unlimited
```

This is more appropriate than simply having:

```text
can_discount = true
```

because granular permissions were one of your requirements.

---

# 18.30 Tax

You selected:

> Tax/service charge configurable by the business.

The system should therefore calculate:

```text
Subtotal
− Discount
= Taxable Amount

Tax
+
Service Charge
= Final Amount
```

The exact ordering needs to be configurable according to the business's tax rules.

We should avoid hard-coding assumptions about taxation into the core POS.

---

# 18.31 Service Charge

Service charge is available across all business types.

But:

```text
enabled = false
```

by default unless configured.

It can be configured as:

```text
percentage
```

or

```text
fixed amount
```

depending on the configuration decision already established.

---

# 18.32 Calculation Engine

We should create a dedicated calculation layer.

Something conceptually like:

```text
calculateSaleTotals()
```

which receives:

```text
items
discount
tax configuration
service charge configuration
```

and returns:

```text
subtotal
discount
tax
service_charge
total
```

This logic should not be scattered throughout React components.

---

# 18.33 Rounding

Currency calculations should never depend on JavaScript floating-point arithmetic in an unsafe manner.

Instead, monetary values should be represented using a precise strategy, preferably integer minor units where practical.

For Nigerian Naira:

```text
₦10,500
```

could be represented internally as:

```text
1050000 kobo
```

where appropriate.

The exact monetary representation will be locked during the database schema stage.

---

# 18.34 Sale Number

Every completed sale should have a human-readable transaction number.

Example:

```text
SALE-20260821-000123
```

The internal database ID can remain a UUID.

Therefore:

```text
id = UUID
receipt_number = SALE-20260821-000123
```

---

# 18.35 Sale Status

A sale should have explicit states.

For example:

```text
COMPLETED
REFUNDED
PARTIALLY_REFUNDED
VOIDED
```

We should avoid deleting completed sales.

---

# 18.36 Refunds

You selected:

> Refunds YES

and:

> Refunds require authorization.

Therefore:

```text
Cashier
 ↓
Request refund
 ↓
Authorization required
 ↓
Authorized user
 ↓
Refund processed
```

The original sale remains untouched.

---

# 18.37 Refund Inventory

For a physical product, a refund may result in inventory being returned.

Example:

```text
Original:
Stock -1

Refund:
Stock +1
```

The inventory movement should be recorded as a separate movement.

---

# 18.38 Refund Payment

The refund method should be tracked.

For example:

```text
Original payment:
Cash ₦20,000

Refund:
Cash ₦20,000
```

The system should record exactly what happened rather than simply modifying the original payment.

---

# 18.39 Hold/Suspend Sale

You selected:

> Hold/suspend sale.

This is different from completing a sale.

```text
Active Cart
    ↓
Suspend
    ↓
Suspended Sale
```

The suspended sale can later be resumed.

---

# 18.40 Suspended Sales

A suspended sale should store:

```text
items
quantities
customer
notes
cashier
branch
terminal/session
created_at
```

However, inventory should **not normally be deducted** merely because a sale is suspended.

Otherwise a cashier could hold items indefinitely and artificially remove them from available inventory.

---

# 18.41 Resume

When resumed:

```text
Suspended Sale
 ↓
Load Cart
 ↓
Revalidate current prices
 ↓
Revalidate inventory
 ↓
Checkout
```

This is important because prices or stock may have changed while the sale was suspended.

---

# 18.42 Receipts

A completed sale produces a receipt representation.

The receipt should contain:

```text
Business name
Logo
Branch
Address/contact information
Transaction number
Date/time
Cashier
Items
Quantity
Prices
Discount
Tax
Service charge
Total
Payment method
Change
Customer (if applicable)
```

---

# 18.43 Receipt Templates

You selected:

> Multiple receipt templates, Admin-only configuration.

Therefore:

```text
Receipt Template
      ↓
Business configuration
      ↓
POS uses selected template
```

The POS shouldn't allow a cashier to change the template.

---

# 18.44 Digital Receipt

Digital receipt does **not** necessarily mean email/SMS/WhatsApp.

It can mean:

```text
Receipt generated digitally
```

and made available through the POS/application.

This keeps it consistent with your decision not to implement email/SMS/WhatsApp receipts.

---

# 18.45 Audit Trail

Every significant transaction should create an audit event.

For example:

```text
SALE_CREATED
PAYMENT_RECORDED
DISCOUNT_APPLIED
REFUND_CREATED
INVENTORY_DEDUCTED
STORE_CREDIT_USED
LAYAWAY_PAYMENT
```

Audit records should include:

```text
actor
action
timestamp
business/branch scope
target entity
target ID
metadata
```

---

# 18.46 Audit Immutability

Audit logs should be append-only.

No normal user should be able to:

```text
UPDATE audit_log
DELETE audit_log
```

Even administrators should not be able to silently rewrite history.

---

# 18.47 Transaction Security

At minimum, every transaction should validate:

```text
Authenticated user
        ↓
User active?
        ↓
Subscription active?
        ↓
Correct business?
        ↓
Correct branch?
        ↓
Permission?
        ↓
Valid product?
        ↓
Valid price?
        ↓
Valid discount?
        ↓
Valid inventory?
```

Only then:

```text
CREATE TRANSACTION
```

---

# 18.48 Subscription Lock

You previously specified:

> When subscription expires, completely lock the application.

Therefore normal transaction processing must include subscription status.

```text
Subscription ACTIVE
      ↓
Transaction allowed
```

versus:

```text
Subscription EXPIRED
      ↓
Transaction rejected
```

The Super Admin remains exempt.

---

# 18.49 What Happens During Expiration?

When expired:

```text
Normal user
 ↓
Cannot log in
```

Existing sessions:

```text
Authenticated session
 ↓
Subscription check
 ↓
Expired
 ↓
Force logout
```

The server must enforce this.

A frontend-only lock would be insecure.

---

# 18.50 Offline Is Completely Removed

Your latest decision is now fully reflected:

> **There is no offline POS capability.**

Therefore:

```text
No offline sales
No offline inventory
No sync engine
No conflict-resolution engine
No local transaction queue
No offline receipt transaction mode
```

This dramatically simplifies the transaction architecture and removes a major source of concurrency complexity.

---

# 18.51 Network Failure

Because offline transactions aren't supported:

```text
Internet unavailable
       ↓
POS cannot complete transaction
```

The UI should clearly communicate:

> "Connection lost. Transaction cannot be completed."

But importantly:

**the system must never pretend that an offline transaction succeeded.**

---

# 18.52 Duplicate Submission Protection Still Matters

Even without offline mode, network instability can still cause:

```text
Request sent
 ↓
Server processes
 ↓
Response lost
 ↓
Client retries
```

Therefore idempotency remains mandatory.

---

# 18.53 Transaction Engine — Final Model

The complete architecture becomes:

```text
                  CASHIER
                     │
                     ↓
                  POS UI
                     │
                     ↓
              Checkout Request
                     │
                     ↓
             Authentication
                     │
                     ↓
             Authorization/RBAC
                     │
                     ↓
          Subscription Validation
                     │
                     ↓
             Business/Branch Scope
                     │
                     ↓
              Product Validation
                     │
                     ↓
               Price Resolution
                     │
                     ↓
              Discount Validation
                     │
                     ↓
               Tax Calculation
                     │
                     ↓
          Service Charge Calculation
                     │
                     ↓
            Inventory Concurrency
                     │
                     ↓
              DATABASE TRANSACTION
                     │
          ┌──────────┼──────────┐
          ↓          ↓          ↓
        Sale      Payment    Inventory
          │          │          │
          └──────────┼──────────┘
                     ↓
                Audit Event
                     ↓
                  Receipt
                     ↓
               Transaction
                Complete
```

---

# 18.54 Stage 18 Decisions Now Locked

| Area                            | Decision                        |
| ------------------------------- | ------------------------------- |
| Offline POS                     | **Removed completely**          |
| Transaction authority           | Server/database                 |
| Inventory concurrency           | Atomic database validation      |
| Transaction atomicity           | Database transaction            |
| Idempotency                     | Required                        |
| Product pricing                 | Branch-level                    |
| Price history                   | Snapshot at sale                |
| Discounts                       | Fixed + percentage              |
| Discount access                 | Permission controlled           |
| Tax                             | Configurable                    |
| Service charge                  | Configurable                    |
| Payment                         | Cash/Card/Transfer/Store Credit |
| Store credit                    | Customer-linked                 |
| Layaway                         | Multi-payment                   |
| Suspended sales                 | Yes                             |
| Returns                         | Yes                             |
| Refunds                         | Yes + authorization             |
| Exchanges                       | No                              |
| Receipts                        | Yes                             |
| Receipt templates               | Admin configurable              |
| Digital receipts                | Yes                             |
| Transaction deletion            | No                              |
| Transaction mutation            | No; use reversal/refund         |
| Audit                           | Append-only                     |
| Concurrency checks              | Yes                             |
| Customer POS payment processing | No external processor           |
| Paystack                        | Subscription only               |

---