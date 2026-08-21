# Stage 9 — Inventory Operations, Stock Transfers & Cash Management

This stage defines how the system manages **physical inventory movement and operational money management** after the transaction engine.

One important distinction from the previous stage:

> **The POS transaction engine records what was sold. The inventory system records what physically happened to stock. The cash-management system records what happened to business money.**

Because you ultimately want this to work across supermarkets, restaurants, pharmacies, fashion stores, electronics stores, hardware stores, hotels, etc., these systems need to be generic enough to support all of them without introducing unnecessary industry-specific complexity.

---

# 1. Inventory Architecture

Your decision is:

* Inventory is branch-specific.
* Business units do **not** have independent inventory.
* Products belong to the parent business/branch inventory structure.
* A product cannot exist in multiple business units.
* Pricing is configurable at branch level.
* Stock transfers are supported, but kept simple.

Therefore:

```text
Business
│
├── Branch A
│   │
│   ├── Business Unit: Supermarket
│   │
│   ├── Business Unit: Pharmacy
│   │
│   └── Inventory
│
└── Branch B
    │
    ├── Business Unit: Supermarket
    │
    └── Inventory
```

The **inventory belongs to the branch**, not the individual business unit.

---

# 2. Why This Architecture Is Important

Consider:

> A supermarket has a pharmacy inside it.

You decided:

```text
Supermarket
    +
Pharmacy
```

are business units under the same branch.

But the physical stock belongs to the branch.

Therefore:

```text
Branch Inventory
       │
       ├── Coca-Cola
       ├── Bread
       ├── Paracetamol
       └── Shampoo
```

Business units determine **how the products are exposed and operated**, while the branch remains the inventory boundary.

This is a very useful distinction.

---

# 3. Inventory Ownership

The system should conceptually have:

```text
Business
    ↓
Branch
    ↓
Inventory
    ↓
Product Stock
```

rather than:

```text
Business
    ↓
Business Unit
    ↓
Inventory
```

This prevents the architecture from becoming unnecessarily complicated.

---

# 4. Product vs Inventory

We should maintain a distinction between:

### Product

What the item **is**.

```text
Coca-Cola Zero
SKU: COKE-ZERO
Category: Soft Drinks
```

### Inventory

How much of that product exists at a particular branch.

```text
Branch Abuja
Coke Zero:
145 units
```

Therefore the same product definition can theoretically be available across branches while each branch maintains its own quantity.

---

# 5. Product Availability

Because you selected that the same product cannot exist in multiple business units, product availability should be controlled through business-unit configuration.

For example:

```text
Product:
Paracetamol

Branch:
Abuja Central

Business Unit:
Pharmacy
```

The supermarket unit doesn't necessarily expose that product.

This gives us:

```text
Product
   ↓
Branch availability
   ↓
Business-unit availability
```

without creating duplicate product records.

---

# 6. Inventory Quantity

Inventory should distinguish at least:

```text
On Hand
Reserved
Available
```

Conceptually:

```text
Available = On Hand - Reserved
```

Example:

```text
On Hand:      100
Reserved:      10
----------------
Available:     90
```

This becomes particularly important for layaway.

---

# 7. Inventory Ledger

We should **not rely only on a mutable stock quantity**.

Instead, every inventory change should generate an inventory movement.

Example:

```text
Inventory Movement

+100  Initial stock
 -5   Sale
 +2   Return
 -3   Adjustment
 -10  Transfer out
```

Current stock:

```text
84
```

The current quantity can be stored for performance, but the movement ledger provides the historical source of truth.

---

# 8. Inventory Movement Types

The initial system should support:

```text
SALE
RETURN
TRANSFER_OUT
TRANSFER_IN
ADJUSTMENT_INCREASE
ADJUSTMENT_DECREASE
RESERVATION
RESERVATION_RELEASE
LAYAWAY_RESERVATION
LAYAWAY_RELEASE
```

We should avoid introducing unnecessary movement types.

---

# 9. Stock Adjustments

Authorized users should be able to correct inventory.

Example:

System says:

```text
100 units
```

Physical count says:

```text
97 units
```

An authorized user creates:

```text
Adjustment:
-3
Reason:
Physical stock count
```

The system does **not** simply overwrite 100 with 97.

It records:

```text
Previous:
100

Adjustment:
-3

New:
97
```

---

# 10. Adjustment Permissions

Inventory adjustments are sensitive.

Recommended permissions:

```text
inventory.view
inventory.adjust
inventory.adjust.increase
inventory.adjust.decrease
inventory.adjust.approve
```

