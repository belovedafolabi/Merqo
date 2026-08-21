# Stage 5 — Financial Architecture, Accounting & Reconciliation

This stage defines how the POS handles **money after a transaction occurs**.

The key architectural decision is that the POS should not merely store:

> "Sale = ₦50,000"

It should be able to explain **where that ₦50,000 came from, how it was paid, what happened to inventory, what was refunded, what tax/service charge applied, and how the figures appear in reports.**

We also need to keep this sufficiently simple so we don't accidentally turn the POS into a full enterprise accounting system.

---

# 1. Financial Architecture Philosophy

I recommend a **lightweight double-entry-inspired financial ledger**, rather than attempting to build a complete accounting package.

The system needs enough accounting structure to reliably support:

* sales
* refunds
* taxes
* discounts
* service charges
* cash
* card
* bank transfer
* store credit
* layaway
* expenses
* inventory valuation
* cost of goods sold
* profit reporting
* reconciliation

But we do **not** need to build:

* payroll
* full general ledger management
* statutory tax filing
* accounts payable
* supplier accounting
* procurement accounting
* complex financial consolidation

This keeps the system aligned with your original scope.

---

# 2. The Financial Event Model

Every important financial event should create a financial record.

Conceptually:

```text
SALE
  ↓
Financial Event
  ↓
Ledger Entries
```

Other events:

```text
REFUND
EXPENSE
STORE CREDIT
LAYAWAY PAYMENT
TAX
SERVICE CHARGE
```

also generate financial events.

---

# 3. Why We Need a Ledger

Imagine the system has:

```text
Sales:
₦10,000,000
```

That number alone is not particularly useful.

The system should be able to answer:

> How much was cash?

```text
Cash:
₦4,000,000
```

> Card?

```text
Card:
₦3,500,000
```

> Bank transfer?

```text
Transfer:
₦2,500,000
```

And:

> How much was refunded?

```text
Refunds:
₦300,000
```

> How much did the business actually earn before expenses?

etc.

---

# 4. Financial Accounts

We should introduce a configurable chart of accounts internally.

But keep the initial version simple.

Core accounts:

### Assets

```text
Cash
Bank/Card Receivables
Store Credit Receivable
Inventory
```

### Revenue

```text
Sales Revenue
```

### Contra-Revenue

```text
Discounts
Refunds
```

### Expenses

```text
Operating Expenses
```

### Liabilities

```text
Customer Store Credit
Tax Payable
Service Charge Payable
```

### Cost

```text
Cost of Goods Sold
```

---

# 5. Business-Specific Accounts

Businesses should be able to create additional accounts where necessary.

For example:

```text
Transport Expense
Electricity
Rent
Internet
Marketing
Equipment
Maintenance
```

But the system should provide sensible defaults.

The Owner/Admin should not be forced to understand accounting terminology before using the POS.

---

# 6. Financial Ledger

A ledger entry could conceptually look like:

```text
Transaction:
POS-20260821-00184

Account:
Cash

Debit:
₦27,090

Credit:
₦0
```

and corresponding entries:

```text
Sales Revenue
Credit:
₦25,000

Tax Payable
Credit:
₦1,500

Service Charge
Credit:
₦590
```

The exact calculations will be generated automatically.

---

# 7. Double-Entry Principle

The fundamental invariant is:

```text
Total Debits = Total Credits
```

For every financial event.

This gives us a powerful integrity check.

If:

```text
Debit:
₦27,090

Credit:
₦26,090
```

the transaction should not be committed.

---

# 8. Do Not Let Users Manually Edit Ledger Entries

Financial ledger entries should be immutable.

Just like sales.

If something is wrong:

```text
Incorrect Entry
      ↓
Correction Event
      ↓
New Ledger Entries
```

not:

```text
UPDATE old ledger entry
```

This preserves financial history.

---

# 9. Sale Accounting

Suppose:

```text
Product:
₦10,000

Tax:
₦750

Total:
₦10,750
```

Customer pays cash.

The accounting engine conceptually records:

```text
Debit:
Cash ₦10,750

Credit:
Sales Revenue ₦10,000

Credit:
Tax Payable ₦750
```

The customer does not need to know anything about this.

The system handles it automatically.

