# Stage 6 — Product & Inventory Engine

This stage defines one of the most important parts of the Dynamic POS: **how a single product system can support radically different businesses without creating separate POS implementations for each industry.**

The architectural principle should be:

> **One universal product model + configurable product capabilities + business/branch configuration.**

We should not build a "supermarket product system", "pharmacy product system", "fashion product system", etc. Instead, we build one engine that can represent all of them.

---

# 1. Product Architecture

The basic hierarchy should be:

```text
Product
│
├── Product Information
├── Category
├── Brand
├── SKU
├── Barcode(s)
├── Pricing
├── Inventory Configuration
├── Variants
├── Tax Configuration
└── Business/Branch Assignment
```

A product can represent:

```text
Coca-Cola
Paracetamol
T-Shirt
Laptop
Cement
Haircut
Hotel Room
Birthday Cake
```

The system should not care what the physical industry is.

---

# 2. Product Types

I recommend supporting these core product types:

### Stocked Product

Physical item tracked in inventory.

Examples:

```text
Coke
Laptop
Cement
Shoes
Medicine
```

### Service

A service that does not consume normal inventory.

Examples:

```text
Haircut
Hair styling
Phone repair
Hotel room service
```

### Non-Stock Item

Something sold through the POS without inventory tracking.

Examples:

```text
Delivery fee
Service charge
Packaging
Miscellaneous charge
```

This distinction will be extremely useful.

---

# 3. Product Type Architecture

Conceptually:

```text
PRODUCT
│
├── STOCKED
│
├── SERVICE
│
└── NON_STOCK
```

We should avoid creating dozens of product types.

Additional behavior should come from configuration.

---

# 4. Product Categories

You selected dynamic/admin-defined categories.

Therefore categories should not be hard-coded.

Example supermarket:

```text
Food
Beverages
Snacks
Household
```

Pharmacy:

```text
Pain Relief
Vitamins
Personal Care
```

Fashion:

```text
Shirts
Trousers
Shoes
Accessories
```

The database simply sees:

```text
Category
```

---

# 5. Category Hierarchy

I recommend allowing nested categories.

Example:

```text
Beverages
│
├── Soft Drinks
│   ├── Coke
│   └── Pepsi
│
└── Juice
    ├── Orange
    └── Apple
```

However, don't force businesses to create nested categories.

A simple category list should work perfectly well.

---

# 6. Brands

Brands should be first-class product metadata.

Example:

```text
Brand:
Samsung
```

or:

```text
Brand:
Nike
```

This enables reporting such as:

> "How much Samsung merchandise did we sell this month?"

without requiring separate product structures.

---

# 7. SKU

Every stock-tracked product should have a SKU.

Example:

```text
SKU:
COC-ZERO-50CL
```

The SKU should be unique within the relevant business/deployment.

---

# 8. Barcode

Products should support barcode scanning.

A product can have one or multiple barcodes.

Example:

```text
Product:
Coke Zero 50cl

Barcodes:
5449000000996
```

Multiple barcodes can become useful when:

* manufacturers change packaging
* businesses use internal barcodes
* different packaging has different codes

---

# 9. Barcode Uniqueness

The system should prevent duplicate barcode assignments where they would cause ambiguity.

A scan should resolve deterministically:

```text
Barcode
   ↓
Product Variant
   ↓
Add to Cart
```

not:

```text
Barcode
   ↓
Product A?
Product B?
Product C?
```

---

# 10. Internal Barcodes

The system should eventually support generating internal barcodes for products without manufacturer barcodes.

This is particularly useful for:

* bakeries
* wholesalers
* fashion stores
* businesses selling custom products

The barcode generation itself can be done without a paid service.

---

# 11. Product Variants

You selected:

> Product variants — YES.

Variants are essential for your target market.

Example:

```text
T-Shirt
│
├── Black / Small
├── Black / Medium
├── Black / Large
├── White / Small
├── White / Medium
└── White / Large
```

Each variant can have:

* SKU
* barcode
* price
* inventory
* cost

---

# 12. Variant Architecture

The important distinction:

```text
Product
   ↓
Variant
   ↓
Inventory
```

