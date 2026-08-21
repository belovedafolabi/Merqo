# Stage 10 — Customer Management, Store Credit & Layaway

This stage defines how customers exist within the POS and, more importantly, how **store credit and layaway/installments** work without turning the system into a complicated CRM or lending platform.

The guiding principle is:

> **Customers should be simple to manage, but every financial obligation involving a customer must be highly auditable.**

---

# 1. Customer Architecture

A customer belongs to the **business**, not to a specific employee or POS terminal.

```text
Business
   │
   ├── Branch A
   │
   ├── Branch B
   │
   └── Customers
```

A customer can therefore transact at different branches of the same business.

Example:

> John buys a television at Branch A today and clothing at Branch B next month.

Both transactions belong to:

```text
John
   ↓
Same customer record
```

---

# 2. Customer vs Business Unit

Customers should also **not belong to a business unit**.

For example:

```text
Customer: John Doe

Purchases:
├── Supermarket
├── Pharmacy
├── Electronics
└── Fashion
```

This is especially important because your system supports multiple business units under the same business.

---

# 3. Customer Identification

You previously selected:

> **A — Customer identification should be simple.**

Therefore, the system should not require customers to create accounts or authenticate themselves.

A customer record can simply contain:

```text
Customer
├── Name
├── Phone
├── Email
└── Optional information
```

The POS operator can identify the customer during checkout.

---

# 4. Minimum Customer Information

Required:

```text
Full Name
```

Recommended:

```text
Phone Number
```

Optional:

```text
Email
Address
Notes
```

We should avoid collecting unnecessary personal information.

---

# 5. Customer ID

Every customer receives an internal immutable identifier:

```text
CUS-000001
CUS-000002
CUS-000003
```

The displayed customer code can be useful when searching or referencing customers.

However, the internal database ID should remain separate from the human-readable identifier.

---

# 6. Duplicate Customers

This is a common POS problem.

A cashier could create:

```text
John Doe
08012345678
```

and later:

```text
John Doe
08012345678
```

The system should detect likely duplicates.

Before creating a new customer, it can warn:

> "A customer with this phone number already exists."

The user can then:

```text
Use existing customer
```

or:

```text
Create anyway
```

depending on permissions.

---

# 7. Customer Search

The POS should support very fast searching by:

```text
Name
Phone
Email
Customer ID
```

The search should be optimized for POS speed.

A cashier shouldn't have to navigate through several pages just to find:

> 08012345678.

---

# 8. Customer Creation During Checkout

A customer should be creatable directly from the checkout screen.

Example:

```text
Checkout

Customer:
[ Walk-in Customer ▼ ]

       + Add Customer
```

The cashier enters:

```text
John Doe
08012345678
```

and continues checkout.

No need to leave the POS screen.

---

# 9. Walk-in Customer

The system should support a special conceptual customer:

```text
WALK-IN CUSTOMER
```

This should **not necessarily be a real customer record for every sale**.

Otherwise you would end up with thousands of meaningless customer records.

Instead:

```text
customer_id = NULL
```

can represent an anonymous/walk-in transaction.

---

# 10. Customer Purchase History

The customer profile should show:

```text
Purchase History
```

Example:

```text
John Doe

Total Purchases:
₦450,000

Transactions:
#TX-10021    ₦50,000
#TX-10384    ₦120,000
#TX-10921    ₦280,000
```

The user should be able to open individual transactions.

---

# 11. Customer Financial Summary

Because you support store credit and layaway, the customer profile needs a financial section.

Example:

```text
Customer Financial Summary

Store Credit Balance:
₦30,000

Layaway Outstanding:
₦100,000

Total Outstanding:
₦130,000
```

This should be prominently visible to authorized users.

---

# 12. Store Credit

You selected:

> **Store Credit — YES**

Store credit allows a business to maintain a credit balance associated with a customer.

There are two important concepts:

### Credit balance

Money the customer has available.

### Outstanding balance

Money the customer owes.

These must **never be treated as the same thing**.

---

# 13. Customer Credit Balance

Example:

A customer returns an item worth:

```text
₦50,000
```

Instead of receiving cash:

```text
Refund method:
Store Credit
```

The customer receives:

```text
Store Credit:
+₦50,000
```

Their available credit becomes:

```text
₦50,000
```

---

# 14. Using Store Credit

Later:

```text
Purchase:
₦80,000

Store credit:
₦50,000
```

The system deducts:

```text
₦50,000
```

from store credit.

However, because you previously selected:

> **No split payments**

the customer cannot pay the remaining ₦30,000 through another payment method in the same transaction.

Therefore the checkout should enforce:

```text
Available store credit >= sale total
```

for store-credit payment.

Otherwise:

> Store credit cannot be used for this transaction.

This keeps the payment model consistent with your earlier decision.

---

# 15. Store Credit Ledger

We should **never simply modify**:

```text
credit_balance = 50000
```

without a transaction history.

Instead:

```text
Credit Ledger

+50,000   Refund
-20,000   Purchase
+10,000   Manual adjustment
```

Current balance:

```text
₦40,000
```

This is essential for financial integrity.

---

# 16. Store Credit Transaction Types

Initial types:

```text
REFUND_CREDIT
CREDIT_PURCHASE
MANUAL_CREDIT
MANUAL_DEBIT
CREDIT_EXPIRATION
REVERSAL
```

---

# 17. Manual Credit Adjustments

An authorized user may need to correct a credit balance.

Example:

```text
Manual adjustment:
+₦5,000

Reason:
Customer compensation
```

This should require:

* permission
* reason
* audit event

It should never be an invisible balance modification.

---

# 18. Who Can Modify Store Credit?

Recommended default:

```text
Cashier:
Use credit
View credit

Branch Manager:
Use credit
View credit
Request adjustment

Owner/Admin:
Full credit management

Custom Role:
Based on permissions
```

A cashier should not be able to arbitrarily give a customer ₦100,000 store credit.

---

# 19. Store Credit Authorization

For sensitive operations:

```text
Manual credit
Manual debit
Large credit refund
Credit reversal
```

the system should support authorization.

This fits your broader decision:

> Refunds require authorization.

---

# 20. Layaway

You selected:

> **Layaway / Installments — YES**

Your required workflow was:

1. Record customer
2. Record outstanding balance
3. Record payment history
4. Allow multiple installment payments

We will follow this exactly.

---

# 21. Layaway Concept

A layaway transaction is:

```text
Customer
   ↓
Select Product(s)
   ↓
Create Layaway
   ↓
Customer Pays Deposit/Installment
   ↓
Outstanding Balance
   ↓
Additional Payments
   ↓
Fully Paid
```

---

# 22. Important: Layaway Is Not a Normal Sale

The system should **not record the product as a completed sale immediately** when the customer only makes a deposit.

Example:

Product:

```text
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

The transaction is:

```text
LAYAWAY_ACTIVE
```

not:

```text
SALE_COMPLETED
```

---

# 23. Layaway Record

A layaway should contain:

```text
Layaway ID
Customer
Branch
Business Unit
Items
Original Total
Amount Paid
Outstanding Balance
Status
Created By
Created At
```

---

# 24. Layaway Payment History

Every installment becomes an immutable payment record.

Example:

```text
Layaway #LAY-0012

Original:
₦500,000

Payments:

Aug 1:
₦100,000

Aug 10:
₦150,000

Aug 20:
₦100,000

Outstanding:
₦150,000
```

---

# 25. Layaway Statuses

We should use:

```text
PENDING
ACTIVE
PAID
CANCELLED
EXPIRED
REFUNDED
```

The exact expiration rules can be configured later.

---

# 26. Fully Paid Layaway

When:

```text
Amount Paid >= Original Total
```

the system transitions:

```text
ACTIVE
   ↓
PAID
```

At this point the system can finalize the associated sale according to the business's configured fulfillment workflow.

---

# 27. Inventory and Layaway

This is one of the most important architectural decisions.

Because you removed offline functionality and want inventory integrity, we need to decide when inventory is reserved.

I recommend:

> **Inventory is reserved when the layaway is created.**

Example:

```text
Inventory:
10 TVs

Layaway:
1 TV

On Hand:
10