You can later configure which roles have them.

For example:

```text
Cashier:
view only

Branch Manager:
view + adjust

Owner:
full access
```

---

# 11. Adjustment Reason

Every manual adjustment should require a reason.

Examples:

```text
Physical count
Data correction
Opening balance
System correction
Unknown discrepancy
Other
```

For "Other", a description should be mandatory.

This becomes part of the audit trail.

---

# 12. Stock Counts

A useful feature for practically every business type is **stock counting**.

The system should allow an authorized user to initiate:

```text
Stock Count
```

for:

* entire branch
* category
* selected products

---

# 13. Stock Count Workflow

```text
Create Count
     ↓
Count Items
     ↓
Enter Physical Quantities
     ↓
System Calculates Variance
     ↓
Review
     ↓
Approve
     ↓
Inventory Adjustment
```

Example:

```text
System quantity: 200
Physical quantity: 193

Variance: -7
```

The final adjustment is recorded separately.

---

# 14. Why Stock Counts Matter

This is especially useful for:

* supermarkets
* pharmacies
* electronics
* hardware
* fashion
* convenience stores

It gives businesses a mechanism for reconciling the system against reality.

---

# 15. Stock Transfers

You changed your earlier decision and selected:

> **YES — stock transfers, but keep them simple.**

I agree with this decision.

Stock transfers are valuable for multi-branch businesses.

---

# 16. Example

A business has:

```text
Branch A
Coke:
200 units
```

and:

```text
Branch B
Coke:
20 units
```

Branch B needs more.

A transfer is created:

```text
Branch A
 ↓
20 Coke
 ↓
Branch B
```

---

# 17. Simple Transfer Workflow

I recommend:

```text
DRAFT
 ↓
REQUESTED
 ↓
APPROVED
 ↓
IN_TRANSIT
 ↓
RECEIVED
```

But we can simplify further for MVP.

The essential flow is:

```text
Create Transfer
      ↓
Approve
      ↓
Dispatch
      ↓
Receive
```

---

# 18. Transfer Creation

A transfer contains:

```text
Source Branch
Destination Branch
Products
Quantities
Requested By
Date
Notes
```

Example:

```text
Transfer #TR-00042

From:
Abuja Central

To:
Abuja Mall

Items:
Coke × 50
Bread × 20
```

---

# 19. Transfer Approval

Depending on permissions:

```text
Branch Manager
      ↓
Creates transfer
      ↓
Authorized Manager
      ↓
Approves
```

The approval requirement should be configurable.

For very small businesses, the owner may allow managers to transfer without a separate approval step.

---

# 20. Transfer Dispatch

When the stock physically leaves the source branch:

```text
DISPATCHED
```

The source inventory is reduced.

Example:

```text
Source:
100 → 80
```

But the destination should **not yet** receive the stock.

Instead:

```text
In Transit:
20
```

---

# 21. Transfer Receipt

When the receiving branch confirms:

```text
RECEIVED
```

the destination inventory increases:

```text
Destination:
30 → 50
```

---

# 22. Why We Shouldn't Immediately Add Stock to Destination

Imagine:

```text
Branch A sends 100 phones.
```

The system immediately adds them to Branch B.

But the truck never arrives.

Branch B would incorrectly show:

```text
100 phones available
```

when it physically has:

```text
0
```

The `IN_TRANSIT` state prevents this.

---

# 23. Transfer Discrepancy

Suppose:

```text
Sent:
100
```

but:

```text
Received:
98
```

The receiver should be able to record:

```text
Received: 98
Difference: 2
```

The system should **not silently modify the original transfer**.

Instead, the discrepancy becomes an auditable event.

---

# 24. Transfer History

Every transfer should preserve:

```text
Created by
Approved by
Dispatched by
Received by
Source branch
Destination branch
Items
Quantities
Timestamps
Status
Notes
Discrepancies
```

This fits directly into your audit architecture.

---

# 25. Transfer Restrictions

The system should prevent:

```text
Branch A → Branch A
```

and:

```text
Transfer quantity > available stock
```

unless a specifically authorized override exists.

I recommend **no negative inventory through transfers**.

---

# 26. Negative Inventory

I recommend disabling negative inventory by default.

If:

```text
Available:
5
```

and someone tries:

```text
Sell:
7
```

the POS should stop the transaction.

The system should not produce:

```text
-2
```

unless you eventually introduce an explicit business configuration allowing negative inventory.

For the initial system:

> **Negative inventory = disabled.**

---

# 27. Low Stock

The product system should support:

```text
Low Stock Threshold
```

Example:

```text
Product:
Coke

Reorder threshold:
20
```

When:

```text
Available ≤ 20
```

the system can generate:

```text
LOW_STOCK
```

notification.

---

# 28. Out of Stock

When:

```text
Available = 0
```

the product should become:

```text
OUT_OF_STOCK
```

for that branch.

This should not necessarily deactivate the product globally.

Another branch could still have:

```text
Available = 200
```

---

# 29. Inventory Across Branches

The Owner should be able to see:

```text
Coke Zero

Abuja Central:
120

Abuja Mall:
34

Gwarinpa:
0

Total:
154
```

while branch users should normally only see the inventory they have permission to access.

---

# 30. Branch Isolation

A Branch Manager at Branch A should not automatically be able to:

```text
modify Branch B inventory
```

unless their permissions explicitly allow cross-branch access.

This should be enforced at the authorization/database level, not merely hidden in the UI.

---

# 31. Inventory and Business Units

Because inventory belongs to the branch:

```text
Branch
│
├── Inventory
│
├── Supermarket Unit
│
└── Pharmacy Unit
```

A sale from either business unit ultimately affects the same branch inventory pool.

However, the system records:

```text
business_unit_id
```

on the transaction.

Therefore reporting can still answer:

> How much inventory was sold through the pharmacy unit?

without creating a separate inventory system.

---

# 32. Pricing

You selected:

> Pricing configurable at branch level.

Therefore:

```text
Product
   ↓
Branch Price
```

Example:

```text
Coke

Abuja:
₦1,000

Lagos:
₦1,100
```

This is different from:

```text
Business Unit Price
```

---

# 33. Business Unit Price Override

Because you selected that each business unit has its own POS configuration, we can eventually support business-unit-specific **display/configuration rules** without making the product itself duplicated.

But we should avoid allowing independent product pricing at the unit level unless you later explicitly need it.

Otherwise pricing becomes:

```text
Product
 ↓
Branch
 ↓
Business Unit
 ↓
Variant
 ↓
Customer
```

which quickly becomes difficult to manage.

---

# 34. Inventory Reporting

The inventory module should support:

### Stock overview

```text
Product
On Hand
Reserved
Available
Low-stock status
```

### Movement history

```text
Date
Product
Movement
Quantity
User
Reason
Reference
```

### Stock valuation

Potentially:

```text
Quantity × Cost
```

where cost data exists.

### Transfer report

```text
Sent
Received
In Transit
Discrepancies
```

---

# 35. Inventory Cost

Because you excluded suppliers/purchasing, we need to be careful about inventory cost accounting.

The system should **not pretend to know acquisition cost** if the business hasn't provided it.

We can therefore support an optional:

```text
Unit Cost
```

on inventory/product records.

This enables:

```text
Inventory Value
Gross Margin
COGS
```

where the business has entered appropriate cost information.

---

# 36. Inventory Costing Model

For the initial architecture, I recommend supporting:

> **Simple configurable unit cost / average cost**

rather than immediately implementing complex FIFO/LIFO accounting.

This keeps the system within your "extensive but not unnecessarily complicated" objective.

---

# 37. Cash Management — Important Correction

There is an important consequence of your earlier answers.

You originally marked the **cash-register feature set as excluded**:

* cash registers
* register opening
* cash drawer
* cashier shifts
* shift closing
* expected cash
* actual cash
* variance
* end-of-day reconciliation
* register-specific reports

Therefore I am **not going to introduce a traditional cash-register/shift-management subsystem** into the core architecture.

That means the POS will record:

```text
Payment:
Cash
Amount:
₦50,000
```

but it will not attempt to manage a physical cash drawer or cashier shift unless you later enable that feature.

This is actually a significant simplification.

---

# 38. Cash Transaction Records

Even without a cash-register subsystem, cash payments must still be recorded.

For every cash payment:

```text
Payment
├── Transaction
├── Amount
├── Payment Method
├── Timestamp
└── User
```

Therefore reports can still show:

```text
Cash sales today:
₦1,250,000
```

without having a full cash drawer management system.

---

# 39. Payment Summary

At the end of a reporting period:

```text
Cash:
₦1,200,000

Card:
₦850,000

Transfer:
₦600,000

Total:
₦2,650,000
```

This is sufficient for the intermediate financial functionality you've selected.

---

# 40. Refund Impact

A refund should create a corresponding negative financial event.

Example:

```text
Sales:
₦1,000,000

Refunds:
-₦50,000

Net Sales:
₦950,000
```

