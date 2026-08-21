# Stage 23 — Inventory Management

This stage defines the **inventory subsystem itself**. The POS transaction engine already defines *when a sale deducts stock*; this stage defines how stock is structured, tracked, adjusted, counted, transferred, and reported.

The guiding principle is:

> **Inventory belongs to a specific branch/business-unit context, and every quantity change must have a traceable inventory movement.**

---

## 23.1 Inventory Architecture

Based on your earlier decisions, the hierarchy is:

```text
Business
│
├── Branch A
│   │
│   ├── Business Unit A
│   │     └── Product Inventory
│   │
│   └── Business Unit B
│         └── Product Inventory
│
└── Branch B
    │
    └── Business Unit A
          └── Product Inventory
```

You selected **Q21 = C**, meaning the business unit does not necessarily need to operate as an entirely independent inventory system.

The important distinction is:

> Inventory is operationally tied to a branch/business-unit context, while the product catalogue remains owned by the business.

---

# 23.2 Inventory Record

An inventory record represents the stock position of a sellable product/variant in a particular operational location.

Conceptually:

```text
inventory
────────────────────
id
product_variant_id
branch_id
business_unit_id
quantity
reserved_quantity
reorder_level
status
created_at
updated_at
```

Available stock can then be calculated as:

```text
Available Stock
=
Quantity
-
Reserved Quantity
```

---

# 23.3 Why `reserved_quantity` Matters

This becomes important for **layaway** and potentially other future workflows.

Example:

```text
Physical stock:       10
Reserved:              3
Available to sell:     7
```

The POS shouldn't sell the reserved three.

This prevents over-selling.

---

# 23.4 Inventory Models

You previously said the system should support **different inventory models**.

The system should therefore allow a business to select an appropriate inventory tracking model during configuration.

The initial models can include:

### 1. Stock-tracked

```text
Quantity:
100
```

Every sale changes inventory.

### 2. Non-stock / service

Useful for:

* Haircuts
* Services
* Consultations
* Hotel services

The item can be sold without maintaining physical inventory.

### 3. Optional quantity-based

Useful for businesses where exact inventory tracking isn't necessary for every item.

This keeps the platform flexible without forcing every business to behave like a supermarket.

---

# 23.5 Product Inventory Configuration

Each product/variant can have:

```text
Track inventory: YES / NO
```

For example:

### Supermarket

```text
Coca-Cola
Track inventory = YES
```

### Salon

```text
Haircut
Track inventory = NO
```

### Electronics

```text
Samsung TV
Track inventory = YES
```

---

# 23.6 Inventory Quantity

Quantity should support decimal values where necessary.

For example:

```text
25 units
```

or:

```text
12.5 kg
```

This follows the product/unit-of-measure architecture established earlier.

---

# 23.7 Inventory Movements

**Every inventory change must create a movement record.**

Examples:

```text
SALE
REFUND
STOCK_ADJUSTMENT
STOCK_TRANSFER_IN
STOCK_TRANSFER_OUT
STOCK_COUNT_ADJUSTMENT
LAYAWAY_RESERVATION
LAYAWAY_RELEASE
```

This gives us an inventory ledger.

---

# 23.8 Inventory Ledger

Instead of only storing:

```text
Current stock = 73
```

we maintain history:

```text
Opening stock       +100
Sale                 -10
Sale                  -5
Refund                +2
Adjustment             -4
Transfer out          -10
──────────────────────────
Current stock          73
```

The current quantity is therefore traceable.

---

# 23.9 Inventory Movement Record

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
SALE
quantity = -3
reference = POS-000184
```

---

# 23.10 Negative Inventory

I recommend:

> **Negative inventory should be disabled by default.**

If stock is:

```text
0
```

and someone tries to sell:

```text
1
```

the POS should reject the transaction.

However, the Owner should be able to explicitly enable negative inventory if a particular business workflow requires it.

That setting should be permission/configuration controlled.

---

# 23.11 Why Allow Negative Inventory at All?

Some businesses may operate with imperfect inventory records.

For example:

```text
Actual shelf stock = 10
System stock = 0
```

A business might prefer to record the sale rather than block checkout.

But because inventory accuracy is one of the main purposes of a POS, I would keep:

```text
Negative inventory = OFF
```

as the default.

---

# 23.12 Stock Adjustments

Authorized users can manually adjust stock.

Example:

```text
System stock:
50

Physical count:
48

