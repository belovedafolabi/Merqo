# Stage 19 — Inventory & Stock Management Architecture

This stage defines how the POS will **store, track, adjust, sell, return, and transfer inventory**.

This is particularly important because your system has:

* Multiple branches
* Business units/sub-businesses inside branches
* Branch-level pricing
* Branch-specific inventory
* Simple stock transfers
* Product variants
* Returns/refunds
* No suppliers/procurement
* No wastage/damaged-stock modules
* No offline mode
* Concurrent POS terminals

The inventory architecture therefore needs to be **simple enough to maintain but strong enough for serious retail operations**.

---

# 19.1 The Core Inventory Principle

We should separate:

> **What a product is**

from:

> **Where that product is stocked**

and:

> **How much of it is currently available**

Conceptually:

```text
PRODUCT
   │
   └── Product Variant
            │
            ├── Branch A Inventory
            ├── Branch B Inventory
            └── Branch C Inventory
```

The product itself should **not contain the stock quantity**.

---

# 19.2 Product vs Inventory

For example:

```text
Coca-Cola Zero 50cl
```

is a product.

But:

```text
Abuja Branch
Available = 42
```

is inventory.

Therefore:

```text
products
```

and:

```text
inventory
```

must be separate entities.

---

# 19.3 Business Hierarchy

Your structure is:

```text
Business
│
├── Branch A
│   │
│   ├── Main Supermarket
│   │
│   └── Pharmacy
│
├── Branch B
│   │
│   ├── Main Supermarket
│   │
│   └── Juice Bar
│
└── Branch C
```

We will refer to these internal operational entities as **Business Units**.

This is important because "business type" should not be confused with "business unit."

---

# 19.4 Business Type vs Business Unit

A **business type** describes the nature of the operation.

Examples:

```text
Supermarket
Restaurant
Pharmacy
Fashion
Electronics
Hotel
```

A **business unit** is an actual operational division belonging to a client's branch.

For example:

```text
Client: XYZ Enterprises

Branch: Abuja Mall

Business Unit:
    Main Supermarket
    Pharmacy
```

The Pharmacy may have pharmacy-specific functionality enabled without becoming a separate client.

---

# 19.5 Your Q23 Rule

You explicitly corrected Q23 and want to keep:

> **The same product cannot exist in multiple business units.**

This needs to be interpreted carefully.

I recommend enforcing:

> A specific product/variant can belong to only one business unit **within a branch**.

But the same product can exist in another branch.

Example:

```text
Abuja Branch
├── Supermarket
│     └── Coca-Cola
│
└── Pharmacy
      └── ❌ Coca-Cola
```

But:

```text
Abuja Branch
└── Supermarket
      └── Coca-Cola

Lagos Branch
└── Supermarket
      └── Coca-Cola
```

is valid.

This preserves your rule without preventing normal multi-branch retail operations.

---

# 19.6 Why This Matters

Without this restriction, the system could end up with:

```text
Branch
 ├── Unit A → Product X
 ├── Unit B → Product X
 └── Unit C → Product X
```

and then questions arise around:

* Which unit owns the stock?
* Which unit owns the sale?
* Which unit owns the revenue?
* Which unit determines the product configuration?
* Which unit is responsible for the product?

Your rule gives us a much cleaner ownership model.

---

# 19.7 Inventory Ownership

I recommend:

```text
Business
   ↓
Branch
   ↓
Business Unit
   ↓
Inventory
```

So inventory belongs to a specific operational business unit.

However, because you selected **Q21 = C**, the business unit's inventory should be treated as **part of the branch's inventory architecture rather than an entirely isolated inventory universe**.

That means the branch remains the primary inventory boundary while the business unit provides operational ownership/context.

---

# 19.8 Inventory Model

The core table conceptually becomes:

```text
inventory
────────────────────────
id
branch_id
business_unit_id
product_variant_id
quantity
low_stock_threshold
created_at
updated_at
```

With an important uniqueness rule:

```text
(branch_id, business_unit_id, product_variant_id)
```

must be unique.

---

# 19.9 Quantity Types

We should distinguish at least:

```text
On Hand
Available
```

For the initial system, we don't need an elaborate reservation engine.

The fundamental quantity is:

> **On-hand quantity available for sale.**

For example:

```text
Stock = 100
```

means the POS can potentially sell 100.

