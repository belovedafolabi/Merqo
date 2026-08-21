# Stage 26 — Payments, Financials & Payment Reconciliation

There is one important correction before we define this stage:

You previously answered **NO to the entire Cash Register feature set**:

* Cash registers
* Register opening
* Cash drawer
* Cashier shifts
* Shift closing
* Expected cash
* Actual cash
* Variance
* End-of-day reconciliation
* Register-specific reports

So **we should not build a traditional cash-register/shift-management subsystem**.

Instead, this stage defines the **financial layer around transactions and payment methods**.

The distinction is:

> **The POS records what was sold and how it was paid. It does not attempt to operate a physical cash drawer/register management system.**

---

# 26.1 Financial Architecture

The financial model should be:

```text
POS Sale
   │
   ├── Cash
   ├── Card
   ├── Bank Transfer
   └── Store Credit
          │
          ▼
     Payment Record
          │
          ▼
   Financial Records
          │
          ├── Reports
          ├── Accounting
          ├── Refunds
          ├── Store Credit
          └── Analytics
```

The POS is therefore the **source of truth for sales and payment records**.

---

# 26.2 Important Payment Boundary

There are two completely different types of payments in the platform.

### A. Customer POS payments

These are payments made by the client's customers for goods/services.

Examples:

```text
Customer
   ↓
₦50,000 purchase
   ↓
Cash / Card / Transfer / Store Credit
```

These remain **outside Paystack**.

The system merely records the payment method and transaction.

---

### B. Software subscription payments

These are payments made by the client/business to you for using the POS.

```text
Business Owner
      ↓
Subscription renewal
      ↓
Paystack
      ↓
Your platform
```

**Paystack is only used for this second category.**

---

# 26.3 Supported Customer Payment Methods

The initial system supports:

1. Cash
2. Card
3. Bank Transfer
4. Store Credit

No:

* Mobile payment
* Split payment
* Partial payment for ordinary sales

---

# 26.4 Payment Method Configuration

Businesses should be able to configure which payment methods are available.

For example:

```text
Payment Methods

☑ Cash
☑ Card
☑ Bank Transfer
☑ Store Credit
```

The Owner can enable/disable supported methods where appropriate.

---

# 26.5 Default Payment Method

You previously specified that one payment method should be selectable as the default to make checkout faster.

Example:

```text
Default:
Cash
```

The POS can therefore open checkout with:

```text
Cash
```

already selected.

The cashier can change it when necessary.

---

# 26.6 Payment Method Is Not Payment Provider

This distinction is important.

A payment method is:

```text
Card
```

A payment provider is:

```text
Paystack
```

For customer transactions, the system is **not processing the payment through Paystack**.

It is recording:

```text
Payment method = Card
```

The actual card processor/terminal can be external.

---

# 26.7 Cash Payments

For cash sales, the system records:

```text
Payment method:
CASH

Amount:
₦25,000

Transaction:
TXN-000123

Employee:
Jane

Branch:
Wuse

Business Unit:
Supermarket
```

The system does **not** maintain a cash drawer balance.

---

# 26.8 Card Payments

For card transactions:

```text
Payment method:
CARD

Amount:
₦25,000
```

The POS records the transaction as paid by card.

It does not attempt to process the card itself.

The external terminal/provider handles the actual payment.

---

# 26.9 Bank Transfer

For bank transfers:

```text
Payment method:
BANK_TRANSFER
```

The cashier confirms the transfer externally and records the payment through the POS.

Depending on the final workflow, the system can optionally require a reference.

Example:

```text
Transfer reference:
TRF-829381
```

This is useful for reconciliation.

---

# 26.10 Store Credit

Store credit is different because the platform **does maintain the customer's credit balance**.

Example:

```text
Customer:
John Doe

Store Credit:
₦50,000
```

Customer purchases:

```text
₦15,000
```

using store credit.

New balance:

```text
₦35,000
```

---