Reserved:
1

Available:
9
```

---

# 28. Why Reserve Inventory?

Without reservation:

```text
10 TVs
```

Customer pays ₦100,000 toward one.

The POS still considers:

```text
10 available
```

Another customer could buy all 10.

Then the original layaway customer has paid for a product that no longer exists.

Reservation prevents this.

---

# 29. Layaway Reservation

Therefore:

```text
On Hand = 10
Reserved = 1
Available = 9
```

When the layaway is cancelled:

```text
Reserved:
1 → 0
```

The product becomes available again.

---

# 30. Layaway Cancellation

Cancellation should require authorization.

The system should record:

```text
Cancelled By
Cancelled At
Reason
Amount Paid
Amount Refunded
```

The original layaway should remain in the database.

It should not be deleted.

---

# 31. Layaway Refund

Suppose:

```text
Total:
₦500,000

Paid:
₦200,000
```

The business cancels the layaway.

The system records the refund separately.

Potential refund methods:

```text
Cash
Card
Bank transfer
Store credit
```

subject to your normal refund authorization rules.

---

# 32. Layaway Partial Payments

You explicitly selected:

> Multiple installment payments.

Therefore there is no fixed number of installments.

Example:

```text
₦50,000
₦20,000
₦100,000
₦30,000
₦50,000
```

The system simply maintains the ledger.

---

# 33. No Complex Loan System

We should **not** introduce:

* interest
* credit scoring
* loan amortization
* penalties
* financial lending
* credit bureau integrations

This is a POS layaway system, not a lending platform.

---

# 34. Customer Statements

Authorized users should be able to generate a customer statement containing:

```text
Purchases
Returns
Store credit
Layaway payments
Refunds
Adjustments
Outstanding balances
```

Example:

```text
Customer Statement
John Doe

Opening Balance
₦100,000

+ Layaway Payment
₦50,000

- Purchase
₦20,000

+ Store Credit
₦10,000

Closing Balance
₦140,000
```

The exact presentation will depend on whether the item is a credit balance or debt, so the UI should clearly separate them.

---

# 35. Credit vs Layaway Balance

The customer dashboard should never display:

```text
Balance: ₦130,000
```

without context.

Instead:

```text
Store Credit Available
₦30,000

Layaway Outstanding
₦100,000
```

This prevents a major UX and accounting ambiguity.

---

# 36. Customer Deletion

You previously selected the recommendation concerning deletion.

For customers with transactions:

> **Do not physically delete the customer record.**

Instead:

```text
ACTIVE
   ↓
ARCHIVED
```

or:

```text
ACTIVE
   ↓
DEACTIVATED
```

Historical transactions continue referencing the customer.

---

# 37. Customer With Financial Obligations

A customer should **not be deactivated** if they have unresolved:

```text
Store credit
Layaway
Outstanding balance
```

unless the user has an elevated permission and the system handles the financial implications.

This prevents orphaned financial records.

---

# 38. Customer Privacy

Customer information should be visible based on permission.

For example:

```text
customer.view
customer.create
customer.edit
customer.archive
customer.view_financials
customer.manage_credit
customer.manage_layaway
customer.view_history
```

A cashier doesn't necessarily need access to every financial detail.

---

# 39. Cross-Branch Customers

Because customers belong to the business, not branches:

```text
Customer
   ↓
Business
   ├── Branch A transaction
   ├── Branch B transaction
   └── Branch C transaction
```

However, branch users should only see cross-branch information if their permissions allow it.

---

# 40. Customer Reporting

The reporting system should eventually support:

### Customer sales

```text
Top customers by sales
```

### Customer frequency

```text
Most frequent customers
```

### Store credit

```text
Total outstanding store credit
```

### Layaway

```text
Active layaways
Total outstanding layaway
Overdue layaways
```

### Customer activity

```text
New customers
Active customers
Inactive customers
```

---

# 41. Business-Type Compatibility

The customer system remains generic.

### Supermarket

```text
John Doe
Purchases groceries
```

### Pharmacy

```text
John Doe
Purchases OTC products
```

### Electronics

```text
John Doe
Buys television
```

### Fashion

```text
John Doe
Buys clothing
```

### Hotel

```text
John Doe
Hotel-related transaction
```

The core customer architecture doesn't need to know the industry.

---

# 42. Business Unit Context

Every relevant transaction should retain:

```text
business_unit_id
```

Example:

```text
John Doe