---

# 19.10 Reserved Stock

Because you have layaway, we need to think about reservation.

However, we should **not automatically introduce a complicated reservation system**.

For a normal completed sale:

```text
Stock 100
Sale 3
→ Stock 97
```

For a suspended sale:

```text
Stock 100
Suspended sale 3
→ Stock remains 100
```

For layaway, the business workflow will determine when inventory is committed.

We should keep this explicit rather than silently reserving stock.

---

# 19.11 Inventory Movements

This is one of the most important design decisions.

Don't only store:

```text
quantity = 97
```

We also maintain an inventory movement ledger.

Example:

```text
Inventory
Current quantity = 97

Movements:
+100 Initial stock
 -3 Sale
```

This gives us historical traceability.

---

# 19.12 Movement Types

The initial system should support:

```text
INITIAL_STOCK
SALE
RETURN
REFUND
ADJUSTMENT_INCREASE
ADJUSTMENT_DECREASE
TRANSFER_OUT
TRANSFER_IN
```

Potential future types can be added later.

We deliberately exclude:

```text
PURCHASE
WASTAGE
DAMAGED
SUPPLIER_RECEIPT
```

because you've removed supplier/procurement functionality.

---

# 19.13 Why We Need a Movement Ledger

Suppose an administrator sees:

```text
Stock = 73
```

They should be able to determine:

> Why is it 73?

The ledger might show:

```text
Initial stock       +100
Sale #1042            -5
Sale #1043            -2
Return #82             +1
Adjustment             -21
-------------------------
Current                73
```

This makes inventory auditable.

---

# 19.14 Never Rewrite Historical Movements

An inventory movement should be immutable.

If an incorrect adjustment was made:

```text
Adjustment -10
```

we don't edit it to:

```text
Adjustment -5
```

Instead:

```text
Original adjustment -10

Correction +5
```

The final result is correct while the history remains intact.

---

# 19.15 Stock Adjustments

Authorized users can adjust inventory.

Example:

```text
System stock: 50
Physical count: 47
```

An authorized user creates:

```text
ADJUSTMENT_DECREASE
quantity = -3
reason = Physical count correction
```

Result:

```text
47
```

---

# 19.16 Adjustment Authorization

Inventory adjustments should be permission controlled.

For example:

```text
inventory.adjust
```

could be restricted to:

* Owner
* Branch Manager
* Custom roles with permission

A cashier shouldn't automatically have inventory adjustment capabilities.

---

# 19.17 Adjustment Reason

Every manual adjustment should require a reason.

For example:

```text
"Physical stock count correction"
```

This becomes part of the audit trail.

---

# 19.18 Stock Transfers

You changed your initial answer and decided:

> **Stock transfers = YES, but keep them simple.**

I agree.

We don't need a procurement/logistics management system.

We simply need:

```text
Branch A
    ↓
Transfer
    ↓
Branch B
```

---

# 19.19 Simple Transfer Workflow

```text
Create Transfer
      ↓
Select Source Branch
      ↓
Select Destination Branch
      ↓
Select Product
      ↓
Enter Quantity
      ↓
Submit
      ↓
Approve/Confirm
      ↓
Deduct Source
      ↓
Add Destination
```

---

# 19.20 Transfer Status

Keep statuses simple:

```text
PENDING
COMPLETED
CANCELLED
```

We don't need:

```text
IN_TRANSIT
PARTIALLY_RECEIVED
DAMAGED_IN_TRANSIT
```

for the first version.

---

# 19.21 Transfer Atomicity

The transfer should be atomic.

You don't want:

```text
Source -10
Destination +0
```

because something failed halfway through.

Instead:

```text
BEGIN

Deduct source
Create TRANSFER_OUT
Add destination
Create TRANSFER_IN

COMMIT
```

If anything fails:

```text
ROLLBACK
```

---

# 19.22 Transfer Concurrency

Transfers must use the same inventory concurrency protection as sales.

If Branch A has:

```text
Stock = 5
```

and someone attempts to transfer:

```text
10
```

the database must reject it.

---

# 19.23 Can Transfers Cross Business Units?

I recommend:

> **Yes at the branch level, but the destination business unit must be explicitly selected when applicable.**

Example:

```text
Branch A
Supermarket
      ↓
Transfer
      ↓
Branch B
Supermarket
```

or:

```text
Branch A
Supermarket
      ↓
Transfer
      ↓
Branch A
Pharmacy
```

However, your "same product cannot exist in multiple business units" rule means the second example should be rejected if that product already belongs to another business unit in the destination branch.

---

# 19.24 Product Ownership During Transfers

A transfer should **not create a new product**.

The product remains the same:

```text
product_id = X
```

Only its inventory location changes.

---

# 19.25 Product Creation

You previously specified that product creation can be performed by:

* Super Admin
* Admin/Owner
* Branch Manager
* Authorized Custom Roles

The product creation flow should therefore require the creator to select its operational context.

---

# 19.26 Product Categories

Categories remain dynamically configurable.

Example:

```text
Beverages
Electronics
Clothing
Beauty
Hardware
Pharmacy
```

A category is not itself a business type.

---

# 19.27 Product Variants and Inventory

Suppose:

```text
Nike T-Shirt
```

has:

```text
Small
Medium
Large
```

Inventory is:

```text
Small    10
Medium   25
Large     7
```

Each variant gets its own inventory quantity.

---

# 19.28 SKU

Every sellable product/variant should have a SKU.

Example:

```text
NIKE-TSH-BLK-M
```

SKU should be unique within the deployment/business.

---

# 19.29 Barcode

Barcode should be indexed.

For example:

```text
barcode = 1234567890123
```

Barcode lookup should be extremely fast because this is one of the most frequently executed POS operations.

---

# 19.30 Inventory Lookup

The POS needs an efficient query roughly equivalent to:

```text
branch
+
business unit
+
barcode
→
product
+
variant
+
price
+
available quantity
```

We should optimize this path heavily.

---

# 19.31 Low Stock

Each inventory record can have:

```text
low_stock_threshold
```

Example:

```text
Quantity = 8
Threshold = 10
```

The system marks it:

```text
LOW STOCK
```

---

# 19.32 Out of Stock

If:

```text
quantity = 0
```

the POS should prevent normal sale.

The product can still appear in search if configured to do so, but checkout should reject it.

---

# 19.33 Negative Stock

I recommend:

> **Negative inventory should be disabled by default.**

The database should enforce:

```text
quantity >= 0
```

This is another protection against incorrect transactions.

---

# 19.34 Why Not Allow Negative Stock?

Suppose:

```text
Stock = 0
```

but the cashier sells 1 anyway.

You now have:

```text
Stock = -1
```

This hides inventory problems rather than solving them.

For a serious POS, the safer default is to reject the sale.

---

# 19.35 Inventory and Returns

When a physical product is returned and accepted:

```text
RETURN
+
quantity
```

Example:

```text
Current stock = 20
Return = 2
New stock = 22
```

The movement ledger records the reason.

---

# 19.36 Inventory and Refunds

Refund and stock return should be linked but conceptually separate.

```text
Refund transaction
      │
      └── Inventory movement
```

This means the financial event and inventory event remain auditable.

---

# 19.37 No Damaged/Wastage Module

You've explicitly excluded:

* Damaged stock
* Wastage

Therefore we shouldn't build dedicated modules for them.

However, because businesses inevitably need to correct stock, an authorized inventory adjustment can still be used.

For example:

```text
Adjustment:
-2

Reason:
"Damaged item"
```

This doesn't turn it into a dedicated wastage-management feature.

---

# 19.38 No Supplier Dependency

Products should be able to exist without:

```text
Supplier
```

This is important because you explicitly don't want supplier/procurement functionality to be a core dependency.

---

# 19.39 Inventory Dashboard

The inventory dashboard should provide:

```text
Total products
Total units
Low-stock items
Out-of-stock items
Recent movements
Recent adjustments
Transfers
```

---

# 19.40 Inventory Reports

Because you selected comprehensive reporting, inventory reports should include:

### Stock level report

```text
Product
Variant
Branch
Business Unit
Current quantity
Threshold
Status
```

### Movement report

```text
Date
Product
Movement type
Quantity
User
Branch
Reference
```

### Transfer report

```text
Transfer ID
Source
Destination
Product
Quantity
Status
Created by
Date
```

---

# 19.41 Inventory Permissions

Granular permissions should include things such as:

```text
inventory.view
inventory.adjust
inventory.transfer
inventory.transfer.create
inventory.transfer.cancel
inventory.history.view
inventory.reports.view
```