# 26.11 Store Credit Ledger

Store credit should not simply be represented as:

```text
customer.store_credit = 35000
```

Instead, maintain a ledger.

Example:

```text
Store Credit Ledger

+ ₦50,000  Credit issued
- ₦15,000  Purchase
+ ₦10,000  Credit adjustment

Current balance:
₦45,000
```

This gives us traceability.

---

# 26.12 Store Credit Issuance

Store credit should require an appropriate permission.

For example:

```text
customers.store_credit.issue
```

This prevents every cashier from arbitrarily creating unlimited credit.

---

# 26.13 Store Credit Adjustment

Adjustments should also be permission controlled.

```text
customers.store_credit.adjust
```

And every adjustment should be audited.

Example:

> Manager increased John Doe's store credit by ₦5,000.

---

# 26.14 Store Credit Cannot Become Negative

Unless we explicitly introduce overdraft functionality later:

```text
available_credit >= purchase_amount
```

must be enforced.

A ₦10,000 purchase cannot consume ₦7,000 of available credit.

---

# 26.15 Store Credit and Refunds

Your refund system needs to account for store credit.

If a customer originally paid using store credit and receives a refund:

```text
Purchase:
₦20,000

Refund:
₦20,000

Store credit:
+₦20,000
```

The refund restores the appropriate credit balance.

The exact refund destination rules for mixed/complex scenarios will be defined with the transaction/refund engine.

---

# 26.16 Layaway / Installments

You selected the following workflow:

1. Record customer
2. Record outstanding balance
3. Record payment history
4. Allow multiple installment payments

Therefore, layaway is essentially a **customer-linked receivable**.

Example:

```text
Product:
₦120,000

Initial payment:
₦40,000

Outstanding:
₦80,000
```

Then:

```text
Payment 2:
₦30,000

Outstanding:
₦50,000
```

Then:

```text
Payment 3:
₦50,000

Outstanding:
₦0
```

---

# 26.17 Layaway Customer Requirement

A layaway transaction **must be linked to an existing customer**.

The system should not permit anonymous layaway.

This gives us:

```text
Customer
   ↓
Layaway
   ↓
Payment history
   ↓
Outstanding balance
```

---

# 26.18 Layaway Status

A layaway should have states such as:

```text
ACTIVE
COMPLETED
CANCELLED
DEFAULTED
```

We can keep the initial implementation simple.

---

# 26.19 Layaway Payment History

Every installment is a separate financial event.

Example:

```text
Layaway #LAY-001

₦50,000 — 20 Aug
₦30,000 — 25 Aug
₦40,000 — 02 Sep

Total:
₦120,000

Paid:
₦120,000

Outstanding:
₦0
```

---

# 26.20 Layaway Does Not Mean Partial Payment

There is an important distinction.

You said:

> **Partial payments: NO**

but:

> **Layaway/installments: YES**

This is completely valid.

### Ordinary sale

```text
Total = ₦50,000
Payment = ₦50,000
```

must be fully paid.

### Layaway

```text
Total = ₦50,000

Payment 1 = ₦10,000
Payment 2 = ₦20,000
Payment 3 = ₦20,000
```

is allowed because it is a dedicated layaway workflow.

---

# 26.21 Financial Transaction States

Payment records should support states such as:

```text
PENDING
COMPLETED
FAILED
CANCELLED
REFUNDED
PARTIALLY_REFUNDED
```

However, because ordinary customer payments are manually recorded rather than processed by the platform, `FAILED` will primarily apply to future/integrated payment workflows rather than cash/card recording.

---

# 26.22 Payment Immutability

You previously established:

> **Transactional data is immutable.**

Therefore, a completed payment should never simply be edited.

Bad:

```text
Payment:
₦50,000
↓
Edit
₦40,000
```

Instead:

```text
₦50,000 payment
       ↓
Adjustment / refund / reversal
       ↓
New financial event
```

This preserves the history.