---

# 10. Inventory and COGS

When a product is sold, there are actually **two financial events**.

### Revenue side

```text
Cash
   ↓
Sales Revenue
```

### Inventory side

```text
Inventory
   ↓
Cost of Goods Sold
```

Suppose:

```text
Selling price = ₦10,000
Cost = ₦6,000
```

Then:

```text
Revenue = ₦10,000
COGS = ₦6,000
Gross Profit = ₦4,000
```

This allows the analytics system to calculate actual gross margin.

---

# 11. Inventory Costing Model

You selected support for different inventory models.

We therefore need to decide how inventory cost is calculated.

For the first version, I recommend:

> **Weighted Average Cost** as the default inventory valuation method.

Why?

Because it is considerably simpler than implementing full FIFO/LIFO logic while still producing useful gross-profit reporting.

---

# 12. Weighted Average Example

Suppose:

```text
10 units @ ₦1,000
```

Inventory value:

```text
₦10,000
```

Then another:

```text
10 units @ ₦1,200
```

Total:

```text
20 units
₦22,000
```

Average cost:

```text
₦1,100
```

A subsequent sale uses:

```text
COGS = ₦1,100 × quantity sold
```

This is simple and database-friendly.

---

# 13. Why Not Build FIFO Initially?

FIFO is useful, particularly for:

* pharmacies
* food businesses
* products with expiry dates

But implementing complete FIFO inventory accounting adds significant complexity.

We can architect the inventory movement system so that FIFO can be introduced later without rebuilding the entire POS.

---

# 14. Cash Management

You originally rejected the traditional:

* cash registers
* register opening
* cash drawer
* cashier shifts
* shift closing
* expected cash
* actual cash
* variance
* end-of-day reconciliation

However, there is an important distinction.

You rejected them as a **formal cash-register subsystem**, but we still need basic cash accountability if cash payments are supported.

Therefore I recommend a **simplified cash management model**, not a full register system.

---

# 15. Simple Cash Session

A cashier can have a cash session:

```text
Cash Session
├── Started At
├── Started By
├── Opening Cash
├── Cash Sales
├── Cash Refunds
├── Cash Adjustments
└── Closing Cash
```

This can be optional depending on business configuration.

---

# 16. Why We Need This

Without some form of cash accountability, the system cannot answer:

> "How much cash should be physically present?"

For example:

```text
Opening:
₦50,000

Cash sales:
₦200,000

Cash refunds:
-₦20,000

Expected:
₦230,000
```

The cashier counts:

```text
Actual:
₦225,000
```

Variance:

```text
-₦5,000
```

---

# 17. Cash Variance

The system should calculate:

```text
Variance =
Actual Cash - Expected Cash
```

Examples:

```text
+₦2,000
```

means overage.

```text
-₦2,000
```

means shortage.

---

# 18. Variance Authorization

A cashier should not simply edit the variance.

Instead:

```text
Cashier closes session
        ↓
System calculates variance
        ↓
Cashier submits
        ↓
Manager reviews
```

if the business requires approval.

This ties directly into your granular RBAC.

---

# 19. Cash Adjustments

Sometimes the business legitimately adds/removes cash.

Examples:

```text
Petty cash
Cash added to drawer
Cash removed
Change replenishment
```

These should be explicit adjustment records.

Never simply alter the expected cash number.

---

# 20. Card Payments

The POS records card transactions.

However, because the actual card terminal is external:

```text
Card Terminal
      ↓
Bank/Payment Processor
      ↓
Business
```

the POS should treat the payment as an operational record.

It should support reconciliation against external terminal totals.

---

# 21. Bank Transfer Payments

Same principle.

The POS records:

```text
Transfer Sale:
₦50,000
```

But the actual banking system remains external.

Therefore:

> The POS is a **sales and financial recording system**, not the business's bank.

---

# 22. Payment Reconciliation

The system should provide a reconciliation screen.

For example:

```text
DATE: Aug 21

Cash
POS Total:       ₦500,000
Counted Cash:    ₦498,000
Variance:        -₦2,000

Card
POS Total:       ₦750,000
Terminal Total:  ₦750,000
Variance:        ₦0

Transfer
POS Total:       ₦400,000
Bank Total:      ₦400,000
Variance:        ₦0
```