Adjustment:
-2
```

The system records:

```text
STOCK_ADJUSTMENT
-2
Reason: Physical count correction
User: Branch Manager
```

---

# 23.13 Adjustment Reasons

The system should provide common reasons such as:

* Physical count correction
* Data correction
* Opening stock
* Administrative adjustment
* Other

You explicitly excluded:

* Damaged stock
* Wastage

so those should **not** appear as dedicated inventory movement categories.

---

# 23.14 Stock Adjustment Authorization

Inventory adjustment is financially sensitive.

A cashier should not automatically have permission to change:

```text
100 units → 10 units
```

Permissions should include:

```text
inventory.adjust
inventory.adjust.large
inventory.count
inventory.approve_adjustment
```

The exact hierarchy can be configured through RBAC.

---

# 23.15 Stock Counts

The system should support physical stock counts.

Basic workflow:

```text
Start Count
   ↓
Select branch/business unit
   ↓
Count products
   ↓
Compare system vs physical
   ↓
Review differences
   ↓
Approve
   ↓
Create adjustment movements
```

---

# 23.16 Stock Count Example

System:

```text
Coca-Cola = 100
```

Physical count:

```text
Coca-Cola = 97
```

Difference:

```text
-3
```

After approval:

```text
Inventory = 97
```

with an immutable movement documenting the adjustment.

---

# 23.17 Stock Count Permissions

Recommended:

```text
inventory.count.create
inventory.count.view
inventory.count.submit
inventory.count.approve
```

This allows businesses to separate:

> "The person who counted it"

from:

> "The person who approved the adjustment."

That is a useful fraud-control mechanism.

---

# 23.18 Low Stock Threshold

Each inventory item can have a reorder/low-stock threshold.

Example:

```text
Current:
8

Low-stock threshold:
10
```

The system marks it:

```text
LOW STOCK
```

---

# 23.19 Out-of-Stock

When:

```text
available quantity = 0
```

the product becomes:

```text
OUT OF STOCK
```

The product itself doesn't necessarily become inactive.

This distinction matters.

---

# 23.20 Product Status vs Inventory Status

These are different.

```text
Product:
ACTIVE

Inventory:
OUT_OF_STOCK
```

means:

> The business still sells this product, but currently has none.

Whereas:

```text
Product:
ARCHIVED
```

means:

> The business no longer actively sells it.

---

# 23.21 Low Stock Notifications

You previously enabled notifications broadly.

The inventory subsystem should therefore be able to trigger:

```text
LOW_STOCK
OUT_OF_STOCK
```

notifications.

These can appear:

```text
In-app
Email
```

according to the notification configuration.

---

# 23.22 Stock Transfers

You changed your original decision to:

> **YES — but keep it simple.**

So we will include transfers without building a complicated warehouse/procurement system.

---

# 23.23 Simple Transfer Workflow

```text
Branch A
   ↓
Create Transfer
   ↓
Select destination
   ↓
Select products + quantities
   ↓
Submit
   ↓
Approve/confirm
   ↓
Dispatch
   ↓
Receive
   ↓
Completed
```

---

# 23.24 Transfer States

Keep the workflow simple:

```text
DRAFT
PENDING
IN_TRANSIT
COMPLETED
CANCELLED
```

No elaborate logistics module.

---

# 23.25 Transfer Example

Abuja has:

```text
Coca-Cola = 100
```

Lagos needs:

```text
20
```

Transfer:

```text
Abuja
100 → 80

Lagos
50 → 70
```

with movement records:

```text
TRANSFER_OUT -20
TRANSFER_IN +20
```

---

# 23.26 Transfer Concurrency

The source inventory must be validated when the transfer is committed.

If:

```text
Abuja = 10
```

and someone attempts to transfer:

```text
15
```

the operation fails.

The system must not allow:

```text
Abuja = -5
```

unless negative inventory has explicitly been enabled.

---

# 23.27 Transfer Approval

I recommend keeping this configurable.

A business could choose:

```text
Manager creates
Manager confirms
```

or:

```text
Cashier creates
Manager approves
```

This fits your granular RBAC system.

---

# 23.28 Receiving Transfers

The destination branch should confirm receipt.

This prevents the system from assuming:

> "Sent" = "Received."

Example:

```text
Transfer:
20 units

Sent:
20

Received:
19
```

The discrepancy should be visible and require appropriate resolution.

---

# 23.29 Transfer History

Each transfer should retain:

```text
Source branch
Destination branch
Business units
Products
Quantities
Created by
Approved by
Dispatched at
Received by
Received at
Status
```

---

# 23.30 Inventory Across Business Units

Because you decided:

> The same product cannot exist in multiple business units within the same branch.

The system should enforce:

```text
Product X
   ↓
Branch A
   ↓
