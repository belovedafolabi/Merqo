# Stage 28 — Product, Inventory & Commerce Management

This stage defines the complete **Product and Inventory domain** of the Dynamic POS. The goal is to create a product system that works for supermarkets, pharmacies, restaurants, fashion stores, electronics stores, hardware stores, bakeries, wholesalers, etc., without hardcoding industry-specific assumptions into the core.

The architecture should support different inventory models while remaining simple enough to operate within your **free / ≤$10 monthly infrastructure target**.

---

# 28.1 Product Architecture

The fundamental relationship is:

```text
Business
   │
   ├── Branch
   │     │
   │     └── Business Unit
   │
   └── Product Catalogue
            │
            ├── Product
            ├── Variant
            ├── SKU
            └── Barcode
```

A product belongs to the **client business catalogue**.

Its:

* inventory is branch-specific
* pricing is branch-configurable
* POS configuration can differ by business unit
* availability can differ by branch/business unit

---

# 28.2 Product vs Business Unit

This is an important rule from your previous decisions.

You said:

> The same product cannot exist in multiple business units.

Therefore, we should distinguish between:

### Product ownership

The product belongs to the business.

### Product assignment

The product can be assigned to the appropriate business unit.

But the same product record cannot simultaneously represent the same commercial product in multiple business units.

Conceptually:

```text
Business
   │
   ├── Product A
   │      └── Supermarket
   │
   ├── Product B
   │      └── Pharmacy
   │
   └── Product C
          └── Electronics
```

This prevents ambiguity about which business unit owns the product.

---

# 28.3 Product Creation

You previously decided that product creation can be performed by:

* Super Admin
* Owner/Admin
* Branch Manager
* Custom roles with the permission

Therefore:

```text
products.create
```

must be a granular permission.

A user should not gain product-creation privileges simply because they are a manager.

---

# 28.4 Product Information

The core product should support:

```text
Product
├── Name
├── SKU
├── Barcode
├── Category
├── Description
├── Product type
├── Unit of measure
├── Images
├── Variants
├── Cost information
├── Selling price configuration
├── Tax configuration
├── Inventory configuration
├── Status
└── Metadata
```

Not every field is mandatory for every business type.

---

# 28.5 Product Types

The architecture should support different product types without creating separate product systems.

Examples:

```text
PHYSICAL
SERVICE
COMPOSITE
```

However, because you explicitly removed recipes, ingredients and modifiers, **composite/recipe-style products should remain extremely limited**.

For MVP, the primary model should be:

> **Physical product**

with support for services where required by businesses such as salons.

---

# 28.6 Services

Some businesses don't primarily sell physical inventory.

For example:

* Barber
* Beauty salon
* Hotel

A service could be:

```text
Men's Haircut
₦10,000
```

with:

```text
Track inventory:
NO
```

This allows the same POS engine to process services without pretending that every sale represents physical stock.

---

# 28.7 Product Categories

Categories are **dynamic and Admin-defined**.

Example:

```text
Electronics
├── Phones
├── Laptops
└── Accessories
```

or:

```text
Pharmacy
├── Pain Relief
├── Vitamins
└── Personal Care
```

The system should not hardcode categories based on business type.

---

# 28.8 Category Hierarchy

Categories should support parent/child relationships.

Example:

```text
Beverages
   ├── Soft Drinks
   │      ├── Coca-Cola
   │      └── Pepsi
   │
   └── Juice
```

A product can belong to an appropriate category.

---

# 28.9 Product Variants

You selected:

> Product variants — YES.

Variants are useful for:

* Clothing sizes
* Clothing colours
* Phone storage
* Electronics models
* Product sizes
* Packaging sizes

Example:

```text
Nike T-Shirt

Variants:
├── Small / Black
├── Medium / Black
├── Large / Black
├── Small / White
├── Medium / White
└── Large / White
```

---

# 28.10 Variant-Level SKU

Each inventory-bearing variant should be independently identifiable.

Example:

```text
Product:
Nike T-Shirt

Variant:
Medium / Black

SKU:
TSH-NIK-BLK-M
```