For example:

```text
Nike Air Max
```

is the product.

```text
Size 42 / Black
```

is the variant.

The inventory belongs to the variant when variants are enabled.

---

# 13. Variant Attributes

Don't hard-code:

```text
size
color
storage
```

Instead, support configurable attributes.

Examples:

### Fashion

```text
Size
Color
```

### Electronics

```text
Storage
RAM
Color
```

### Shoes

```text
Size
Color
```

### Hardware

```text
Length
Diameter
```

This makes the system genuinely dynamic.

---

# 14. Variant Limits

We should not allow arbitrary complexity.

A product should have a reasonable maximum number of variant dimensions.

For example:

```text
Color
Size
Storage
```

is reasonable.

A product with:

```text
15 variant dimensions
```

is likely a configuration problem rather than a useful POS product.

The exact limit can be established during implementation.

---

# 15. Inventory Models

You explicitly want support for different inventory models.

The engine should support:

### Quantity-based

```text
Cement:
150 bags
```

### Unit-based

```text
Laptop:
25 units
```

### Weight-based

```text
Rice:
250kg
```

### Volume-based

```text
Oil:
120L
```

### Service/non-stock

```text
Haircut:
Not inventory tracked
```

---

# 16. Units of Measurement

Units should be configurable.

Examples:

```text
piece
box
pack
kg
g
litre
ml
metre
yard
```

A business should be able to create additional units.

---

# 17. Base Unit

Every inventory product should have a base unit.

Example:

```text
Product:
Rice

Base Unit:
kg
```

The system can then support selling:

```text
5kg
```

or:

```text
500g
```

provided the conversion rules are defined.

---

# 18. Unit Conversion

For example:

```text
1 box = 24 pieces
```

The inventory engine can understand:

```text
1 box
=
24 pieces
```

This is particularly useful for wholesalers and convenience stores.

---

# 19. Keep Conversion Simple

I recommend initially supporting **fixed conversion ratios**.

Example:

```text
1 carton = 12 units
```

We should not build a complex measurement-conversion engine.

---

# 20. Branch Inventory

You selected:

> Inventory is branch-specific.

Therefore:

```text
Product
   ↓
Branch Inventory
```

Example:

```text
Coke Zero

Abuja Branch:
120

Gwarinpa Branch:
85
```

These are independent stock balances.

---

# 21. Business Unit Inventory

You selected:

> A business unit does NOT have its own inventory.

Therefore:

```text
Branch
│
├── Business Unit A
└── Business Unit B
       │
       ↓
Shared Branch Inventory
```

But sales remain associated with their respective business units.

---

# 22. Product Assignment

You also selected:

> The same product cannot exist in multiple business units.

We retain that constraint.

So:

```text
Branch
│
├── Supermarket
│    ├── Coke
│    └── Bread
│
└── Pharmacy
     ├── Paracetamol
     └── Vitamin C
```

Coke cannot simultaneously be registered as a product under the Pharmacy unit.

---

# 23. Why This Architecture Works

Inventory remains physically realistic:

```text
Branch stock
```

while the business-unit layer provides operational separation:

```text
Sales
Reports
POS configuration
Products
```

This avoids duplicating stock pools unnecessarily.

---

# 24. Inventory Ledger

Inventory should not simply have:

```text
stock_quantity = 100
```

We should also maintain inventory movements.

Example:

```text
100 Opening Stock
-10 Sale
+20 Transfer
-5 Refund
=105
```

The movement history explains how the balance was produced.

---

# 25. Inventory Movement Types

Core types:

```text
OPENING_BALANCE
SALE
REFUND
STOCK_ADJUSTMENT
TRANSFER_OUT
TRANSFER_IN
LAYAWAY_RESERVATION
LAYAWAY_RELEASE
```

We should avoid adding unnecessary movement types until a real requirement exists.

---

# 26. Stock Adjustments

Authorized users should be able to adjust stock.

Example:

```text
System:
100

Physical count:
98
```

Adjustment:

```text
-2
```

But it must require:

```text
Reason
Actor
Timestamp
Authorization
```

---