A custom role can then receive exactly the capabilities required.

---

# 19.42 Branch Scope

A Branch Manager should not automatically see every branch.

Example:

```text
Manager — Abuja Branch
```

should generally have:

```text
Abuja inventory → YES
Lagos inventory → NO
```

unless explicitly granted broader access.

---

# 19.43 Owner Scope

The Owner has broader business-level access.

```text
Owner
 ↓
Business
 ├── Abuja
 ├── Lagos
 └── Ibadan
```

They can see inventory across branches subject to the permissions/configuration model.

---

# 19.44 Super Admin

The Super Admin is outside the client's normal authorization hierarchy.

As you specified:

> **Super Admin has untethered access.**

The system should therefore provide the Super Admin with unrestricted administrative access for system management.

However, operational actions should still be audited.

For example:

```text
Super Admin changed inventory
```

should still generate an audit event.

"Untethered access" should mean **not restricted by the client's RBAC**, not "invisible."

---

# 19.45 Inventory Database Model

At a high level:

```text
products
   │
   └── product_variants
             │
             ↓
         inventory
             │
             ↓
     inventory_movements
```

With organizational context:

```text
business
   │
   └── branches
          │
          └── business_units
                    │
                    └── inventory
```

---

# 19.46 Core Inventory Tables

The exact schema will come later, but conceptually we'll need:

```text
products
product_variants
categories

branches
business_units

inventory
inventory_movements

stock_transfers
stock_transfer_items
```

Potentially:

```text
inventory_adjustments
```

but this can be represented through the movement ledger depending on the final schema.

---

# 19.47 Inventory Movement Structure

Conceptually:

```text
inventory_movements
────────────────────────
id
inventory_id
movement_type
quantity
reference_type
reference_id
reason
created_by
created_at
```

For example:

```text
movement_type = SALE
quantity = -3
reference_type = SALE
reference_id = SALE-00123
```

This creates traceability.

---

# 19.48 Never Calculate Inventory Only From the Ledger

We should maintain both:

```text
inventory.quantity
```

and:

```text
inventory_movements
```

The quantity gives fast reads.

The movement ledger provides history.

This avoids having to calculate:

```text
SUM(all movements)
```

every time the POS scans a product.

---

# 19.49 But We Need Consistency

The quantity and movement ledger must be updated in the same database transaction.

Never:

```text
Update inventory
```

and then separately:

```text
Insert movement
```

without atomicity.

Otherwise they can diverge.

---

# 19.50 Example

Sale of 3 units:

```text
BEGIN

inventory.quantity:
100 → 97

movement:
SALE -3

sale:
created

COMMIT
```

Everything succeeds together.

---

# 19.51 Stock Transfer Example

```text
Branch A:
100 → 90

Branch B:
20 → 30

Movements:
A → TRANSFER_OUT -10
B → TRANSFER_IN +10
```

Both happen within the same transaction.

---

# 19.52 Inventory Architecture Summary

Your inventory system is therefore intentionally **not** a full warehouse/procurement management system.

It is:

> **A branch-aware inventory control and movement system tightly integrated with POS transactions.**

That is the right scope for this product.

---

# 19.53 Final Inventory Decisions

| Area                                         | Decision     |
| -------------------------------------------- | ------------ |
| Branch-specific inventory                    | Yes          |
| Business-unit context                        | Yes          |
| Business-unit independent inventory          | No           |
| Same product in multiple units within branch | No           |
| Same product across branches                 | Yes          |
| Product variants                             | Yes          |
| SKU                                          | Yes          |
| Barcode                                      | Yes          |
| Low-stock threshold                          | Yes          |
| Negative stock                               | No           |
| Stock adjustments                            | Yes          |
| Adjustment reasons                           | Required     |
| Inventory movement ledger                    | Yes          |
| Movement history                             | Immutable    |
| Stock transfers                              | Yes          |
| Transfer complexity                          | Simple       |
| Suppliers                                    | No           |
| Purchasing                                   | No           |
| Supplier invoices                            | No           |
| Damaged stock module                         | No           |
| Wastage module                               | No           |
| Inventory reservation engine                 | No initially |
| Returns                                      | Yes          |
| Refund inventory restoration                 | Yes          |
| Concurrency protection                       | Yes          |
| Branch-level pricing                         | Yes          |

---