This is extremely useful for business owners.

---

# 23. Store Credit Accounting

Store credit is more complicated than a normal payment.

If the business gives a customer:

```text
₦10,000 store credit
```

the system records a customer balance.

When the customer uses:

```text
₦3,000
```

the balance becomes:

```text
₦7,000
```

The ledger records the movement.

---

# 24. Layaway Accounting

Layaway payments should be treated as customer payments against an outstanding obligation.

Example:

```text
Layaway:
₦100,000

Payment 1:
₦30,000

Payment 2:
₦20,000

Outstanding:
₦50,000
```

Every installment becomes its own immutable payment record.

---

# 25. Layaway Completion

When:

```text
Outstanding = ₦0
```

the system marks:

```text
Layaway:
COMPLETED
```

and records the completion event.

---

# 26. Expenses

Because you selected intermediate financial functionality, the POS should support basic business expenses.

Example:

```text
Expense
├── Category
├── Amount
├── Payment Method
├── Description
├── Date
├── Branch
├── Business Unit
├── Created By
└── Approval Status
```

Examples:

```text
Electricity
₦50,000

Transportation
₦15,000

Maintenance
₦30,000
```

---

# 27. Expense Permissions

Expenses should be permission-controlled.

Example:

```text
expense.create
expense.approve
expense.delete
expense.view
```

A cashier should not automatically have the ability to create a ₦500,000 expense.

---

# 28. Expense Approval

For larger businesses, we should allow optional approval thresholds.

Example:

```text
≤ ₦50,000
→ Manager

> ₦50,000
→ Owner
```

This can be configuration rather than hard-coded behavior.

---

# 29. Taxes

Tax collected from customers is not automatically business revenue.

Example:

```text
Sale:
₦10,000

VAT:
₦750
```

The financial system should treat:

```text
₦10,000 → Revenue
₦750 → Tax Payable
```

This distinction is important for reporting.

---

# 30. Service Charge

Service charge should similarly be separated from normal product revenue where configured.

Example:

```text
Sale:
₦20,000

Service Charge:
₦2,000
```

The system can classify:

```text
Sales:
₦20,000

Service Charge:
₦2,000
```

The business can configure whether the service charge is:

* revenue
* payable/distributable
* taxable

This configuration should be explicit.

---

# 31. Discounts

Discounts reduce the effective sales amount.

Example:

```text
Original:
₦20,000

Discount:
₦2,000

Net Sale:
₦18,000
```

Reports should retain:

```text
Gross Sales:
₦20,000

Discounts:
₦2,000

Net Sales:
₦18,000
```

This is much more useful than simply storing ₦18,000.

---

# 32. Refund Accounting

Suppose:

```text
Sale:
₦50,000
```

Later:

```text
Refund:
₦10,000
```

Reports should show:

```text
Gross Sales:
₦50,000

Refunds:
₦10,000

Net Sales:
₦40,000
```

The original sale remains untouched.

---

# 33. Gross Profit

The system should calculate:

```text
Gross Profit =
Net Sales - COGS
```

Example:

```text
Net Sales:
₦10,000,000

COGS:
₦6,000,000

Gross Profit:
₦4,000,000
```

---

# 34. Net Profit

We can provide an operational estimate:

```text
Net Profit =
Gross Profit - Operating Expenses
```

Example:

```text
Gross Profit:
₦4,000,000

Expenses:
₦1,500,000

Estimated Net Profit:
₦2,500,000
```

We should label this appropriately as the POS's calculated operational profit rather than pretending it replaces formal accounting/tax software.

---

# 35. Branch-Level Financials

Because you selected branch-specific inventory and branch-level pricing, financial data must also be attributable to branches.

Example:

```text
Business
│
├── Abuja Branch
│    └── Sales ₦5M
│
└── Lagos Branch
     └── Sales ₦3M
```

The owner can view:

```text
All Branches
```

or:

```text
Individual Branch
```

---

# 36. Business Unit Financials

Your business-unit architecture creates another important dimension.

Example:

```text
Branch A
│
├── Supermarket
│
└── Pharmacy
```

Each unit can have its own POS configuration.