Business Unit A
```

and reject:

```text
Product X
   ↓
Branch A
   ↓
Business Unit B
```

unless it is first removed/reassigned from Business Unit A.

---

# 23.31 Inventory Transfer Between Business Units

I recommend **not supporting this in MVP**.

Your stock-transfer requirement is primarily:

```text
Branch → Branch
```

rather than:

```text
Supermarket Unit → Pharmacy Unit
```

inside the same branch.

That keeps the system considerably simpler.

---

# 23.32 Inventory and Sales

When a sale completes:

```text
Sale
 ↓
Inventory deduction
 ↓
Inventory movement
```

The movement references the transaction.

Example:

```text
SALE
-2
POS-000184
```

This makes reconciliation possible.

---

# 23.33 Inventory and Refunds

When a valid physical return occurs:

```text
Refund
 ↓
Inventory restoration
 ↓
Movement:
RETURN +1
```

Again, the movement references the refund transaction.

---

# 23.34 Inventory and Layaway

For layaway, the architecture should distinguish:

```text
Physical quantity
```

from:

```text
Reserved quantity
```

Example:

```text
Physical = 10
Reserved = 2
Available = 8
```

This avoids prematurely removing physical stock while still preventing another sale from consuming the reserved units.

---

# 23.35 Inventory Valuation

Because reporting includes analytics and financial information, the system should be capable of calculating:

```text
Inventory quantity
×
Cost
=
Inventory value
```

The exact accounting treatment belongs in the accounting stage.

---

# 23.36 Cost Snapshot

When stock enters or is manually configured with a cost, that cost should be preserved appropriately for historical reporting.

We should not rely exclusively on the **current** product cost to calculate historical profit.

---

# 23.37 Inventory Reports

The inventory subsystem should expose data for reports such as:

### Stock On Hand

```text
Product
Quantity
Location
```

### Low Stock

```text
Product
Current
Threshold
```

### Stock Movement

```text
Date
Product
Movement
Quantity
Reason
User
```

### Stock Valuation

```text
Product
Quantity
Cost
Estimated value
```

### Transfer Report

```text
Source
Destination
Product
Quantity
Status
```

---

# 23.38 Inventory Search

Managers should be able to search by:

* Product name
* SKU
* Barcode
* Category
* Branch
* Business unit
* Stock status

The POS itself should use a much faster optimized product lookup path.

---

# 23.39 Inventory Permissions

Recommended permission families:

```text
inventory.view
inventory.view_all
inventory.adjust
inventory.count
inventory.count.approve
inventory.transfer.create
inventory.transfer.approve
inventory.transfer.receive
inventory.configure
```

These are examples; the final permission catalogue will be consolidated in the RBAC stage.

---

# 23.40 Inventory Auditability

Every manual stock modification should identify:

```text
Who
What
When
Where
Why
```

For example:

```text
User:
Branch Manager

Product:
Coca-Cola

Change:
-5

Reason:
Physical count correction

Branch:
Abuja

Timestamp:
2026-08-21 10:32
```

---

# 23.41 What Inventory Does NOT Include

Per your earlier decisions, inventory will **not** include:

❌ Suppliers
❌ Supplier invoices
❌ Purchasing
❌ Procurement
❌ Damaged-stock management
❌ Wastage management
❌ Recipes
❌ Ingredients
❌ Automatic ingredient deduction

This prevents the system from accidentally evolving into a procurement/ERP system.

---

# 23.42 Inventory Architecture Summary

| Capability                              | Decision            |
| --------------------------------------- | ------------------- |
| Branch-specific inventory               | ✅                   |
| Business-unit context                   | ✅                   |
| Inventory tracking                      | Configurable        |
| Physical stock                          | ✅                   |
| Reserved stock                          | ✅                   |
| Decimal quantities                      | ✅                   |
| Inventory ledger                        | ✅                   |
| Stock movements                         | ✅                   |
| Stock adjustments                       | ✅                   |
| Physical stock counts                   | ✅                   |
| Low-stock thresholds                    | ✅                   |
| Out-of-stock status                     | ✅                   |
| Low-stock notifications                 | ✅                   |
| Branch-to-branch transfers              | ✅                   |
| Simple transfer workflow                | ✅                   |
| Business-unit-to-business-unit transfer | ❌ MVP               |
| Negative inventory                      | Disabled by default |
| Supplier management                     | ❌                   |
| Purchasing                              | ❌                   |
| Procurement                             | ❌                   |
| Damaged stock                           | ❌                   |
| Wastage                                 | ❌                   |
| Recipes                                 | ❌                   |
| Ingredients                             | ❌                   |