Transactions:

TX-001
Business Unit: Supermarket

TX-002
Business Unit: Pharmacy

TX-003
Business Unit: Electronics
```

This allows highly detailed reporting without duplicating customers.

---

# 43. Customer-Related Audit Events

The audit system should capture:

```text
Customer created
Customer updated
Customer archived
Customer restored

Store credit issued
Store credit used
Store credit adjusted
Store credit reversed

Layaway created
Layaway payment recorded
Layaway cancelled
Layaway completed
Layaway refunded
```

---

# 44. Data Integrity Rules

Several rules should be enforced at the database/service level.

### Store credit

```text
credit balance cannot become negative
```

unless your future business rules explicitly allow it.

### Layaway

```text
payment cannot exceed outstanding balance
```

unless overpayment handling is explicitly designed.

### Customer

```text
historical transactions cannot lose their customer reference
```

### Financial records

```text
posted financial transactions cannot be edited
```

Corrections must use reversals/adjustments.

---

# 45. Recommended Database Concept

At a high level:

```text
customers
    │
    ├── customer_transactions
    │
    ├── store_credit_accounts
    │       │
    │       └── store_credit_ledger
    │
    └── layaways
            │
            ├── layaway_items
            └── layaway_payments
```

This is much safer than storing everything in a single `customers` table.

---

# 46. Core Customer Tables

Conceptually:

### `customers`

```text
id
business_id
customer_code
name
phone
email
address
status
created_at
updated_at
```

### `store_credit_accounts`

```text
id
customer_id
balance
status
created_at
updated_at
```

### `store_credit_ledger`

```text
id
account_id
transaction_id
type
amount
balance_after
reason
created_by
created_at
```

### `layaways`

```text
id
customer_id
branch_id
business_unit_id
total_amount
amount_paid
outstanding_amount
status
created_by
created_at
updated_at
```

### `layaway_items`

```text
id
layaway_id
product_id
variant_id
quantity
unit_price
total
```

### `layaway_payments`

```text
id
layaway_id
amount
payment_method
reference
created_by
created_at
```

---

# 47. Critical Financial Principle

For both store credit and layaway:

> **Never use the current balance as the historical source of truth.**

The ledger is the source of truth.

The balance is a calculated/materialized value used for fast access.

So:

```text
Ledger
   ↓
Balance
```

not:

```text
Balance
   ↓
History
```

This will matter enormously when we build the financial reporting system.

---

# 48. Stage 10 Locked Decisions

| Area                              | Decision              |
| --------------------------------- | --------------------- |
| Customer ownership                | Business-level        |
| Branch ownership                  | No                    |
| Business-unit ownership           | No                    |
| Cross-branch customers            | Yes                   |
| Customer identification           | Simple                |
| Walk-in customers                 | Yes                   |
| Customer creation during checkout | Yes                   |
| Customer purchase history         | Yes                   |
| Customer financial summary        | Yes                   |
| Store credit                      | Yes                   |
| Store credit ledger               | Yes                   |
| Store credit manual adjustment    | Permission controlled |
| Customer-specific pricing         | No                    |
| Loyalty                           | No                    |
| Membership tiers                  | No                    |
| Customer groups                   | No                    |
| Customer preferences              | No                    |
| Layaway                           | Yes                   |
| Installments                      | Yes                   |
| Multiple installment payments     | Yes                   |
| Layaway customer requirement      | Required              |
| Layaway outstanding balance       | Yes                   |
| Layaway payment history           | Yes                   |
| Layaway inventory reservation     | Yes                   |
| Layaway cancellation              | Yes                   |
| Layaway refund                    | Yes                   |
| Customer deletion                 | Archive/deactivate    |
| Historical transaction deletion   | Never                 |
| Financial records                 | Immutable             |
| Customer permissions              | Granular RBAC         |
| Customer audit trail              | Yes                   |

---