Since you selected that a business unit **does not have its own inventory**, the inventory remains attached to the branch.

However, transactions must still record:

```text
Branch:
Branch A

Business Unit:
Pharmacy
```

This lets us report pharmacy sales separately without creating separate inventory pools.

---

# 37. Product Constraint

You explicitly corrected Q23 to:

> The same product cannot exist in multiple business units.

We retain this decision.

That means the system needs a clear product-to-business-unit relationship.

A product can belong to:

```text
Branch A → Supermarket
```

but not simultaneously:

```text
Branch A → Pharmacy
```

within the same client configuration.

This should be enforced by the database rather than only by the UI.

---

# 38. Stock Transfers

You changed the original decision to:

> YES — but keep it simple.

The transfer workflow should therefore be:

```text
Branch A
   ↓
Transfer Request
   ↓
Approve
   ↓
Dispatch
   ↓
Receive
   ↓
Branch B
```

But we should **not** build a complicated warehouse-management system.

---

# 39. Simple Stock Transfer

A transfer should contain:

```text
Transfer
├── Source Branch
├── Destination Branch
├── Product
├── Quantity
├── Requested By
├── Approved By
├── Status
└── Timestamps
```

Status:

```text
REQUESTED
APPROVED
IN_TRANSIT
RECEIVED
CANCELLED
```

---

# 40. Transfer Accounting

A stock transfer should **not** count as a sale.

It changes inventory location:

```text
Branch A:
-10

Branch B:
+10
```

No revenue should be generated.

---

# 41. Why Transfers Matter

Even though they add complexity, they become very useful for your target customers.

Example:

```text
Supermarket Branch A
has:
100 Coke

Branch B
has:
0 Coke
```

The owner can move:

```text
20 Coke
```

instead of creating a new stock adjustment.

---

# 42. Financial Periods

The system should eventually support reporting periods:

```text
Today
This Week
This Month
This Quarter
This Year
Custom
```

But we should avoid introducing a complicated manual accounting-period closing system initially.

Reports can dynamically calculate from immutable events.

---

# 43. Daily Summary

The dashboard should be able to produce:

```text
Today's Sales
₦850,000

Refunds
₦30,000

Discounts
₦20,000

Net Sales
₦800,000

COGS
₦500,000

Gross Profit
₦300,000

Expenses
₦70,000

Estimated Net Profit
₦230,000
```

---

# 44. Payment Breakdown

Another useful dashboard card:

```text
Cash       ₦300,000
Card       ₦320,000
Transfer   ₦180,000
Credit     ₦50,000
```

This should be filterable by:

* branch
* business unit
* date
* cashier
* payment method

subject to permissions.

---

# 45. Cashier Performance

The system should be able to show:

```text
Cashier
Sales
Transactions
Average Transaction
Discounts
Refunds
Cash Variance
```

But access must be controlled because this is employee-performance data.

---

# 46. Financial Data Permissions

Granular permissions should include concepts such as:

```text
financial.view
financial.view_all_branches
financial.view_profit
financial.view_expenses
financial.create_expense
financial.approve_expense
financial.reconcile
financial.export
```

This prevents a cashier from accidentally seeing the owner's financial information.

---

# 47. Export

Reports should eventually support:

```text
CSV
PDF
Excel-compatible spreadsheet
```

We can implement this without paid services.

The backend can generate exports using open-source libraries.

---

# 48. Currency

The system should support a business currency configuration.

Initial deployment can default to:

```text
NGN — Nigerian Naira
```

but the architecture should not hard-code NGN everywhere.

Currency belongs to the business configuration.

---

# 49. Financial Integrity Rules

These should become hard requirements in the PRD.

### Rule 1

Completed transactions cannot be edited.

### Rule 2

Financial ledger entries cannot be edited.

### Rule 3

Refunds cannot exceed refundable amounts.

### Rule 4

Inventory cannot become negative unless explicitly configured.

### Rule 5

Debit and credit totals must balance.

### Rule 6

Duplicate checkout requests must not create duplicate sales.

### Rule 7

Every financial event must have an actor/system source.

### Rule 8

Financial events must have timestamps.

### Rule 9

Branch and business-unit context must be preserved.

### Rule 10

Deleted products must not destroy historical transaction data.

---

