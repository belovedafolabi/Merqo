# Stage 20 — Product, Catalog & Pricing Architecture

This stage defines the **product catalogue**, how products are assigned to branches/business units, variants, categories, SKUs, barcodes, pricing, product status, and who can manage them.

The key principle is:

> **A product is a business catalogue entity; inventory and pricing are operational entities attached to where that product is sold.**

---

## 20.1 Product Ownership

I recommend this structure:

```text
Business
│
├── Product Catalogue
│     ├── Product A
│     ├── Product B
│     └── Product C
│
├── Branch A
│     └── Business Unit
│           └── Product availability
│
└── Branch B
      └── Business Unit
            └── Product availability
```

The **business owns the catalogue**, while branches determine where products are actually available.

This is preferable to making every branch create completely independent copies of the same product.

---

# 20.2 Why This Is Important

Suppose a supermarket has:

```text
Coca-Cola Zero 50cl
```

and operates:

```text
Abuja Branch
Lagos Branch
Ibadan Branch
```

You shouldn't have three completely unrelated products:

```text
Coca-Cola Abuja
Coca-Cola Lagos
Coca-Cola Ibadan
```

Instead:

```text
Product:
Coca-Cola Zero 50cl
        │
        ├── Abuja inventory
        ├── Lagos inventory
        └── Ibadan inventory
```

This makes reporting dramatically easier.

---

# 20.3 Product Availability

A product can exist in the catalogue without being sold at every branch.

For example:

```text
Product Catalogue
│
├── Coca-Cola
├── Pepsi
├── Imported Wine
└── Industrial Drill
```

But:

```text
Abuja
├── Coca-Cola ✓
├── Pepsi ✓
├── Imported Wine ✓
└── Industrial Drill ✗
```

The system therefore needs a concept of:

> **Product availability/assignment**

---

# 20.4 Business Unit Assignment

Because of your Q23 decision, a product can only belong to **one business unit within a particular branch**.

Example:

```text
Abuja Branch
│
├── Supermarket
│     └── Coca-Cola ✓
│
└── Pharmacy
      └── Coca-Cola ✗
```

But:

```text
Lagos Branch
└── Supermarket
      └── Coca-Cola ✓
```

is perfectly valid.

---

# 20.5 Product Assignment Table

Conceptually:

```text
product_assignments
────────────────────────
id
product_id
branch_id
business_unit_id
status
created_at
updated_at
```

Unique constraint:

```text
(product_id, branch_id)
```

This enforces your rule that the same product cannot simultaneously be assigned to multiple business units within the same branch.

---

# 20.6 Product Status

Products should support:

```text
ACTIVE
INACTIVE
ARCHIVED
```

### ACTIVE

Available for normal operations.

### INACTIVE

Temporarily unavailable.

### ARCHIVED

No longer actively used but retained for historical records.

---

# 20.7 Never Delete Sold Products

This is particularly important.

Suppose:

```text
Product X
```

has appeared in:

```text
5,000 sales
```

Deleting it would break historical reporting.

Instead:

```text
Product status = ARCHIVED
```

Historical transactions continue referencing the product.

---

# 20.8 Product Creation Permissions

You specified:

* Super Admin
* Admin/Owner
* Branch Manager
* Custom Roles

can create products.

However, we need to distinguish:

### Create product

from:

### Assign product to branch

from:

### Modify price

from:

### Modify inventory

These should be separate permissions.

For example:

```text
products.create
products.edit
products.archive
products.assign
products.price.edit
inventory.adjust
```

This fits your granular RBAC architecture.

---

# 20.9 Product Information

A product should support fields such as:

```text
Name
Description
Category
Brand
SKU
Barcode
Product image
Unit of measure
Tax configuration
Status
```

Depending on the business type, some fields can be optional.

---

# 20.10 Product Categories

Categories are business-configurable.

Example:

```text
Electronics
│
├── Phones
├── Laptops
├── Televisions
└── Accessories
```

Or:

```text
Supermarket
│
├── Beverages
├── Snacks
├── Household
└── Personal Care
```

The system should not hard-code categories based on business type.

---

# 20.11 Category Hierarchy

I recommend supporting:

```text
Category
   └── Subcategory
         └── Subcategory
```

but keeping the initial implementation relatively simple.

Example:

```text
Food
└── Snacks
    └── Biscuits
```

---

# 20.12 Category Ownership

Categories belong to the client's business.

They should not belong to individual branches by default.

This allows:

```text
Business
└── Categories
```

to be reused throughout the business.

---

# 20.13 Business-Type Defaults

Although categories are configurable, onboarding can provide sensible defaults.

For example:

```text
Business Type:
Pharmacy
```

could suggest:

```text
Prescription
Pain Relief
Vitamins
Personal Care
First Aid
```

But these are merely **configuration templates**, not hard-coded limitations.

---

# 20.14 Product Variants

Variants belong to a product.

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

Each variant is independently sellable.

---