---

# 26.23 Financial Ledger Principle

We should treat financial records as an event/ledger system rather than constantly overwriting balances.

Conceptually:

```text
Transaction
     │
     ├── Payment event
     ├── Refund event
     ├── Credit event
     └── Adjustment event
```

Then balances can be derived from those events.

This is much safer for auditability.

---

# 26.24 Financial Records and Business Scope

Every financial event should retain its organizational context:

```text
business_id
branch_id
business_unit_id
```

where applicable.

Example:

```text
₦100,000 Sale

Business:
Ade Supermarket Ltd

Branch:
Wuse

Business Unit:
Pharmacy
```

This allows accurate reporting.

---

# 26.25 Financial Reporting

The financial reporting layer should support:

### Sales

* Gross sales
* Discounts
* Tax
* Service charges
* Net sales

### Payments

* Cash
* Card
* Transfer
* Store credit

### Refunds

* Refund amount
* Refund count
* Refund method
* Refund reason

### Credit

* Credit issued
* Credit consumed
* Credit outstanding

### Layaway

* Total layaway value
* Amount collected
* Outstanding balance
* Completed layaways
* Active layaways

---

# 26.26 Payment Method Reports

The Owner should be able to answer:

> "How much did we receive through each payment method?"

Example:

```text
Today

Cash              ₦350,000
Card              ₦520,000
Bank Transfer     ₦180,000
Store Credit       ₦50,000
───────────────────────────
Total             ₦1,100,000
```

This should also be filterable by branch/business unit.

---

# 26.27 No Cash Drawer Accounting

Because you explicitly rejected cash-register functionality, the system should **not attempt to calculate**:

```text
Expected drawer cash
Actual drawer cash
Cash variance
```

Those belong to a dedicated cash-register management system, which isn't part of this product scope.

---

# 26.28 No Cashier Shift Accounting

Likewise, we won't create:

```text
Shift opened
Shift closed
Cashier shift balance
```

The employee is still recorded against every transaction, so reports can show:

> "How much did Jane sell?"

without requiring a formal cashier shift.

---

# 26.29 Employee Financial Reports

Even without cashier shifts, authorized users can see:

```text
Jane Doe

Sales:
₦450,000

Refunds:
₦20,000

Discounts:
₦15,000
```

This is employee-level reporting, not cash-register management.

---

# 26.30 Tax

You selected:

> Tax = YES

and:

> Admin-defined configuration.

Therefore, the system should support a configured tax rate.

Example:

```text
Tax rate:
7.5%
```

At checkout:

```text
Subtotal       ₦100,000
Tax 7.5%         ₦7,500
──────────────────────
Total          ₦107,500
```

---

# 26.31 Tax Configuration

Tax configuration should be controlled by authorized administrators.

At minimum:

```text
Tax enabled:
YES / NO

Tax name:
VAT

Tax rate:
7.5%
```

---

# 26.32 Multiple Tax Rates

You explicitly rejected:

> Multiple tax rates.

Therefore the MVP should use a **single active tax configuration** per applicable configuration scope.

We should not introduce tax-rule complexity unnecessarily.

---

# 26.33 Service Charge

You selected:

> Service charge should be available to all business types and configurable by the admin.

Therefore:

```text
Service charge:
Enabled / Disabled

Rate:
X%
```

Example:

```text
Subtotal       ₦100,000
Tax             ₦7,500
Service charge ₦10,000
──────────────────────
Total          ₦117,500
```

---

# 26.34 Tax and Service Charge Configuration

Because you selected the configurable option, these can be configured according to the appropriate organizational scope.

The configuration hierarchy established earlier can apply:

```text
Business
   ↓
Branch
   ↓
Business Unit
```

with only supported settings being overridable at each level.

---

# 26.35 Discount Financial Treatment

Discounts should be represented explicitly.

Example:

```text
Product total: ₦100,000
Discount:       ₦10,000
Taxable amount: ₦90,000
```