# 50. Data Deletion

You previously selected the recommended approach for deletion.

For financial records:

**Never hard-delete transactional history.**

For master data such as products:

```text
ACTIVE
INACTIVE
ARCHIVED
```

rather than destructive deletion where historical records depend on the entity.

---

# 51. Database-Level Enforcement

This is especially important with Supabase/PostgreSQL.

Critical rules should not depend solely on:

```text
React
TypeScript
Frontend validation
```

They should be enforced through:

```text
PostgreSQL constraints
Transactions
Unique indexes
Foreign keys
Row Level Security
Database functions where appropriate
```

---

# 52. Supabase Architecture

The financial architecture fits very well into PostgreSQL.

Conceptually:

```text
Supabase
│
├── Auth
│
├── PostgreSQL
│    ├── Sales
│    ├── Payments
│    ├── Ledger
│    ├── Inventory
│    ├── Expenses
│    ├── Customers
│    └── Audit
│
├── Storage
│    ├── Logos
│    └── Receipt Assets
│
└── Edge Functions
     ├── Subscription logic
     ├── Email jobs
     └── Sensitive server operations
```

This keeps infrastructure costs extremely low.

---

# 53. Avoiding Paid Accounting Infrastructure

We don't need:

* Stripe
* QuickBooks API
* Xero API
* external accounting SaaS
* dedicated financial infrastructure

for the core POS.

The financial engine lives inside PostgreSQL.

This is exactly the kind of architecture that fits your **free-first / maximum ~$10/month** requirement.

---

# 54. What Should NOT Be Built Yet

To keep scope controlled, I recommend explicitly excluding:

* payroll
* supplier accounting
* purchase orders
* accounts payable
* accounts receivable beyond store credit/layaway
* bank integrations
* automatic bank reconciliation
* tax filing
* professional accounting statements
* external accounting integrations

These can be future modules.

---

# 55. Recommended Financial Reports

The reporting system should eventually expose:

### Sales

* Gross sales
* Net sales
* Discounts
* Refunds
* Tax
* Service charges

### Profitability

* COGS
* Gross profit
* Gross margin
* Expenses
* Estimated net profit

### Payments

* Cash
* Card
* Transfer
* Store credit
* Layaway

### Inventory

* Inventory value
* Stock movement
* COGS
* Low stock

### Employees

* Sales by cashier
* Refunds
* Discounts
* Cash variance

### Branches

* Sales by branch
* Profit by branch
* Inventory by branch

### Business Units

* Sales by unit
* Transactions by unit
* Performance by unit

---

# 56. The Financial Architecture

At this point the overall financial model becomes:

```text
                         BUSINESS
                            │
             ┌──────────────┼──────────────┐
             ↓              ↓              ↓
          SALES          EXPENSES       INVENTORY
             │              │              │
             ↓              ↓              ↓
        PAYMENTS         EXPENSE         COGS
             │              │              │
             └──────────────┼──────────────┘
                            ↓
                       FINANCIAL LEDGER
                            │
                 ┌──────────┼──────────┐
                 ↓          ↓          ↓
              REPORTS   RECONCILIATION AUDIT
```

---

# 57. Critical Architectural Decision

I recommend we officially adopt:

> **Event-based immutable financial records backed by a lightweight double-entry ledger.**

This gives us the reliability of accounting software without trying to build an entire accounting package.

---

# 58. Stage 5 — Final Decisions

### Financial model

**Lightweight double-entry ledger**

### Inventory costing

**Weighted Average Cost**

### Sales

**Immutable**

### Refunds

**Separate immutable transactions**

### Discounts

**Fixed + percentage**

### Tax

**Configurable**

### Service charge

**Universal configurable feature**

### Payments

**Cash + Card + Bank Transfer**

### Store credit

**Ledger-based customer balance**

### Layaway

**Installment payment ledger**

### Expenses

**Basic in-app expense system**

### Cash

**Simple cash session/accountability system**

### Reconciliation

**Supported**

### External accounting

**Not required**

### External payment processing for customer sales

**Not required**

### Paystack

**Subscription renewal only**

### Infrastructure

**Supabase/PostgreSQL-first**

### Cost target

**Free where possible, maximum ~$10/month**

---