# 20.15 Variant SKU

Each variant should have its own SKU.

Example:

```text
TSH-BLK-S
TSH-BLK-M
TSH-BLK-L
```

---

# 20.16 Variant Barcode

Each variant may also have its own barcode.

This is important because scanning should identify the exact sellable item.

```text
Barcode
   ↓
Variant
   ↓
Product
   ↓
Price
   ↓
Inventory
```

---

# 20.17 Products Without Variants

Variants should be optional.

Example:

```text
Coca-Cola 50cl
```

doesn't need variants.

The system should support both:

```text
Product → directly sellable
```

and:

```text
Product
   ↓
Variants
   ↓
Sellable
```

---

# 20.18 Units of Measure

Because the POS supports different business types, we need a flexible unit system.

Examples:

```text
piece
unit
kg
g
litre
ml
meter
box
pack
dozen
```

The initial system should provide common units but allow configuration where appropriate.

---

# 20.19 Decimal Quantities

Some businesses may sell products by weight or measurement.

For example:

```text
2.5 kg
```

Therefore inventory quantities should not necessarily be restricted to integers.

The database should support appropriate decimal precision.

---

# 20.20 Pricing Architecture

You explicitly selected:

> **Pricing configurable at Branch Level.**

This is an important architectural decision.

Therefore:

```text
Product
   │
   ├── Abuja price = ₦5,000
   ├── Lagos price = ₦5,200
   └── Ibadan price = ₦4,900
```

The product itself does not need one universal selling price.

---

# 20.21 Why Branch-Level Pricing Makes Sense

Different branches may have:

* Different operating costs
* Different markets
* Different customer demographics
* Different competitive environments

So:

```text
Product
```

defines **what is being sold**.

While:

```text
Branch Product Configuration
```

defines **how it is sold at that branch**.

---

# 20.22 Pricing Table

Conceptually:

```text
product_prices
────────────────────
id
product_variant_id
branch_id
selling_price
effective_from
effective_to
created_by
created_at
updated_at
```

For the initial implementation, we can simplify this considerably if price scheduling isn't required.

---

# 20.23 Price History

Price changes should be auditable.

Example:

```text
Product X

₦5,000
↓
₦5,500
↓
₦5,750
```

The system should preserve the history.

This is important for reporting and auditing.

---

# 20.24 Scheduled Pricing

I recommend **not making scheduled pricing a core MVP feature**.

For example:

> "Change the price automatically on September 1."

is useful, but not fundamental to the POS.

It can be introduced later without redesigning the pricing architecture.

---

# 20.25 Cost Price

We should distinguish:

```text
Selling Price
```

from:

```text
Cost Price
```

Even though supplier/procurement isn't included, businesses may still want to know:

```text
Cost = ₦4,000
Selling = ₦5,000
Gross margin = ₦1,000
```

This is particularly important for your reporting/analytics requirements.

---

# 20.26 Cost Price Scope

Because purchasing is excluded, the system should treat cost price as:

> **A manually maintained business/branch product value.**

It isn't automatically calculated from supplier invoices.

---

# 20.27 Gross Profit

The reporting system can calculate:

```text
Revenue
-
Cost of goods sold
=
Gross profit
```

This requires reliable cost-price snapshots during transactions.

---

# 20.28 Important: Transaction Price Snapshot

When a sale happens, don't rely on the current product price later.

Suppose:

```text
Product price:
₦5,000
```

Customer buys it.

Tomorrow:

```text
Price → ₦6,000
```

The historical sale must still say:

```text
Sale price = ₦5,000
```

Therefore every transaction line should snapshot:

```text
unit_price
discount
tax
service_charge
final_unit_price
```

at the time of sale.

---

# 20.29 Barcode Uniqueness

Barcode should be unique across the deployment.

This prevents:

```text
Barcode 123456
     ↓
Product A
     ↓
Product B
```

which would make scanning ambiguous.

---

# 20.30 SKU Uniqueness

SKU should also be unique across the business deployment.

Example:

```text
SKU: NIKE-001
```

should identify exactly one product/variant.

---

# 20.31 Barcode Is Not the Product ID

Very important.

The barcode should **not be the primary key**.

Instead:

```text
variant_id
```

is the internal identifier.

Barcode is an external identifier used for lookup.

This gives us flexibility when a business changes a barcode.

---

# 20.32 Product Images

Businesses can upload product images.

Because you want the system to remain within a **free / ~$10 monthly infrastructure budget**, we should avoid expensive image infrastructure.

Supabase Storage is a natural fit.

Image processing should also be kept lightweight.

---

# 20.33 Business Branding

The business can configure:

```text
Logo
Primary colour
Secondary colour
Brand name
```

These values should be stored as business configuration rather than hard-coded into the application.

---

# 20.34 Product Tax

You've selected:

> Tax enabled.

The business/admin should configure the tax rate.

Example:

```text
VAT = 7.5%
```