This allows inventory to distinguish variants.

---

# 28.11 Variant-Level Barcode

Where required, variants may have individual barcodes.

Example:

```text
Medium Black:
8901234567890

Large Black:
8901234567891
```

Barcode scanning should therefore resolve to the **specific sellable variant**, not merely the parent product.

---

# 28.12 Barcode Rules

The system should support:

* Existing manufacturer barcodes
* Business-created barcodes
* Numeric barcodes
* Alphanumeric internal identifiers where appropriate

The POS should be able to scan standard retail barcode input.

---

# 28.13 SKU vs Barcode

These must remain separate.

### SKU

Internal business identifier.

```text
SKU-000123
```

### Barcode

Physical machine-readable identifier.

```text
8901234567890
```

A product may have:

```text
SKU:
TSH-001-M-BLK

Barcode:
8901234567890
```

---

# 28.14 Multiple Barcodes

The architecture should support multiple barcodes for a product/variant where necessary.

For example, a business may have:

* Manufacturer barcode
* Internal barcode
* Alternate barcode

This is particularly useful when different packaging or suppliers aren't part of the platform's procurement system.

---

# 28.15 Product Images

Products should support image uploads.

Recommended architecture:

```text
Supabase Storage
      │
      ▼
Product Image
      │
      └── Product / Variant
```

Images should not be stored directly inside the database.

---

# 28.16 Product Status

Products should support:

```text
ACTIVE
INACTIVE
ARCHIVED
```

### Active

Can be sold.

### Inactive

Exists but cannot normally be sold.

### Archived

Retained for historical records but removed from normal catalogue operations.

---

# 28.17 Product Deletion

Because transactional data is immutable:

A product that has already appeared in a transaction should **not be hard deleted**.

Instead:

```text
ACTIVE
 ↓
ARCHIVED
```

Historical transactions remain intact.

---

# 28.18 Product Pricing

You selected:

> Pricing configurable at **Branch Level**.

Therefore:

```text
Product
   │
   ├── Wuse Branch → ₦10,000
   ├── Gwarinpa → ₦9,500
   └── Maitama → ₦10,500
```

The same product can therefore have different prices at different branches.

---

# 28.19 Business Unit Pricing

Although pricing is branch-level, the POS configuration can exist at business-unit level.

We should avoid creating an unnecessarily complex three-level price hierarchy.

Therefore:

> **Branch price is the authoritative selling price unless a later requirement explicitly introduces business-unit price overrides.**

This keeps pricing manageable.

---

# 28.20 No Customer-Specific Pricing

As previously decided:

```text
Customer
    X
Custom price
```

is not supported.

Everyone purchasing the same product at the same branch uses the configured branch price, subject to approved discounts.

---

# 28.21 Product Cost

The system should optionally record product cost.

Example:

```text
Selling price:
₦50,000

Cost:
₦35,000
```

This allows future reporting such as:

```text
Gross margin:
₦15,000
```

The exact accounting treatment will be defined later.

---

# 28.22 Inventory Tracking

Products should have an inventory configuration.

Example:

```text
Track inventory:
YES
```

or:

```text
Track inventory:
NO
```

Services can therefore exist without meaningless stock quantities.

---

# 28.23 Inventory Ownership

Inventory is:

> **Branch-specific.**

Example:

```text
Product:
Coca-Cola 50cl

Wuse:
120 units

Gwarinpa:
75 units
```

These are independent inventory quantities.

---

# 28.24 Business Unit Inventory

You previously answered:

> **Q21 — C**

Business units do not maintain completely independent inventory pools.

Instead, inventory belongs to the **branch**, while the business unit controls what it is permitted to sell/use.

Conceptually:

```text
Branch
   │
   └── Inventory
          │
          ├── Supermarket
          └── Pharmacy
```

This is particularly useful for your example where a supermarket and pharmacy operate within one branch.

---

# 28.25 Why This Model Is Better

Suppose:

```text
Wuse Branch
├── Supermarket
└── Pharmacy
```

Inventory can remain centralized at:

```text
Wuse Branch Inventory
```

while the POS configuration determines which products are available to each business unit.

This avoids unnecessary duplicate stock systems.

---

# 28.26 Product Availability

A product should have configurable availability.

Example:

```text
Coca-Cola

Wuse:
Available

Gwarinpa:
Unavailable
```

A product can therefore exist in the catalogue without being sellable at every branch.

---

# 28.27 Business Unit Product Availability

Likewise:

```text
Wuse Branch

Supermarket:
Coca-Cola ✅
Bread ✅
Paracetamol ❌

Pharmacy:
Coca-Cola ❌
Bread ❌
Paracetamol ✅
```

This prevents the wrong business unit from accidentally selling products belonging to another operation.

---

# 28.28 Inventory Quantity

For a physical product:

```text
On hand:
100

Reserved:
10

Available:
90
```

Conceptually:

```text
Available = On Hand - Reserved
```

---

# 28.29 Stock Reservations

Reservations are necessary for workflows such as layaway.

Example:

```text
On hand:
20

Layaway reservation:
2

Available:
18
```

The reserved units cannot be sold through ordinary checkout.

---

# 28.30 Stock Adjustments

Authorized users should be able to adjust inventory.

Examples:

```text
+20
-5
```

But adjustments should require:

* Quantity
* Reason
* User
* Timestamp
* Branch
* Product
* Previous quantity
* New quantity

---

# 28.31 No Silent Inventory Changes

The system should never allow:

```text
100 → 80
```

without knowing why.

Instead:

```text
Stock Adjustment

Previous:
100

Adjustment:
-20

New:
80

Reason:
Manual stock correction

Performed by:
John Doe
```

---

# 28.32 Inventory Movement Ledger

Inventory should maintain an event history.

Example:

```text
Inventory Ledger

+100  Initial stock
-5    Sale
-2    Layaway reservation
+1    Refund
-3    Stock adjustment
```

This becomes the authoritative history of inventory changes.

---

# 28.33 Stock Transfers

You changed the earlier decision to:

> **Stock transfers = YES, but keep it simple.**

The MVP workflow should therefore be:

```text
Branch A
   │
   │ Transfer 20 units
   ▼
Branch B
```

No complicated procurement/warehouse logistics system.

---

# 28.34 Simple Transfer Workflow

```text
CREATE TRANSFER
      ↓
SELECT SOURCE
      ↓
SELECT DESTINATION
      ↓
SELECT PRODUCT
      ↓
SELECT QUANTITY
      ↓
CONFIRM
      ↓
COMPLETE
```

---

# 28.35 Transfer Authorization

Stock transfers should be permission controlled.

Example:

```text
inventory.transfer.create
inventory.transfer.receive
```

A business can decide which employees have these capabilities.

---

# 28.36 Transfer Atomicity

The transfer must be handled safely.

We must avoid:

```text
Source:
-20

Destination:
ERROR
```

leaving the inventory inconsistent.

The operation should be atomic:

```text
Source deduction
+
Destination addition
+
Transfer record
```

must succeed together or fail together.

---

# 28.37 Stock Transfer History

Every transfer should retain:

* Source branch
* Destination branch
* Product
* Variant
* Quantity
* Initiator
* Receiver
* Timestamp
* Status

Example:

```text
TRF-00042

Wuse → Gwarinpa

Coca-Cola 50cl
20 units

Status:
COMPLETED
```

---

# 28.38 Stock Count / Stocktaking

The inventory system should support physical stock counts.

Example:

```text
System quantity:
100

Physical count:
97
```

The authorized user can create a stock adjustment:

```text
-3
Reason:
Stock count discrepancy
```

The adjustment is recorded in the inventory ledger.

---

# 28.39 Low Stock Threshold

Products should support:

```text
Low stock threshold:
10
```

When:

```text
Available quantity <= 10
```

the system can generate an in-app notification.

This threshold can be configured at the appropriate inventory scope.

---

# 28.40 Out-of-Stock Behavior

A product reaching:

```text
Available = 0
```