Again, we don't modify the original sale.

---

# 41. Inventory + Sales Relationship

A normal sale produces:

```text
SALE
 ↓
Payment
 ↓
Inventory decrease
 ↓
Inventory movement
```

A return produces:

```text
RETURN
 ↓
Refund
 ↓
Inventory increase
 ↓
Inventory movement
```

A transfer produces:

```text
TRANSFER
 ↓
Source decrease
 ↓
In Transit
 ↓
Destination increase
```

An adjustment produces:

```text
ADJUSTMENT
 ↓
Inventory movement
```

This gives us a clean and predictable inventory model.

---

# 42. Inventory Event Architecture

Conceptually:

```text
                    INVENTORY
                        │
        ┌───────────────┼────────────────┐
        ↓               ↓                ↓
      SALES           TRANSFERS       ADJUSTMENTS
        │               │                │
        ↓               ↓                ↓
     Deduct          Move Stock       Increase/
     Stock           Between          Decrease
                     Branches
```

---

# 43. Notifications

Based on your notification requirements, inventory events can trigger:

```text
LOW_STOCK
OUT_OF_STOCK
STOCK_TRANSFER_CREATED
STOCK_TRANSFER_RECEIVED
STOCK_TRANSFER_DISCREPANCY
INVENTORY_ADJUSTMENT
```

Notifications can appear:

```text
In-app
Email
```

where appropriate.

---

# 44. Permission Architecture

The inventory system should integrate with your granular RBAC.

Example:

```text
inventory.view
inventory.adjust
inventory.count.create
inventory.count.approve

inventory.transfer.create
inventory.transfer.approve
inventory.transfer.dispatch
inventory.transfer.receive

inventory.view_all_branches
```

This is much better than simply:

```text
can_manage_inventory = true
```

---

# 45. Audit Events

The following should generate audit events:

```text
Inventory adjustment
Stock count approval
Transfer creation
Transfer approval
Transfer dispatch
Transfer receipt
Transfer discrepancy
Inventory configuration change
Low-stock threshold change
```

---

# 46. What We Are Deliberately NOT Building

To preserve the scope and your requirements, this stage does **not** introduce:

* suppliers
* purchase orders
* supplier invoices
* procurement workflows
* damaged-stock subsystem
* wastage subsystem
* complex warehouse management
* FIFO/LIFO accounting engine
* multi-stage warehouse transfers
* advanced logistics
* automated external accounting integrations

Those can be added later if the product direction changes.

---

# 47. Stage 9 Final Architecture

The operational model now looks like:

```text
                    BUSINESS
                       │
                ┌──────┴──────┐
                │             │
             BRANCH A       BRANCH B
                │             │
           INVENTORY       INVENTORY
                │             │
        ┌───────┴───────┐     │
        │               │     │
  Business Unit 1  Business Unit 2
        │               │
        └───────┬───────┘
                │
              SALES
                │
        ┌───────┼────────┐
        ↓       ↓        ↓
     Payment  Inventory  Audit
                 │
        ┌────────┼─────────┐
        ↓        ↓         ↓
      Sale    Transfer  Adjustment
```

---

# 48. Decisions Locked in This Stage

| Area                             | Decision                              |
| -------------------------------- | ------------------------------------- |
| Inventory scope                  | Branch-level                          |
| Business-unit inventory          | No separate inventory                 |
| Business-unit POS configuration  | Independent                           |
| Product duplication across units | No                                    |
| Branch pricing                   | Yes                                   |
| Stock transfers                  | Yes                                   |
| Transfer complexity              | Simple                                |
| Transfer states                  | Create → Approve → Dispatch → Receive |
| In-transit stock                 | Yes                                   |
| Transfer discrepancy             | Yes                                   |
| Negative inventory               | Disabled                              |
| Stock adjustments                | Yes                                   |
| Stock counts                     | Yes                                   |
| Low-stock thresholds             | Yes                                   |
| Out-of-stock status              | Yes                                   |
| Inventory ledger                 | Yes                                   |
| Inventory audit trail            | Yes                                   |
| Cross-branch visibility          | Permission-controlled                 |
| Cash registers                   | **Not included**                      |
| Cashier shifts                   | **Not included**                      |
| Cash drawer management           | **Not included**                      |
| End-of-day cash reconciliation   | **Not included**                      |
| Cash payment recording           | Yes                                   |
| Payment summaries                | Yes                                   |
| Supplier management              | No                                    |
| Procurement                      | No                                    |
| Wastage/damaged stock module     | No                                    |

---