# 27. Stock Adjustment Example

```text
Adjustment:
-5

Reason:
Inventory count correction

Created by:
Branch Manager

Approved by:
Owner
```

depending on configured permissions.

---

# 28. Negative Inventory

We need a configurable setting:

```text
Allow negative inventory:
YES / NO
```

I recommend:

> **NO by default.**

A business can explicitly enable it if its operational workflow requires selling before stock is entered.

---

# 29. Why Negative Inventory Is Dangerous

If:

```text
Stock:
0
```

and a cashier sells:

```text
10
```

the system would produce:

```text
-10
```

which can destroy inventory valuation and gross-profit accuracy.

Therefore the default should be strict.

---

# 30. Low Stock

Products should support:

```text
Low Stock Threshold
```

Example:

```text
Coke:
Threshold = 20

Current:
15
```

System:

```text
LOW STOCK
```

This can trigger an in-app notification.

---

# 31. Out of Stock

When:

```text
quantity = 0
```

the product becomes:

```text
OUT_OF_STOCK
```

The POS should prevent sale if negative inventory is disabled.

---

# 32. Inventory Reservation

Because we have layaway/installments, we need to distinguish:

```text
Available Stock
Reserved Stock
Total Stock
```

Example:

```text
Physical:
100

Reserved:
20

Available:
80
```

This prevents a product committed to a layaway from being sold to someone else.

---

# 33. Layaway Reservation

When a layaway is created:

```text
Physical Stock
100

Reserved
10

Available
90
```

The reserved amount is not available for normal POS sales.

When the layaway is cancelled:

```text
Reserved
-10

Available
+10
```

---

# 34. Batch Tracking

For pharmacies and some food businesses, batch tracking is useful.

Example:

```text
Paracetamol

Batch:
PCM-2026-04

Expiry:
2028-04-30

Quantity:
100
```

This should be configurable per product.

---

# 35. Expiry Tracking

Products can optionally have expiry information.

The system can generate:

```text
Expiring Soon
Expired
```

notifications.

This is especially valuable for:

* pharmacies
* bakeries
* food retailers
* cosmetics

---

# 36. Important Scope Boundary

We should **not** implement pharmaceutical regulatory functionality.

You explicitly excluded:

* prescription management
* controlled medication tracking
* doctor information
* dosage management
* drug interaction warnings
* insurance
* pharmacist approval

Therefore batch and expiry tracking are **inventory capabilities**, not medical management.

---

# 37. Serial Number Tracking

Electronics businesses may need serial numbers.

Example:

```text
MacBook Pro

Serial:
C02ABC123
```

A serialized product should track each physical unit individually.

This allows:

```text
Sale
 ↓
Serial Number
 ↓
Customer
```

and makes returns easier.

---

# 38. Serial Number Configuration

Products can specify:

```text
Tracking:
NONE
BATCH
SERIAL
```

This is cleaner than creating separate product types.

---

# 39. Tracking Examples

### Supermarket

```text
Tracking:
NONE
```

### Pharmacy

```text
Tracking:
BATCH + EXPIRY
```

### Electronics

```text
Tracking:
SERIAL
```

### Fashion

```text
Tracking:
NONE
```

This is exactly the kind of configurability the platform needs.

---

# 40. Product Cost

Each inventory item should have a cost basis.

Example:

```text
Selling Price:
₦10,000

Average Cost:
₦6,000
```

This allows:

```text
Gross Profit:
₦4,000
```

---

# 41. Cost vs Selling Price

These must remain separate.

```text
Product
├── Cost
└── Selling Price
```

Changing the selling price must not retroactively change historical cost.

---

# 42. Pricing

You selected:

> Pricing configurable at Branch Level.

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

This is an important feature for multi-branch businesses.

---

# 43. Business Unit Pricing

You selected branch-level pricing rather than business-unit pricing.

Therefore:

```text
Branch
   ↓
Price
```

not:

```text
Business Unit
   ↓
Price
```

However, the business unit can still have different products and configuration.

---

# 44. Price History

Prices should not simply overwrite the old value.

We should maintain price history:

```text
₦1,000
   ↓
₦1,100
   ↓
₦1,200
```

This allows auditability and historical analysis.

---

# 45. Scheduled Pricing

I recommend supporting future-effective prices eventually.

Example:

```text
Current:
₦1,000

From Sept 1:
₦1,200
```

This is useful but not critical to MVP.

We should mark it as **Phase 2** unless your later requirements make it essential.

---

# 46. Product Creation Permissions

You selected:

> Super Admin, Admin, Branch Manager, Custom Roles.

We should translate that into permissions rather than hard-code the role names.

For example:

```text
product.create
product.update
product.archive
product.price.update
product.inventory.adjust
```

Roles receive those permissions.

---

# 47. Product Deletion

Products should generally not be physically deleted after transactions reference them.

Instead:

```text
ACTIVE
ARCHIVED
```

An archived product:

* cannot be newly sold
* remains in historical transactions
* remains in reports
* remains in audit history

---

# 48. Product Import

For businesses with thousands of products, manually creating everything is impractical.

We should support:

```text
CSV Import
```

Example:

```text
SKU
Product Name
Category
Brand
Barcode
Cost
Price
Stock
Unit
```

The importer should validate data before committing.

---

# 49. Import Workflow

```text
Upload CSV
    ↓
Validate
    ↓
Show Errors
    ↓
Preview
    ↓
Confirm
    ↓
Import
    ↓
Audit Log
```

No partial silent imports.

---

# 50. Product Export

Businesses should be able to export product/catalog data.

Useful formats:

```text
CSV
XLSX
```

This can be generated without paid services.

---

# 51. Product Search

The POS needs extremely fast search.

Search should support:

```text
Product name
SKU
Barcode
Brand
Category
Variant
```

For example:

```text
"coke"
```

or:

```text
"544900..."
```

or:

```text
"COC-ZERO"
```

---

# 52. Search Architecture

Because this is a POS, search should not require downloading the entire product catalog to the browser.

Use:

```text
Indexed PostgreSQL queries
```

with appropriate indexes.

For larger deployments, PostgreSQL full-text/trigram search can be introduced before considering a separate search engine.

This avoids adding another paid service.

---

# 53. Barcode Scanning

Barcode scanners should work through the browser's keyboard input behavior.

The flow:

```text
Scanner
 ↓
Barcode input
 ↓
Backend/product lookup
 ↓
Product found
 ↓
Add to cart
```

For supported phone/tablet hardware, camera-based scanning can be added as a progressive enhancement.

---

# 54. Product Images

Product images should be optional.

They are useful for:

* touchscreen POS
* tablets
* fashion
* restaurants
* salons

But the POS should remain fully usable without images.

---

# 55. Storage

Product images and business logos can use:

**Supabase Storage.**

This avoids introducing another image hosting service.

---

# 56. Product Configuration Example

A supermarket product:

```text
Product:
Coke Zero 50cl

Type:
STOCKED

Category:
Soft Drinks

Barcode:
5449...

Tracking:
NONE

Unit:
Piece

Price:
₦1,000

Inventory:
Quantity
```

---

# 57. Pharmacy Example

```text
Product:
Paracetamol 500mg

Type:
STOCKED

Category:
Pain Relief

Tracking:
BATCH

Expiry:
YES

Unit:
Pack

Price:
₦2,500

Inventory:
Quantity
```

No prescription system is involved.

---

# 58. Fashion Example

```text
Product:
Classic Polo

Type:
STOCKED

Category:
Shirts

Variants:
Color
Size

Tracking:
NONE

Price:
Branch-specific
```

---

# 59. Electronics Example

```text
Product:
iPhone 17 Pro

Type:
STOCKED

Category:
Phones

Variants:
Storage
Color

Tracking:
SERIAL

Price:
Branch-specific
```

---

# 60. Hardware Example

```text
Product:
Cement

Type:
STOCKED

Unit:
Bag

Tracking:
NONE

Quantity:
500
```

---

# 61. Salon Example

```text
Product:
Haircut

Type:
SERVICE

Inventory:
None

Price:
₦10,000
```

This sale can still go through the exact same checkout engine.

---