should automatically become unavailable for ordinary POS sales unless the business explicitly permits selling below stock.

For the MVP:

> **Negative inventory should be disabled by default.**

---

# 28.41 Negative Inventory

The system should prevent:

```text
Stock = 0

Sale:
5 units
```

from producing:

```text
Stock = -5
```

This protects inventory integrity.

Any future option to permit negative stock should be an explicit business configuration.

---

# 28.42 Inventory Models

You requested support for **different inventory models**.

The architecture should support at least:

### Stock-tracked

```text
Quantity:
100
```

### Non-stock/service

```text
Quantity:
N/A
```

### Variant stock

```text
Product
├── Small → 10
├── Medium → 20
└── Large → 5
```

The architecture can later support additional models without redesigning the entire product system.

---

# 28.43 Unit of Measure

Products should support units such as:

* Piece
* Box
* Pack
* Bottle
* Pair
* Kilogram
* Gram
* Litre
* Metre

This is important for hardware, bakeries, wholesalers and general retail.

---

# 28.44 Quantity Precision

Not every product needs whole-number quantities.

For example:

```text
10 pieces
```

versus:

```text
2.5 kg
```

Therefore, the inventory engine should support configurable quantity precision.

However, the MVP should avoid unnecessary unit-conversion complexity.

---

# 28.45 Product Import

For businesses with thousands of products, manually creating every product is impractical.

The system should support bulk import.

Example:

```text
CSV
 ↓
Validation
 ↓
Preview
 ↓
Import
```

Importable fields can include:

* Name
* SKU
* Barcode
* Category
* Price
* Cost
* Unit
* Initial stock
* Status

---

# 28.46 Import Validation

Invalid rows should not partially corrupt the catalogue.

Example:

```text
Row 24:
Invalid price

Row 35:
Duplicate SKU

Row 51:
Invalid category
```

The system should provide an error report before committing the import.

---

# 28.47 Product Export

Authorized users should be able to export product data.

Useful formats:

* CSV
* XLSX

This supports:

* Backup
* Migration
* Analysis
* Bulk editing

---

# 28.48 Product Search

The POS needs extremely fast search.

Search should support:

```text
Product name
SKU
Barcode
Variant
Category
```

The barcode path should be optimized for near-instant lookup.

---

# 28.49 Product Search in Admin

The Admin dashboard can provide richer filtering:

```text
Category
Branch
Business Unit
Status
Stock status
Price range
SKU
Barcode
```

---

# 28.50 Product Permissions

At minimum:

```text
products.view
products.create
products.edit
products.archive
products.restore

products.price.view
products.price.edit

products.inventory.view
products.inventory.adjust

inventory.transfer.create
inventory.transfer.receive
inventory.stocktake
```

The exact permission matrix will be consolidated later.

---

# 28.51 Product Audit Events

Important events include:

```text
Product created
Product edited
Product archived
Product restored

Price changed
Barcode changed
SKU changed
Category changed

Inventory adjusted
Inventory transferred
Stock count completed
Product availability changed
```

---

# 28.52 Product Deletion Rule

The general rule:

### Never delete historical product references.

If a product has never been used:

```text
Hard delete
```

may potentially be permitted with authorization.

If it has transaction/inventory history:

```text
Archive
```

instead.

This preserves transactional integrity.

---

# 28.53 Product Configuration by Business Type

This is where the Dynamic POS concept becomes important.

The product system itself remains generic.

The business type determines which fields/features are relevant.

For example:

### Fashion

```text
Size
Colour
Variant
```

### Electronics

```text
Model
Storage
Variant
Serial number — if later enabled
```

### Pharmacy

```text
Product
Strength — if applicable
```

But because you've explicitly excluded prescription/clinical functionality, the pharmacy module should not turn the product catalogue into a medical-record system.

---

# 28.54 Product Configuration by Business Unit

The business unit can determine:

* Whether product is available
* Which POS interface is used
* Which category structure is displayed
* Applicable operational settings

But the underlying product remains within the business catalogue.

---

# 28.55 Serial Numbers