The system should retain:

* Original amount
* Discount amount
* Discount type
* Discount percentage/fixed amount
* User who applied it
* Authorization where required

---

# 26.36 Financial Calculation Principle

All monetary calculations should use **decimal-safe integer minor units**, rather than JavaScript floating-point arithmetic.

For NGN:

```text
₦10,500
```

should internally be represented in a way that avoids:

```text
0.1 + 0.2 = 0.30000000000000004
```

The exact database representation will be defined in the data-model stage.

---

# 26.37 Currency

The initial deployment should support the business's configured currency.

For the primary Nigerian deployment:

```text
NGN
```

But the architecture should avoid hardcoding ₦ throughout the system.

This leaves room for future deployments in other currencies.

---

# 26.38 Financial Auditability

Every financial event should answer:

```text
Who?
What?
When?
Where?
Why?
How much?
```

Example:

```text
Refund

Amount:
₦50,000

Transaction:
TXN-00123

Employee:
Jane Doe

Branch:
Wuse

Business Unit:
Supermarket

Authorized by:
John Doe

Timestamp:
...
```

---

# 26.39 Financial Security

Financial operations should have appropriate granular permissions.

For example:

```text
sales.create
sales.discount
sales.refund

store_credit.issue
store_credit.adjust

layaway.create
layaway.payment

financial_reports.view
```

This means a normal cashier does not automatically gain financial administration capabilities.

---

# 26.40 Subscription Financials Are Separate

The subscription system remains completely separate from the POS financial ledger.

```text
                  PLATFORM
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
   POS Financials        Subscription Billing
          │                     │
   Customer payments         Paystack
```

This separation is important.

A client's customer paying ₦100,000 for goods should **never** be confused with the business paying you ₦X for their software subscription.

---

# 26.41 Payment Architecture

The conceptual architecture becomes:

```text
                    PAYMENT SYSTEM
                         │
             ┌───────────┴───────────┐
             │                       │
       CUSTOMER PAYMENTS       SUBSCRIPTION
             │                       │
       ┌─────┼─────┐              Paystack
       │     │     │
      Cash  Card  Transfer
       │
   Store Credit
```

---

# 26.42 What This Stage Does NOT Include

To keep the system lean and within your low-cost requirement, this stage explicitly excludes:

❌ Payment gateway processing for customer sales
❌ Customer card processing
❌ Mobile payment integration
❌ Split payments
❌ Ordinary partial payments
❌ Cash registers
❌ Cash drawers
❌ Cashier shifts
❌ Expected/actual cash reconciliation
❌ Supplier payments
❌ Procurement accounting
❌ Complex accounting integrations

The system instead provides **in-app financial records and reporting**.

---

# 26.43 Stage 26 — Locked Decisions

| Capability                             | Decision |
| -------------------------------------- | -------- |
| Cash                                   | ✅        |
| Card                                   | ✅        |
| Bank transfer                          | ✅        |
| Store credit                           | ✅        |
| Mobile payments                        | ❌        |
| Split payments                         | ❌        |
| Ordinary partial payments              | ❌        |
| Layaway/installments                   | ✅        |
| Customer-linked layaway                | ✅        |
| Payment history                        | ✅        |
| Tax                                    | ✅        |
| Admin-defined tax                      | ✅        |
| Multiple tax rates                     | ❌        |
| Service charge                         | ✅        |
| Admin-configurable service charge      | ✅        |
| Financial ledger                       | ✅        |
| Immutable financial events             | ✅        |
| Payment-method reporting               | ✅        |
| Employee sales reporting               | ✅        |
| Cash registers                         | ❌        |
| Cash drawers                           | ❌        |
| Cashier shifts                         | ❌        |
| Cash reconciliation                    | ❌        |
| Customer POS payments through Paystack | ❌        |
| Subscription payments through Paystack | ✅        |
| In-app accounting                      | ✅        |