# 62. Hotel Example

```text
Product:
Standard Room — Night

Type:
SERVICE

Inventory:
None
```

We deliberately do not need a hotel reservation engine for the core POS.

---

# 63. Bakery Example

```text
Product:
Chocolate Cake

Type:
STOCKED

Tracking:
EXPIRY

Unit:
Piece
```

No recipe or ingredient system is required.

---

# 64. This Is the Key to the Dynamic POS

The platform isn't:

```text
IF supermarket
use supermarket system

IF pharmacy
use pharmacy system

IF restaurant
use restaurant system
```

It is:

```text
                    CORE POS
                       │
       ┌───────────────┼────────────────┐
       ↓               ↓                ↓
    Product         Inventory        Checkout
       │               │                │
       └───────────────┼────────────────┘
                       ↓
              Configuration Layer
                       │
       ┌───────────────┼────────────────┐
       ↓               ↓                ↓
    Business         Branch         Business Unit
       Type           Settings          Settings
```

This is the architectural foundation of the entire product.

---

# 65. Inventory Database Concept

The eventual schema should conceptually contain entities around:

```text
products
product_variants
product_categories
product_brands
product_barcodes

inventory_items
inventory_movements
inventory_batches
inventory_serial_numbers

units
unit_conversions

branch_prices
price_history

stock_transfers
stock_transfer_items

stock_adjustments
```

We will finalize the actual database schema later rather than prematurely locking every column.

---

# 66. Inventory Integrity

The database must enforce:

```text
Available Stock >= 0
```

unless negative inventory is explicitly enabled.

Also:

```text
Transfer Out <= Available Stock
```

and:

```text
Refund Quantity <= Previously Sold Quantity
```

and:

```text
Serial Number cannot belong to two active units
```

and:

```text
Barcode cannot ambiguously identify multiple products
```

---

# 67. Product + Inventory Architecture

The final conceptual relationship is:

```text
                    PRODUCT
                       │
             ┌─────────┴─────────┐
             ↓                   ↓
         VARIANTS             SETTINGS
             │
             ↓
      BRANCH INVENTORY
             │
       ┌─────┼──────┐
       ↓     ↓      ↓
     BATCH SERIAL  QUANTITY
             │
             ↓
      INVENTORY MOVEMENTS
```

---

# 68. Stage 6 Decisions

We can now formally establish:

| Area                    | Decision                    |
| ----------------------- | --------------------------- |
| Product types           | Stocked, Service, Non-stock |
| Categories              | Dynamic                     |
| Brands                  | Supported                   |
| SKUs                    | Supported                   |
| Barcodes                | Multiple supported          |
| Internal barcodes       | Supported                   |
| Variants                | Supported                   |
| Variant attributes      | Dynamic                     |
| Units                   | Configurable                |
| Unit conversion         | Fixed ratios                |
| Inventory               | Branch-specific             |
| Business-unit inventory | Shared branch inventory     |
| Pricing                 | Branch-level                |
| Price history           | Supported                   |
| Stock adjustments       | Supported                   |
| Stock transfers         | Yes, simple                 |
| Negative stock          | Disabled by default         |
| Low stock               | Supported                   |
| Batch tracking          | Supported                   |
| Expiry tracking         | Supported                   |
| Serial tracking         | Supported                   |
| Inventory costing       | Weighted average            |
| Product import          | CSV                         |
| Product export          | CSV/XLSX                    |
| Product deletion        | Archive                     |
| Product images          | Supabase Storage            |
| Product creation        | Permission controlled       |
| Search                  | Name/SKU/barcode/etc.       |
| Offline                 | **Completely eliminated**   |

---

## One Important Consequence

Now that we have **completely eliminated offline capability**, the architecture becomes considerably cleaner.

The POS can operate under a strong assumption:

```text
POS
 ↓
Internet
 ↓
Application
 ↓
Supabase/PostgreSQL
```

There is no:

* offline database
* sync engine
* conflict resolution
* local transaction queue
* duplicate offline transaction reconciliation
* offline inventory reservation

That removes a significant amount of architectural complexity and makes the concurrency model much safer.

---