For electronics and certain high-value products, serial-number tracking could be useful.

### Recommendation

**Do not make serial-number tracking mandatory for MVP.**

Instead, keep the inventory architecture extensible enough to support it later.

This avoids making every ordinary supermarket product carry unnecessary serial-number complexity.

---

# 28.56 Expiry Tracking

Pharmacies and bakeries can benefit from expiry dates.

However, you excluded advanced pharmacy management.

### Recommendation

Support **basic optional batch/expiry metadata** in the inventory architecture, but don't build a full pharmaceutical batch-management system in this stage unless it is part of your previously approved pharmacy requirements.

This keeps the architecture extensible without overbuilding.

---

# 28.57 Inventory Reports

The inventory module should provide:

* Current stock
* Available stock
* Reserved stock
* Low stock
* Out of stock
* Stock movements
* Stock adjustments
* Stock transfers
* Stock count discrepancies
* Inventory valuation
* Product-level history

Filters:

* Branch
* Business unit
* Category
* Product
* Date

---

# 28.58 Product-Level Inventory View

Example:

```text
Coca-Cola 50cl

Wuse
──────────────────
On hand:       120
Reserved:        5
Available:     115
Threshold:      20

Gwarinpa
──────────────────
On hand:        80
Reserved:        0
Available:      80
Threshold:      15
```

---

# 28.59 Commerce Architecture

The resulting commerce flow becomes:

```text
                PRODUCT CATALOGUE
                       │
                       ▼
                  AVAILABILITY
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
      BRANCH PRICE             INVENTORY
          │                         │
          └────────────┬────────────┘
                       ▼
                  BUSINESS UNIT
                       │
                       ▼
                     POS
```

---

# 28.60 Important Architectural Principle

The system should **not create separate product systems** for:

* Supermarkets
* Pharmacies
* Restaurants
* Fashion
* Electronics
* Hardware

Instead:

```text
Core Product Engine
       +
Business-Type Configuration
       +
Business-Unit Configuration
```

This is the foundation of the Dynamic POS.

---

# 28.61 Stage 28 — Final Scope

### Product

✅ Catalogue
✅ Categories
✅ Subcategories
✅ Variants
✅ SKUs
✅ Barcodes
✅ Multiple barcodes
✅ Images
✅ Product status
✅ Product archive
✅ Product creation permissions
✅ Product import/export
✅ Product search
✅ Product availability
✅ Product cost
✅ Services

### Pricing

✅ Branch-level pricing
✅ Price history
❌ Customer-specific pricing
❌ Complex price lists

### Inventory

✅ Branch-specific inventory
✅ Business-unit availability
✅ Stock tracking
✅ Non-stock products/services
✅ Variants
✅ Stock reservations
✅ Stock adjustments
✅ Stocktaking
✅ Low-stock thresholds
✅ Out-of-stock protection
✅ Inventory ledger
✅ Stock movement history
✅ Simple stock transfers
✅ Inventory reports

### Explicitly excluded

❌ Suppliers
❌ Supplier invoices
❌ Purchasing
❌ Procurement
❌ Wastage management
❌ Damaged-stock management
❌ Recipes
❌ Ingredients
❌ Automatic ingredient deduction
❌ Complex warehouse management

---

## Stage 28 — Locked Architecture

The most important outcome is this:

```text
                    BUSINESS
                       │
             ┌─────────┴─────────┐
             │                   │
       PRODUCT CATALOGUE       BRANCHES
             │                   │
       ┌─────┴─────┐             │
       │           │             ▼
    Products    Variants      INVENTORY
       │                         │
       │                         ├── On Hand
       │                         ├── Reserved
       │                         └── Available
       │
       └──────────────┐
                      ▼
                 BUSINESS UNIT
                      │
               POS AVAILABILITY
                      │
                      ▼
                    SALE
```

**The core principle is:**

> **Products belong to the business catalogue, inventory belongs to branches, business units control operational availability, and prices are configured at branch level.**

This gives us a sufficiently generic foundation for the different industries without creating separate POS architectures for each one.