The initial model should support a primary tax configuration without building a complex multi-tax engine.

---

# 20.35 Tax Configuration

Conceptually:

```text
business_settings
│
└── tax_configuration
      ├── enabled
      ├── name
      └── rate
```

The exact implementation will be finalized during the financial architecture stage.

---

# 20.36 Service Charge

Service charge is available to **all business types**.

It is configurable by the business administrator.

Example:

```text
Service charge:
5%
```

It can be enabled/disabled.

This is particularly useful for restaurants but shouldn't be architecturally restricted to restaurants.

---

# 20.37 Product-Level Tax Overrides

I recommend supporting a simple product-level override later if needed.

For MVP:

```text
Business tax
       ↓
Default
```

Products use the default unless explicitly configured otherwise.

This avoids unnecessary complexity.

---

# 20.38 Product Search

POS search should support:

```text
Name
SKU
Barcode
Category
Brand
```

Barcode should receive priority because it's the fastest retail workflow.

---

# 20.39 Search Performance

For a POS, product search isn't a normal dashboard query.

It is a **hot path**.

We should use appropriate indexes for:

```text
barcode
SKU
name
category
```

and avoid fetching unnecessary columns.

---

# 20.40 Product Deactivation

When a product is deactivated:

```text
Product → INACTIVE
```

it should:

* disappear from normal POS search
* not be available for new sales
* remain visible in historical transactions
* remain available in reports
* retain inventory history

---

# 20.41 Product Archiving

Archiving should be stronger than deactivation.

Example:

```text
ARCHIVED
```

means:

> This product is no longer part of active catalogue operations.

But historical references remain intact.

---

# 20.42 Deleting Products

Because you selected the recommendation for data deletion:

Transactional data should never be physically deleted.

Non-transactional catalogue data may be deleted **only when safe**.

For example, an unused category can potentially be deleted.

A product with historical sales should be archived instead.

---

# 20.43 Soft Deletion

For appropriate entities:

```text
deleted_at
deleted_by
```

can be used.

But we should **not blindly add soft deletion to everything**.

Some entities should simply be immutable or status-based.

---

# 20.44 Product Audit Trail

Changes such as:

```text
Product created
Product price changed
Product archived
Barcode changed
Category changed
Product assigned to branch
Product removed from branch
```

should generate audit events.

---

# 20.45 Product Configuration Flow

A typical creation flow:

```text
Create Product
      ↓
Basic Information
      ↓
Category
      ↓
Variants
      ↓
SKU / Barcode
      ↓
Cost / Pricing
      ↓
Assign Branch
      ↓
Assign Business Unit
      ↓
Inventory Configuration
      ↓
Activate
```

The exact UX can be optimized later.

---

# 20.46 Example — Supermarket

```text
Product:
Coca-Cola Zero 50cl

Category:
Beverages

Variant:
50cl

SKU:
CCZ-50

Barcode:
123456789

Abuja Branch:
Price ₦500
Unit: Supermarket

Lagos Branch:
Price ₦550
Unit: Supermarket
```

---

# 20.47 Example — Fashion

```text
Product:
Nike Air T-Shirt

Variants:
Black / M
Black / L
White / M
White / L

Each variant:
SKU
Barcode
Inventory
```

Prices can differ by branch.

---

# 20.48 Example — Electronics

```text
Product:
Samsung TV

Variant:
55-inch

SKU:
SAM-TV-55

Cost:
₦600,000

Abuja price:
₦700,000

Lagos price:
₦720,000
```

---

# 20.49 Example — Pharmacy

Even though prescription management is excluded:

```text
Product:
Paracetamol 500mg

Category:
Pain Relief

Variant:
20 tablets

SKU
Barcode
Price
Inventory
Tax
```

It behaves like a normal sellable product.

The POS doesn't need a pharmaceutical prescription engine.

---

# 20.50 Product Architecture Summary

| Area                                             | Decision       |
| ------------------------------------------------ | -------------- |
| Product catalogue                                | Business-owned |
| Branch availability                              | Configurable   |
| Business unit assignment                         | Yes            |
| Same product across branches                     | Yes            |
| Same product across business units in one branch | No             |
| Product variants                                 | Yes            |
| SKU                                              | Yes            |
| Barcode                                          | Yes            |
| Barcode unique                                   | Yes            |
| SKU unique                                       | Yes            |
| Categories                                       | Dynamic        |
| Category hierarchy                               | Yes            |
| Branch-level pricing                             | Yes            |
| Price history                                    | Yes            |
| Cost price                                       | Yes            |
| Product images                                   | Yes            |
| Product activation                               | Yes            |
| Product archiving                                | Yes            |
| Historical product deletion                      | No             |
| Tax                                              | Yes            |
| Service charge                                   | Yes            |
| Business branding                                | Yes            |
| Product audit trail                              | Yes            |
| Scheduled pricing                                | Not MVP        |
| Customer-specific pricing                        | No             |
| Multiple tax rates                               | No             |

---