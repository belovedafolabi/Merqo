# Stage: Functional Specification — Part 1

## Authentication, Onboarding, Organization & Business Structure

We will now start converting the decisions you've made into **actual PRD-level functional requirements**.

One important architectural principle will govern everything below:

> **The POS is a configurable business platform, but each client receives an independent deployment.**

There is therefore **no shared multi-tenant runtime** between clients.

---

# 1. Authentication & Account Management

## 1.1 Authentication

The system will use:

* Email/password authentication
* Supabase Auth
* Session-based authentication
* Secure session refresh
* Password reset
* Email verification
* Account activation/deactivation

The system will **not** support:

* Google OAuth
* Microsoft OAuth
* MFA/2FA
* Biometric authentication

---

## 1.2 Initial Account Creation

The initial person creating a client installation becomes the:

> **Owner**

The Owner is the highest-level client administrator.

The flow:

```text
Create Account
      ↓
Verify Email
      ↓
Business Setup
      ↓
Create Organization
      ↓
Configure Business
      ↓
Create Branch
      ↓
Create Business Unit
      ↓
Configure POS
      ↓
Dashboard
```

---

# 2. Organization

Although the deployment belongs to a single client, we should still maintain an explicit **Organization** entity.

Conceptually:

```text
Organization
│
├── Users
├── Branches
├── Business Units
├── Products
├── Customers
├── Sales
├── Inventory
├── Reports
├── Settings
└── Subscription
```

This gives the application a clean root entity.

---

# 3. Organization Profile

The Owner should configure:

* Business name
* Business type(s)
* Logo
* Primary color
* Secondary color
* Contact information
* Business address
* Currency
* Tax configuration
* Timezone
* Default settings

The system should be designed so these values can be changed later.

---

# 4. Business Type

We've established an important distinction:

> **Business type is a classification/configuration concept, not the actual organizational structure.**

Examples:

```text
Supermarket
Restaurant
Pharmacy
Hotel
Bakery
Clothing Store
Electronics Store
Hardware Store
Beauty Salon
Wholesaler
General Retail
Other
```

A business may select multiple applicable types.

For example:

```text
ABC Enterprises

Business Types:
✓ Supermarket
✓ Pharmacy
```

This selection influences recommended functionality.

It does **not** mean the organization becomes two separate businesses.

---

# 5. Capability-Based Architecture

Business type should feed into a **capability configuration system**.

Example:

```text
Business Type
      ↓
Recommended Capabilities
      ↓
Owner reviews
      ↓
Enabled Capabilities
      ↓
UI + permissions + workflows
```

For example:

### Supermarket

Automatically recommend:

* Barcode scanning
* Inventory
* Product variants
* Stock alerts
* Customer management

### Restaurant

Recommend:

* Takeaway
* Delivery
* Kitchen operations
* Meal combos
* Tips

### Pharmacy

Recommend:

* Batch/expiry management
* Product tracking
* Pharmacist role

However, the underlying system remains the same.

---

# 6. Business Units

This is one of the most important concepts in the entire system.

The hierarchy will be:

```text
Organization
   │
   ├── Branch
   │     │
   │     ├── Business Unit
   │     └── Business Unit
   │
   └── Branch
         │
         └── Business Unit
```

Example:

```text
ABC Enterprises
│
├── Abuja Branch
│    ├── Supermarket
│    └── Pharmacy
│
└── Lagos Branch
     └── Supermarket
```

---

# 7. Business Unit Definition

A **Business Unit** represents an operational business within a branch.

Examples:

* Supermarket
* Pharmacy
* Restaurant
* Bakery
* Juice Bar
* Electronics section

It is **not merely a category**.

It has its own operational configuration.

---

# 8. Business Unit Configuration

Each business unit can have its own:

* POS configuration
* Enabled capabilities
* Product catalog
* Inventory
* Tax/service-charge settings where applicable
* Receipt configuration
* Payment defaults
* Operational settings

This supports your example:

> A supermarket and pharmacy can operate inside the same physical branch while remaining operationally distinct.

---

# 9. Business Unit Inventory

Your decision for Q21 was:

> **Business unit does not have completely independent inventory ownership.**

The system should therefore treat inventory primarily at the **branch level**, while maintaining business-unit context for operational usage.

Conceptually:

```text
Branch
│
└── Inventory
      │
      ├── Product A
      ├── Product B
      └── Product C
```

But the POS knows which business unit is performing the transaction.

This gives us flexibility without creating unnecessary inventory silos.

---

# 10. Product Ownership

You made an explicit decision:

> **The same product cannot exist in multiple business units.**

Therefore product assignment must be controlled.

Example:

```text
Product
Coca-Cola 50cl

Business Unit:
Abuja Supermarket
```

It cannot simultaneously belong to:

```text
Abuja Pharmacy
```

within the same deployment.

---

# 11. Branches

An organization can create multiple branches.

Each branch has:

* Name
* Code
* Address
* Contact information
* Status
* Business units
* Inventory context
* Users
* POS configuration

Example:

```text
ABC Enterprises

Branches:
├── Abuja
├── Lagos
└── Port Harcourt
```

---

# 12
# Stage: Functional Specification — Part 2

## Branches, Business Units, POS Configuration & Operational Context

We continue directly from the previous section. The objective here is to turn the organizational structure into precise behavior that developers can implement.

---

# 13. Branch Creation

Only users with the appropriate permission can create branches.

Default:

> **Owner**

can create branches.

The Owner may delegate this capability through custom permissions.

### Required fields

```text
Branch Name *
Branch Code *
Address *
Phone
Email
Status
```

The system should automatically generate:

* Branch ID
* Creation timestamp
* Created-by user

---

# 14. Branch Code

Every branch must have a unique code within the organization.

Example:

```text
ABJ
LAG
PHC
```

The code can be used in:

* Reports
* Transaction references
* Internal identification
* Inventory records

Example transaction:

```text
ABJ-20260821-000123
```

The exact transaction-numbering strategy will be finalized in the transaction architecture section.

---

# 15. Branch Status

A branch can be:

```text
ACTIVE
INACTIVE
ARCHIVED
```

### Active

Normal operations.

### Inactive

The branch exists but operational activity is disabled.

### Archived

The branch is retained for historical records but cannot be used for new operations.

Transactional history must remain intact.

---

# 16. Deleting Branches

Branches should **not be hard deleted** once they contain meaningful operational data.

Instead:

```text
Active
 ↓
Deactivate
 ↓
Archive
```

This follows the previously established principle that historical transactional data must remain immutable.

---

# 17. Business Unit Creation

A branch can contain multiple business units.

Example:

```text
Abuja Branch

├── Supermarket
├── Pharmacy
└── Juice Bar
```

The Owner or appropriately authorized administrator can create one.

Required information:

```text
Business Unit Name *
Business Type *
Code *
Description
Status
```

---

# 18. Business Unit Code

Each business unit should have a unique code within its branch.

Example:

```text
SUP
PHM
JCB
```

This allows operational records to be identified clearly.

Example:

```text
ABJ-SUP
ABJ-PHM
```

---

# 19. Business Unit Status

Same principle as branches:

```text
ACTIVE
INACTIVE
ARCHIVED
```

An inactive business unit cannot:

* Process new sales
* Create new inventory movements
* Create new operational transactions

But its historical records remain accessible according to permissions.

---

# 20. Business Unit POS Configuration

You explicitly decided:

> **Yes, each business unit should have its own POS configuration.**

Therefore POS configuration should be stored against the business unit.

Examples:

```text
Default payment method
Receipt template
Tax settings
Service charge
Discount rules
POS layout/preferences
Enabled capabilities
```

---

# 21. Default Payment Method

The business unit can select one default payment method.

Available:

```text
Cash
Card
Bank Transfer
```

Example:

```text
Default Payment Method
[ Cash ▼ ]
```

When the cashier reaches checkout, Cash is preselected.

The cashier can still choose another enabled method.

---

# 22. Enabled Payment Methods

The administrator should be able to configure:

```text
☑ Cash
☑ Card
☑ Bank Transfer
```

At least one must remain enabled.

The system should prevent:

> disabling the final available payment method.

---

# 23. POS Configuration Scope

We need to distinguish:

### Global organization settings

Examples:

* Business name
* Branding
* Organization contact information

### Branch settings

Examples:

* Branch address
* Branch operational configuration
* Branch pricing

### Business-unit settings

Examples:

* POS configuration
* Enabled capabilities
* Default payment method
* Receipt configuration

This prevents settings from becoming ambiguous.

---

# 24. Configuration Inheritance

The system should use a controlled inheritance model.

Conceptually:

```text
Organization Default
        ↓
Branch Configuration
        ↓
Business Unit Configuration
```

However:

> **The more specific configuration wins.**

Example:

```text
Organization tax = 7.5%

Branch override = 5%

Business Unit override = 7.5%
```

Effective value:

```text
7.5%
```

This should be visible to administrators so they know where a configuration originated.

---

# 25. Configuration Resolution

Developers should not scatter logic such as:

```text
if branch.tax exists...
if businessUnit.tax exists...
```

throughout the application.

Instead, configuration resolution should be centralized.

Conceptually:

```text
getEffectivePOSConfig(
    organizationId,
    branchId,
    businessUnitId
)
```

This becomes especially important as the platform grows.

---

# 26. Business Capability Configuration

Each business unit should have a set of enabled capabilities.

Example:

```text
Capabilities

Inventory
✓

Barcode Scanning
✓

Store Credit
✓

Layaway
✓

Service Charge
✓

Restaurant Ordering
✗

Kitchen Operations
✗
```

---

# 27. Capability vs Permission

These must remain separate.

### Capability

Determines whether the **feature exists**.

Example:

```text
Kitchen Operations = OFF
```

### Permission

Determines **who can use it**.

Example:

```text
Kitchen Operations = ON

Cashier → No access
Kitchen Staff → Access
Manager → Access
```

Therefore:

```text
Capability
      +
Permission
      =
Effective Feature Access
```

This is a critical architectural distinction.

---

# 28. Capability Dependencies

Some capabilities may require others.

Example:

```text
Layaway
   ↓
Customer Management
```

Therefore the system should not allow:

```text
Customer Management = OFF
Layaway = ON
```

unless the dependency is explicitly handled.

The system should either:

1. automatically enable the dependency, or
2. tell the administrator that it is required.

I recommend **option 2** because it keeps configuration intentional.

---

# 29. Business Type Recommendations

Business types should provide **recommendations**, not hard-coded restrictions.

For example:

```text
Business Type: Restaurant

Recommended:
✓ Customer Management
✓ Service Charge
✓ Tips
✓ Takeaway
✓ Delivery
✓ Kitchen Operations
```

The Owner can then accept or modify the configuration.

---

# 30. Changing Business Type

The business type should be editable after onboarding.

Changing the type should **not delete existing data**.

Example:

```text
Supermarket
      ↓
Supermarket + Pharmacy
```

The system should offer:

> Review recommended capabilities

rather than automatically changing operational settings.

---

# 31. Switching Business Units

Authorized users should be able to switch business units.

Example:

```text
Current:
Abuja → Supermarket

Switch to:
Abuja → Pharmacy
```

After switching, the system updates the operational context.

---

# 32. Context Isolation

When a user switches business units, all queries must respect:

```text
organization_id
branch_id
business_unit_id
```

This prevents a user operating in:

```text
Abuja Pharmacy
```

from accidentally seeing or modifying:

```text
Lagos Supermarket
```

data.

This must be enforced at the **database authorization level**, not merely through frontend filtering.

---

# 33. User Assignment

A user can be associated with:

* Organization
* Branch
* Business Unit

Example:

```text
John
Role: Cashier

Branch:
Abuja

Business Unit:
Supermarket
```

Another employee could be:

```text
Jane
Role: Pharmacist

Branch:
Abuja

Business Unit:
Pharmacy
```

---

# 34. Multi-Business-Unit Users

The system should support users working across multiple business units **where explicitly authorized**.

Example:

```text
Manager
│
├── Abuja Supermarket
└── Abuja Pharmacy
```

The user should then have a business-unit selector.

However, their permissions must be evaluated within the current context.

---

# 35. Branch Manager Scope

A Branch Manager should normally be restricted to their assigned branch.

Example:

```text
Branch Manager
        ↓
Abuja Branch
        ↓
Supermarket
Pharmacy
Juice Bar
```

They should not automatically have access to:

```text
Lagos Branch
```

unless explicitly granted.

---

# 36. Owner Scope

The Owner has organization-wide administrative access.

Therefore:

```text
Owner
 ↓
Organization
 ├── Branch A
 ├── Branch B
 └── Branch C
```

They can manage the entire deployment subject to system-level restrictions.

---

# 37. Super Admin Scope

The Super Admin sits outside the client organization's normal authorization hierarchy.

Conceptually:

```text
SUPER ADMIN
     │
     ├── Organization A
     ├── Organization B
     ├── Organization C
     └── Platform
```

And, as you've specified:

> **Super Admin access is untethered from client subscription status.**

---

# 38. POS Context Header

The POS should always display the current operational context.

Example:

```text
ABC Enterprises
Abuja Branch
Supermarket
```

This is important because a cashier should immediately know which business unit they are selling from.

---

# 39. Preventing Context Mistakes

Before completing a sale, the system should know:

```text
Current User
Current Branch
Current Business Unit
Current POS/Register Context
```

These values should be attached to the transaction automatically.

The cashier should not manually enter them.

---

# 40. Switching Context During an Active Sale

A user should **not be able to switch business units while a cart contains products** without explicitly handling the cart.

Recommended behavior:

```text
Cart contains items
        ↓
User attempts context switch
        ↓
Warning
        ↓
"Clear cart before switching?"
```

This prevents products from one business unit being accidentally sold under another.

---

# 41. Branch-Level Pricing

You've chosen:

> **Pricing configurable at branch level.**

Therefore the effective product price should be resolved using:

```text
Product
 ↓
Branch Price
 ↓
Business Unit POS
 ↓
Current Sale
```

The POS should always use the price applicable to the current branch.

---

# 42. Price Changes

Price changes should be auditable.

Record:

```text
Product
Old Price
New Price
Branch
Changed By
Changed At
Reason (if required)
```

Historical sales must continue displaying the price that existed when the sale occurred.

---

# 43. Stock Transfers

You approved stock transfers, but requested a simple implementation.

The workflow:

```text
Branch A
   ↓
Create Transfer
   ↓
Select Product
   ↓
Enter Quantity
   ↓
Select Branch B
   ↓
Confirm
```

No complex procurement workflow is required.

---

# 44. Transfer States

Use only:

```text
PENDING
COMPLETED
CANCELLED
```

Avoid introducing unnecessary logistics states at this stage.

---

# 45. Transfer Authorization

A permission should control who can create transfers.

Example:

```text
Inventory
 ├── View
 ├── Adjust
 ├── Transfer
 └── Approve Transfer
```

For the initial implementation, we can keep transfer approval simple:

> authorized transfer users can complete transfers.

A more complex two-person approval workflow is unnecessary unless later required.

---

# 46. Business Structure — Final Model

At this point, our organizational model is:

```text
                    SUPER ADMIN
                         │
              ┌──────────┴──────────┐
              │                     │
        Client Deployment       Client Deployment
              │
          ORGANIZATION
              │
       ┌──────┴──────┐
       │             │
    BRANCH         BRANCH
       │
   ┌───┴────────┐
   │            │
Business Unit  Business Unit
   │
   ├── POS Configuration
   ├── Capabilities
   └── Operational Context
```

With:

```text
Inventory → Branch-oriented
Pricing → Branch-oriented
POS configuration → Business-unit-oriented
Products → Business-unit-specific
Users → permission/context controlled
```

---

# 47. Architectural Principle Established

This gives us an important foundation for the rest of the PRD:

> **The application should never determine functionality solely from business type.**

Instead:

```text
Business Type
      ↓
Recommended Configuration
      ↓
Enabled Capabilities
      ↓
RBAC Permissions
      ↓
Current User Context
      ↓
Effective Functionality
```

This is what will allow the same POS platform to support a supermarket, pharmacy, restaurant, hotel, clothing store, or a combination of business operations without creating completely separate applications.

---

# Stage: Functional Specification — Part 3

## Product & Catalog System

The Product System will be the foundation for **POS, inventory, pricing, barcode scanning, reporting, returns, stock transfers, and business-specific workflows**.

The key architectural principle is:

> **A product is a reusable catalog definition, while its stock and price are contextual to the branch where it is sold.**

However, based on your explicit Q23 decision, a product **cannot be assigned to multiple business units**.

---

# 48. Product Entity

Every product should have a core record containing:

```text
Product
├── Identity
├── Classification
├── Pricing
├── Inventory configuration
├── Tax configuration
├── Barcode/SKU
├── Variants
├── Images
├── Status
└── Audit metadata
```

---

# 49. Product Identity

Required:

* Product name
* Product SKU
* Business unit
* Category

Optional:

* Description
* Brand
* Product image
* Internal notes

Example:

```text
Product Name:
Coca-Cola Zero Sugar 50cl

SKU:
CCZ-050

Business Unit:
Abuja Supermarket

Category:
Soft Drinks
```

---

# 50. SKU

Every product should have a unique SKU.

The SKU should be unique within the deployment.

Example:

```text
CCZ-050
IPH15-128
TSH-BLK-L
HAM-16OZ
```

The system should allow administrators to:

* manually define SKUs
* optionally generate SKUs automatically

---

# 51. SKU Validation

The system must prevent duplicate SKUs.

If a user enters:

```text
CCZ-050
```

and it already exists:

> **This SKU is already in use.**

The system should identify where appropriate which product owns it.

---

# 52. Barcode

Products can have a barcode.

Support common barcode formats through a flexible string field rather than hard-coding one barcode standard.

Examples:

* EAN
* UPC
* Code 128
* internally generated barcodes

Barcode uniqueness should be enforced.

---

# 53. Multiple Barcodes

A product may optionally have multiple barcodes.

This is useful when:

* different packaging uses different codes
* imported products have alternate codes
* variants have separate codes

Example:

```text
Coca-Cola 50cl
│
├── Barcode A
└── Barcode B
```

However, each barcode must uniquely identify one sellable product/variant.

---

# 54. Barcode Scanning

The POS scanner workflow:

```text
Scan
 ↓
Barcode lookup
 ↓
Product/variant identified
 ↓
Add to cart
```

The lookup should prioritize exact barcode matching.

The POS should not require the cashier to manually submit a search after scanning.

---

# 55. Product Categories

Categories are dynamic and administrator-defined.

Example:

```text
Food
 ├── Snacks
 ├── Bread
 └── Canned Food

Beverages
 ├── Soft Drinks
 ├── Water
 └── Juice
```

The system should support hierarchical categories.

---

# 56. Category Hierarchy

Categories can have:

```text
Parent
Child
Grandchild
```

But there should be a sensible depth limit to avoid creating unnecessarily complex catalog trees.

Recommended:

> Maximum 3–4 levels.

---

# 57. Category Deletion

Categories should not be hard-deleted if products currently reference them.

Instead:

```text
Active
 ↓
Inactive
```

Products can then be reassigned.

---

# 58. Brands

The product system should support optional brands.

Example:

```text
Brand:
Coca-Cola
```

This allows filtering and reporting by brand without making brand mandatory.

---

# 59. Product Variants

You explicitly approved product variants.

Variants represent distinct sellable versions of a product.

Example:

```text
T-Shirt
│
├── Black / Small
├── Black / Medium
├── Black / Large
├── White / Small
└── White / Medium
```

---

# 60. Variant Attributes

The system should support configurable variant attributes.

Examples:

```text
Size
Color
Storage
Capacity
Model
Weight
```

The product configuration can define which attributes are relevant.

---

# 61. Variant SKU

Each independently sellable variant should have its own SKU.

Example:

```text
Product:
Nike T-Shirt

Variant:
Black / Large

SKU:
NKTS-BLK-L
```

---

# 62. Variant Barcode

Variants may have separate barcodes.

Example:

```text
Black / Medium → 123456789
Black / Large  → 123456790
```

Scanning the barcode should directly identify the correct variant.

---

# 63. Variant Pricing

Variants may have different prices.

Example:

```text
T-Shirt

Small   ₦15,000
Medium  ₦15,000
Large   ₦16,000
XL      ₦17,000
```

If no variant-specific price is defined, the product's applicable branch price may be used.

---

# 64. Product Images

Products should support images.

At minimum:

* Primary image
* Additional images

The POS should not require images to function.

This is important because businesses may have thousands of products where images are unnecessary.

---

# 65. Product Status

Products should support:

```text
ACTIVE
INACTIVE
ARCHIVED
```

### Active

Available for normal operations.

### Inactive

Temporarily unavailable for sale.

### Archived

Retained historically but removed from normal catalog operations.

---

# 66. Product Deletion

Products should generally not be physically deleted once they have participated in transactions.

Instead:

```text
Product
 ↓
Archive
```

This preserves historical sales data.

---

# 67. Product Creation Permissions

You explicitly specified:

> Super Admin, Admin, Branch Manager and Custom Roles

can create products.

Therefore permissions should be:

```text
Products
├── View
├── Create
├── Edit
├── Archive
├── Manage Pricing
├── Manage Inventory
└── Manage Categories
```

A custom role can receive any permitted combination.

---

# 68. Product Editing

Editing should distinguish between **catalog information** and **historical transaction information**.

Allowed:

* Name
* Description
* Category
* Image
* Active status

Should not alter historical:

* Sale price on completed transactions
* Quantity sold
* Transaction totals

---

# 69. Product Pricing

You selected:

> **Branch-level pricing**

Therefore the system should maintain pricing context.

Conceptually:

```text
Product
   │
   ├── Abuja Branch → ₦700
   ├── Lagos Branch → ₦750
   └── PH Branch → ₦725
```

---

# 70. Price History

Every price change should create a historical record.

Example:

```text
Coca-Cola

₦650
↓
₦700
↓
₦750
```

Each change records:

```text
Old Price
New Price
Branch
Changed By
Timestamp
```

---

# 71. Cost Price

Products should support cost price.

This enables:

* gross profit reporting
* margin calculations
* inventory valuation

Example:

```text
Cost Price: ₦500
Selling Price: ₦700

Gross Margin:
₦200
```

Cost price should not necessarily be visible to cashiers.

---

# 72. Inventory Tracking Models

You requested support for different inventory models.

The product system should therefore support configurable tracking.

### Model A — Non-inventory product

Example:

* Service
* Haircut
* Consultation

Stock is not tracked.

---

### Model B — Quantity-based inventory

Example:

```text
Coca-Cola
Stock: 124
```

---

### Model C — Batch-tracked inventory

Useful for:

* pharmaceuticals
* cosmetics
* food
* products with expiry

The stock is divided into batches.

Example:

```text
Product:
Paracetamol

Batch A
Quantity: 100
Expiry: 2027-03

Batch B
Quantity: 150
Expiry: 2028-01
```

---

### Model D — Serial-number inventory

Useful for:

* phones
* laptops
* electronics
* high-value equipment

Example:

```text
iPhone 17

Serial:
ABC123
ABC124
ABC125
```

Each serial represents an individually identifiable unit.

---

# 73. Expiry Tracking

Expiry tracking should be configurable per product.

For example:

```text
Track expiry?
☑ Yes
```

This is particularly useful for pharmacies and businesses selling perishable goods.

The system can then generate:

* Expiring soon
* Expired
* Expiry inventory reports

---

# 74. Batch Tracking

Batch information should include:

```text
Batch Number
Quantity
Manufacturing Date
Expiry Date
Cost
```

Not every product requires batch tracking.

---

# 75. Inventory Model Selection

Product creation could expose:

```text
Inventory Tracking

○ Don't track inventory
○ Track quantity
○ Track batches
○ Track serial numbers
```

The selected model affects later inventory operations.

---

# 76. Unit of Measurement

Products should support units such as:

```text
Piece
Pack
Box
Carton
Bottle
Kilogram
Gram
Litre
Millilitre
Metre
```

The system should support custom units where necessary.

---

# 77. Selling Unit

A product should define its selling unit.

Example:

```text
Product:
Rice

Selling Unit:
Kg
```

or:

```text
Product:
Coca-Cola

Selling Unit:
Bottle
```

---

# 78. Pack/Unit Relationship

For businesses like wholesalers, the system may need:

```text
1 Carton = 24 Bottles
```

This should be supported without introducing a full procurement system.

Example:

```text
Selling:
1 bottle → ₦700

Pack:
24 bottles → ₦16,000
```

This will require careful inventory conversion rules.

---

# 79. Tax Configuration

Tax is enabled in your system.

A product can inherit the applicable tax configuration.

The administrator defines the tax rate.

For example:

```text
Tax:
VAT

Rate:
7.5%
```

Because you chose a single tax-rate model rather than multiple simultaneous tax rates, a sale should resolve to one effective tax configuration.

---

# 80. Service Charge

Service charge is a global capability available to businesses.

It can be enabled/disabled by an administrator.

Example:

```text
Subtotal      ₦20,000
Tax            ₦1,500
Service Charge ₦2,000
──────────────────────
Total         ₦23,500
```

The exact calculation behavior will be specified in the transaction/financial section.

---

# 81. Product Search

POS search should support:

* Product name
* SKU
* Barcode
* Variant
* Category

Search should be optimized for rapid results.

---

# 82. Search Behavior

If a cashier types:

```text
coke
```

results should appear immediately.

If they enter:

```text
CCZ-050
```

the exact SKU should be prioritized.

If they scan:

```text
123456789
```

the exact barcode should resolve immediately.

---

# 83. Product Filters

Management catalog screens should support:

```text
Category
Brand
Status
Inventory model
Stock status
Business unit
Branch
```

The POS should keep filtering much simpler to avoid slowing down checkout.

---

# 84. Bulk Product Import

Because clients may have thousands of products, manually creating every product would be impractical.

The system should support CSV-based import.

Workflow:

```text
Download Template
      ↓
Fill CSV
      ↓
Upload
      ↓
Validate
      ↓
Preview Errors
      ↓
Confirm Import
```

---

# 85. Import Validation

The system should detect:

* duplicate SKU
* duplicate barcode
* missing product name
* invalid price
* invalid category
* invalid inventory model
* malformed data

The import should provide row-level errors.

Example:

```text
Row 24
❌ Barcode already exists

Row 31
❌ Invalid inventory model
```

---

# 86. Bulk Export

Authorized users should be able to export product information.

Potential formats:

* CSV
* Excel-compatible CSV

The export must respect the user's access scope.

---

# 87. Product Audit History

The system should record important changes.

Example:

```text
Product: Coca-Cola

08:31
Price changed
₦650 → ₦700
By: John

09:10
Category changed
Drinks → Soft Drinks
By: Mary
```

---

# 88. Product Notes

Internal notes may be supported for administrators.

These should not automatically appear on:

* receipts
* customer-facing screens
* POS product tiles

---

# 89. Product Validation Rules

At minimum:

### Name

Required.

### SKU

Required and unique.

### Barcode

Optional but unique when provided.

### Price

Must not be negative.

### Cost

Must not be negative.

### Category

Must reference an active valid category.

### Business Unit

Required.

### Inventory model

Required.

---

# 90. Product Creation Example

A supermarket administrator creates:

```text
Product:
Coca-Cola Zero Sugar

SKU:
CCZ-050

Barcode:
5449000000996

Category:
Soft Drinks

Unit:
Bottle

Inventory:
Quantity tracked

Cost:
₦500

Branch price:
₦700

Tax:
7.5%

Business Unit:
Abuja Supermarket
```

The POS can immediately sell it.

---

# 91. Pharmacy Example

A pharmacy creates:

```text
Product:
Paracetamol 500mg

SKU:
PCM-500

Category:
Analgesics

Inventory:
Batch tracked

Expiry:
Enabled

Unit:
Pack

Cost:
₦500

Selling Price:
₦750

Business Unit:
Abuja Pharmacy
```

No prescription workflow is required because you explicitly excluded prescription management.

---

# 92. Clothing Example

A clothing store creates:

```text
Product:
Classic T-Shirt

Category:
Shirts

Variants:
Black / S
Black / M
Black / L
White / S
White / M
White / L

Inventory:
Quantity tracked
```

Each variant can have its own stock and barcode.

---

# 93. Electronics Example

An electronics store creates:

```text
Product:
Samsung Galaxy

Inventory:
Serial-number tracked

Variants:
128GB
256GB
```

Each individual unit can therefore be identified.

---

# 94. Service Example

A salon creates:

```text
Product:
Haircut

SKU:
SERV-HC-001

Inventory:
Not tracked

Price:
₦5,000
```

This is important because the platform should not assume everything being sold is physical inventory.

---

# 95. Product Architecture Summary

The resulting model is:

```text
                    PRODUCT
                       │
          ┌────────────┼────────────┐
          │            │            │
       Catalog       Pricing     Inventory
          │            │            │
       Category      Branch      Tracking
       Brand         Price       Model
       Images        History     Batch
       Variants                  Serial
                                  │
                                  ↓
                                POS
```

---

# 96. Critical Design Decision

The product system should **not contain business-specific code such as**:

```text
if pharmacy...
if supermarket...
if restaurant...
```

Instead:

```text
Product
 +
Capabilities
 +
Inventory Model
 +
Business Unit Configuration
```

determine behavior.

That is what keeps the platform genuinely dynamic.

---

# Stage: Functional Specification — Part 4

## Inventory Management System

This section defines how the POS will track, modify, reconcile, transfer, and report inventory.

The central rule is:

> **Inventory is branch-level, while products are assigned to a single business unit within the deployment.**

There will be **no offline inventory synchronization**, because you explicitly eliminated offline capability.

This is actually beneficial for inventory integrity: every sale, refund, adjustment, and transfer can be validated against the current server-side inventory state.

---

# 98. Inventory Architecture

Inventory should not simply be represented as:

```text
product.stock = 50
```

That approach becomes problematic once we introduce:

* multiple branches
* variants
* batches
* serial numbers
* refunds
* stock transfers
* concurrent cashiers
* inventory adjustments
* audit history

Instead, the system should maintain both:

### Current inventory state

```text
Product
+
Branch
+
Current Quantity
```

and:

### Inventory movement history

```text
Every addition
Every deduction
Every adjustment
Every transfer
Every restoration
```

Conceptually:

```text
                    INVENTORY
                        │
              ┌─────────┴─────────┐
              │                   │
        Current Balance       Movements
              │                   │
          Quantity          ┌─────┼─────┐
                            │     │     │
                           Sale  Refund Transfer
                                  │
                              Adjustment
```

---

# 99. Branch-Level Inventory

Inventory belongs to a branch.

Example:

```text
Coca-Cola

Abuja Branch
Stock: 120

Lagos Branch
Stock: 85

Port Harcourt Branch
Stock: 43
```

A sale in Abuja must not reduce Lagos inventory.

---

# 100. Business Unit Context

Although inventory is branch-level, every inventory movement should still know the business unit involved.

Example:

```text
Branch:
Abuja

Business Unit:
Supermarket

Product:
Coca-Cola

Movement:
-2

Reason:
Sale
```

This gives us reporting and audit context without creating completely separate inventory systems for every business unit.

---

# 101. Inventory Record

An inventory record should conceptually contain:

```text
Inventory
├── Product / Variant
├── Branch
├── Quantity
├── Reserved Quantity
├── Available Quantity
├── Reorder Level
├── Tracking Model
└── Timestamps
```

Where:

```text
Available Quantity
=
Quantity
-
Reserved Quantity
```

For the initial POS implementation, reservation functionality can remain minimal unless a feature such as layaway requires it.

---

# 102. Inventory Tracking Models

The product's selected inventory model determines how inventory is handled.

### Non-tracked

No quantity management.

### Quantity tracked

Example:

```text
Coca-Cola
Quantity = 100
```

### Batch tracked

Example:

```text
Paracetamol

Batch A = 100
Batch B = 150
```

### Serial tracked

Example:

```text
Laptop

Serial ABC001
Serial ABC002
Serial ABC003
```

---

# 103. Stock Addition

Stock can be added through authorized inventory adjustments.

Because procurement/suppliers are intentionally outside the system, the system should not pretend that it has a purchasing module.

Instead:

> **Stock Adjustment — Increase**

can be used when stock enters the system.

Required:

```text
Product
Branch
Quantity
Reason
User
Timestamp
```

Example:

```text
Product: Coca-Cola
Quantity: +50
Reason: Initial stock entry
```

---

# 104. Stock Deduction

Stock can be deducted through:

* Completed sales
* Inventory adjustments
* Stock transfers
* Other explicitly supported inventory operations

A normal sale should automatically create the deduction.

Cashiers should not manually reduce inventory after a sale.

---

# 105. Sale → Inventory Flow

For a normal quantity-tracked product:

```text
Add Product
      ↓
Checkout
      ↓
Payment confirmed
      ↓
Sale completed
      ↓
Inventory deducted
      ↓
Inventory movement recorded
```

The sale and inventory deduction should occur as one atomic operation.

---

# 106. Inventory Transaction Atomicity

This is extremely important.

The system must not allow:

```text
Sale created
✓

Payment recorded
✓

Inventory deduction
✗
```

leaving the system inconsistent.

Likewise:

```text
Inventory deducted
✓

Sale creation
✗
```

must not occur.

The database transaction should ensure that the complete operation succeeds or fails together.

---

# 107. Concurrency Protection

You explicitly requested concurrency checks.

Consider:

```text
Stock = 1
```

Cashier A and Cashier B scan the same product simultaneously.

Without proper concurrency handling:

```text
Cashier A sees 1
Cashier B sees 1

A sells → 0
B sells → -1
```

or both believe they successfully purchased the final unit.

The backend must therefore perform the final stock validation **at transaction time**, not merely when the product is added to the cart.

---

# 108. Server-Side Inventory Validation

The frontend may display:

```text
Stock available: 1
```

but this is only informational.

At checkout:

```text
BEGIN TRANSACTION

Lock/validate inventory

Check quantity

Deduct quantity

Create sale

Create sale items

Create inventory movement

COMMIT
```

If inventory is no longer sufficient:

```text
ROLLBACK
```

and return:

> **Insufficient stock. The available quantity has changed.**

---

# 109. No Negative Stock by Default

Recommended default:

> **Negative inventory is disabled.**

If stock is:

```text
0
```

the system should prevent a normal sale.

This protects inventory accuracy.

If we later decide some businesses need negative stock, that can become an administrator-controlled capability.

But it should **not** be the default.

---

# 110. Low Stock Threshold

Each inventory item can have a reorder/low-stock threshold.

Example:

```text
Product:
Coca-Cola

Current:
12

Low-stock threshold:
20
```

The system should classify it as:

> Low Stock

---

# 111. Out-of-Stock

When:

```text
Quantity = 0
```

the product becomes:

> Out of Stock

The POS should prevent normal sale unless an authorized configuration explicitly allows otherwise.

---

# 112. Low-Stock Notifications

The notification system can generate:

```text
Low stock:
Coca-Cola 50cl
Abuja Branch
Current quantity: 12
Threshold: 20
```

Notifications can appear:

* In-app
* Email

according to your notification configuration.

---

# 113. Inventory Adjustments

Authorized users can perform manual adjustments.

Two fundamental operations:

```text
Increase
Decrease
```

Example:

```text
Product:
Coca-Cola

Current:
100

Adjustment:
-5

Reason:
Stock count correction
```

---

# 114. Adjustment Authorization

Inventory adjustment should be permission-controlled.

Suggested permissions:

```text
Inventory
├── View
├── Adjust
├── Transfer
├── View History
└── Reconcile
```

A cashier should not automatically have adjustment privileges.

---

# 115. Adjustment Reason

Every manual adjustment must have a reason.

Examples:

* Initial stock
* Stock count correction
* Data correction
* Found stock
* Administrative adjustment

The reason becomes part of the audit trail.

---

# 116. No Silent Inventory Changes

Every quantity change must have an identifiable source.

For example:

```text
Movement Type:

SALE
REFUND
ADJUSTMENT
TRANSFER_OUT
TRANSFER_IN
```

This prevents the dangerous situation where:

> "Stock changed from 100 to 95, but nobody knows why."

---

# 117. Inventory Movement Record

Every movement should record:

```text
Product
Variant
Branch
Business Unit
Movement Type
Quantity
Previous Quantity
New Quantity
Reference
User
Timestamp
```

Example:

```text
Coca-Cola

Previous: 100
Movement: -2
New: 98

Type: SALE
Reference: INV-000124
Cashier: John
```

---

# 118. Inventory Ledger

The movement history effectively becomes an inventory ledger.

Example:

```text
Opening Balance      +100
Sale                   -5
Adjustment             -2
Transfer Out          -10
Refund                  +1
─────────────────────────
Current Balance        84
```

This makes inventory discrepancies traceable.

---

# 119. Stock Transfers

You approved stock transfers but requested a simple workflow.

Example:

```text
Abuja Branch
      │
      │ Transfer 20
      ↓
Lagos Branch
```

The system creates:

```text
TRANSFER_OUT  -20
TRANSFER_IN   +20
```

---

# 120. Transfer Creation

Authorized user selects:

```text
Source Branch
Destination Branch
Product
Quantity
```

Then confirms.

The system validates:

```text
Source ≠ Destination
Quantity > 0
Sufficient stock
Product transferable
```

---

# 121. Transfer Atomicity

The transfer must be atomic.

It should never produce:

```text
Abuja:
-20 ✓

Lagos:
+20 ✗
```

Both movements must succeed together.

---

# 122. Transfer States

Keep the previously agreed simple model:

```text
PENDING
COMPLETED
CANCELLED
```

Recommended workflow:

```text
Create
 ↓
Pending
 ↓
Complete
```

---

# 123. Transfer Completion

When completed:

```text
Source inventory
- Quantity

Destination inventory
+ Quantity
```

Both changes happen in one database transaction.

---

# 124. Transfer Cancellation

A pending transfer can be cancelled.

A completed transfer should **not simply be deleted**.

If a completed transfer needs reversal, create a compensating inventory movement.

This follows your immutable transaction principle.

---

# 125. Batch Inventory

For batch-tracked products, inventory exists at the batch level.

Example:

```text
Paracetamol

Batch A
Qty: 100
Expiry: Mar 2027

Batch B
Qty: 150
Expiry: Jan 2028
```

Total:

```text
250
```

---

# 126. Batch Selection During Sale

The system should automatically determine the appropriate batch.

Recommended strategy:

> **FEFO — First Expiry, First Out**

Example:

```text
Batch A expires 2027
Batch B expires 2028
```

The system uses Batch A first.

This is particularly appropriate for pharmacies and other businesses selling expiring products.

---

# 127. Expired Inventory

Expired batch inventory should not be sold.

At checkout:

```text
Batch expired
      ↓
Do not allocate
      ↓
Try next valid batch
```

If no valid stock remains:

> Insufficient available stock.

---

# 128. Expiry Alerts

The system should support configurable expiry warning periods.

Example:

```text
Expiry warning:
30 days
```

The administrator can see:

```text
Products expiring soon
```

and relevant notifications can be generated.

---

# 129. Serial Number Inventory

For serial-tracked products:

```text
Product:
Laptop

Serial:
SN001
```

A sale must identify the exact serial number.

Once sold:

```text
SN001
Status → SOLD
```

It cannot be sold again.

---

# 130. Serial Number Returns

If the product is returned:

```text
SN001
SOLD
 ↓
RETURNED
```

The system can then determine whether it becomes sellable inventory again based on the return workflow.

This will be finalized when we define returns/refunds.

---

# 131. Inventory Counts

The system should support manual stock counting.

Example:

```text
System Quantity:
100

Physical Count:
97

Difference:
-3
```

An authorized user can submit the reconciliation.

The system creates:

```text
ADJUSTMENT
-3
```

rather than modifying history.

---

# 132. Inventory Reconciliation

A reconciliation should record:

```text
Product
Expected Quantity
Counted Quantity
Variance
User
Timestamp
Reason
```

This gives management visibility into discrepancies.

---

# 133. Bulk Inventory Count

For businesses with many products, stock counting should support bulk workflows.

Example:

```text
Coca-Cola      Expected 100 → Count 97
Water          Expected 50  → Count 50
Bread          Expected 30  → Count 28
```

The user can submit the count as a controlled inventory operation.

---

# 134. Inventory Valuation

Because the product supports cost prices, the system can calculate:

```text
Inventory Value
=
Quantity × Cost Price
```

Example:

```text
100 units × ₦500
=
₦50,000
```

Reports can show:

* Total inventory value
* Branch inventory value
* Product inventory value
* Category inventory value

---

# 135. Cost Price Changes

Changing cost price should not rewrite historical inventory valuation.

Historical records should retain their applicable cost.

This becomes important for profit reports.

---

# 136. Inventory History

Administrators should be able to inspect:

```text
Product
 ↓
Inventory History
```

Example:

```text
21 Aug 09:15
Sale
-2

21 Aug 11:20
Adjustment
+10

21 Aug 14:32
Transfer Out
-5
```

---

# 137. Inventory Filters

Inventory management should support:

* Branch
* Business unit
* Product
* Category
* Stock status
* Inventory model
* Batch
* Expiry
* Serial number

---

# 138. Inventory Dashboard

A management dashboard should provide:

```text
Total Products
Low Stock
Out of Stock
Expiring Soon
Total Inventory Value
Recent Adjustments
Recent Transfers
```

---

# 139. Stock Alerts

The notification engine should support inventory-related events.

Examples:

```text
Low Stock
Out of Stock
Expiry Warning
Expired Batch
Large Inventory Adjustment
```

The exact notification rules can be configured later.

---

# 140. Inventory Permissions

Recommended granular permission model:

```text
Inventory
├── View Inventory
├── View Inventory History
├── Adjust Stock
├── Create Transfer
├── Complete Transfer
├── Cancel Transfer
├── Manage Stock Thresholds
├── Manage Batches
├── Manage Serial Numbers
└── Reconcile Inventory
```

A custom role can receive individual permissions.

---

# 141. Inventory Security

Inventory-changing operations must be:

* authenticated
* authorized
* validated server-side
* audited
* transactional

Frontend permission checks are insufficient.

Supabase Row Level Security should enforce the access boundary.

---

# 142. Database-Level Concurrency

For critical operations, the application must not rely on:

```text
SELECT stock
→ check in JavaScript
→ UPDATE stock
```

as separate unprotected operations.

Instead, stock mutation must be performed atomically.

The exact PostgreSQL/Supabase implementation can use appropriate transactional database functions/locking strategies.

---

# 143. Inventory and Refunds

When a completed sale is refunded, the inventory effect should be reversed where the returned item is physically restocked.

Example:

```text
Sale:
-1

Refund:
+1
```

But the refund system must also account for cases where returned merchandise should **not** immediately become sellable.

We'll define this in the Returns & Refunds module.

---

# 144. Inventory and Layaway

Layaway should **not automatically deduct normal sale inventory at the moment a layaway agreement is created** unless the business configuration explicitly requires reservation.

The core layaway workflow you established is:

```text
Customer
Outstanding balance
Payment history
Multiple installments
```

We will define the exact inventory reservation behavior when we reach the Layaway module.

---

# 145. Inventory and Suspended Sales

A suspended/held sale should generally **not permanently deduct inventory**.

Example:

```text
Cashier adds 5 Coca-Cola
       ↓
Suspend sale
       ↓
Inventory remains unchanged
```

The stock is only committed when the sale is successfully completed.

This prevents abandoned carts from artificially reducing inventory.

---

# 146. Inventory and Failed Payments

Similarly:

```text
Payment fails
      ↓
Sale not completed
      ↓
Inventory not permanently deducted
```

The transaction should remain in an appropriate failed/pending state rather than creating an invalid completed sale.

---

# 147. Inventory Integrity Rule

The system should enforce:

> **Every inventory quantity change must have a corresponding business event or authorized adjustment.**

There should never be a generic API endpoint such as:

```text
PATCH /inventory/123
{
  "quantity": 50
}
```

available to normal application users.

Inventory changes should occur through explicit domain operations.

For example:

```text
completeSale()
adjustInventory()
completeTransfer()
processRefund()
```

---

# 148. Final Inventory Architecture

The resulting model is:

```text
                         BRANCH
                           │
                      INVENTORY
                           │
             ┌─────────────┼─────────────┐
             │             │             │
         Quantity        Batch         Serial
             │             │             │
             └─────────────┼─────────────┘
                           │
                    MOVEMENT LEDGER
                           │
       ┌───────────┬───────┼───────┬───────────┐
       │           │       │       │           │
      SALE       REFUND ADJUSTMENT TRANSFER   OTHER
```

And all critical mutations are:

```text
Authenticated
      ↓
Authorized
      ↓
Validated
      ↓
Concurrency checked
      ↓
Atomic database transaction
      ↓
Audit record
```

---
# Stage: Functional Specification — Part 5

# Core POS & Checkout Engine

This section defines the actual selling experience. The POS must feel like a **fast retail terminal**, while the underlying architecture remains robust enough for restaurants, pharmacies, clothing stores, electronics stores, salons, bakeries, wholesalers, and other supported business types.

A core principle:

> **The POS should optimize for the shortest possible path from product identification → payment → completed sale.**

There should be very little unnecessary UI between those steps.

---

# 150. POS Entry

When an authorized user opens the POS, the system establishes their operational context:

```text
Organization
   ↓
Branch
   ↓
Business Unit
   ↓
POS
   ↓
Current User
```

Example:

```text
ABC Enterprises
Abuja Branch
Supermarket
John — Cashier
```

The user should not need to repeatedly select these values during checkout.

---

# 151. POS Layout

The default desktop POS should use a layout similar to:

```text
┌──────────────────────────────────────────────────────────┐
│ Business / Branch / Business Unit       User    Settings │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Search / Scan                                           │
│  [ 🔍 Search product or scan barcode... ]                │
│                                                          │
│  Categories                                              │
│  [Drinks] [Food] [Snacks] [Other]                        │
│                                                          │
│  Products                         │ Current Cart          │
│                                   │                      │
│  [Product] [Product] [Product]    │ Coca-Cola     x2     │
│  [Product] [Product] [Product]    │ Bread         x1     │
│  [Product] [Product] [Product]    │ Water         x3     │
│                                   │                      │
│                                   │ Subtotal             │
│                                   │ Discount             │
│                                   │ Tax                  │
│                                   │ Service Charge       │
│                                   │ TOTAL                │
│                                   │                      │
│                                   │ [ PAY ]              │
└──────────────────────────────────────────────────────────┘
```

On smaller screens, the layout should adapt rather than simply shrink the desktop interface.

---

# 152. POS Speed Requirement

The POS should minimize:

* page transitions
* unnecessary modals
* excessive animations
* network requests
* unnecessary data fetching
* typing

The POS should feel closer to a dedicated terminal than a conventional SaaS dashboard.

---

# 153. Product Search

Search must support:

* Product name
* SKU
* Barcode
* Variant
* Category

Search results should appear rapidly as the cashier types.

Example:

```text
Search:
coke
```

Results:

```text
Coca-Cola 50cl
Coca-Cola Zero 50cl
Coca-Cola 1L
```

---

# 154. Barcode Scanning

Barcode scanners should behave as keyboard input devices where possible.

Typical workflow:

```text
Scan
 ↓
Barcode captured
 ↓
Exact lookup
 ↓
Product identified
 ↓
Product added to cart
```

No additional confirmation should normally be required.

---

# 155. Unknown Barcode

If the barcode does not exist:

```text
Barcode not recognized.

[Search Product]
[Create Product*]
```

Product creation should only appear if the current user has the appropriate permission.

A cashier should not automatically gain product-creation capability merely because a barcode is unknown.

---

# 156. Repeated Barcode Scans

If the cashier scans the same product twice:

```text
Scan 1 → Quantity 1
Scan 2 → Quantity 2
Scan 3 → Quantity 3
```

The POS should increase the existing cart quantity rather than create duplicate cart lines.

---

# 157. Product Selection

Clicking/tapping a product adds it to the cart.

For products with variants:

```text
T-Shirt
 ↓
Select Variant
 ↓
Black / Medium
 ↓
Add to Cart
```

For a product with only one sellable variant, it should be added immediately.

---

# 158. Cart

The cart should display:

* Product
* Variant
* Unit price
* Quantity
* Line total
* Applicable discount
* Optional removal action

Example:

```text
Coca-Cola Zero
₦700 × 2
₦1,400
```

---

# 159. Quantity Adjustment

Authorized users can change quantity directly.

Controls:

```text
[-] 2 [+]
```

or direct quantity entry.

The system must revalidate stock when quantity changes.

---

# 160. Quantity Validation

Suppose:

```text
Available stock = 5
```

The cashier attempts:

```text
Quantity = 8
```

The POS should respond immediately:

> Only 5 units are currently available.

However, this frontend validation is only a convenience.

The final transaction must perform another server-side validation.

---

# 161. Removing Products

The cashier can remove a cart item.

Removing an item from the cart does not create an inventory movement because inventory has not yet been committed.

---

# 162. Clear Cart

The POS should provide:

> **Clear Cart**

with confirmation.

Example:

```text
Clear all items from this sale?

[Cancel] [Clear Cart]
```

This prevents accidental loss of a large transaction.

---

# 163. Product Categories

Categories should be accessible directly from the POS.

Example:

```text
All
Drinks
Snacks
Food
Personal Care
Electronics
```

The categories displayed depend on the current business unit's catalog.

---

# 164. Favorites / Frequently Sold Products

The POS should support a fast-access section for frequently sold products.

Potential implementation:

```text
Quick Products
[Water] [Bread] [Coke] [Milk]
```

This should be optional and configurable.

It should not replace search or barcode scanning.

---

# 165. Discounts

The system supports:

* Percentage discount
* Fixed amount discount

Example:

```text
Subtotal: ₦10,000

10% Discount
= ₦1,000

Total:
₦9,000
```

---

# 166. Discount Scope

The architecture should support both:

### Line-item discount

```text
Coke
₦700
10% off
```

### Entire-sale discount

```text
Subtotal
₦10,000

5% sale discount
₦500
```

This gives the platform flexibility across business types.

---

# 167. Who Can Give Discounts?

Discounts must be permission-controlled.

Possible permission:

```text
Sales
└── Apply Discount
```

A cashier can therefore be:

```text
Apply Discount = YES
```

or:

```text
Apply Discount = NO
```

---

# 168. Discount Limits

To prevent abuse, permissions can eventually support limits such as:

```text
Maximum discount:
10%
```

or:

```text
Maximum fixed discount:
₦5,000
```

This should be part of the granular permission/configuration model.

---

# 169. Discount Audit

Every discount should record:

```text
Discount type
Discount value
Affected item/sale
User
Timestamp
```

This is especially important for suspicious-discount analysis.

---

# 170. Tax

Tax is enabled.

The administrator defines the applicable tax configuration.

The POS calculates it automatically.

Example:

```text
Subtotal       ₦10,000
Discount        ₦1,000
Taxable total   ₦9,000
Tax @ 7.5%        ₦675
```

The exact tax basis will be configurable according to the tax settings established by the administrator.

---

# 171. Service Charge

Service charge is available across all business types.

The administrator can enable it.

Example:

```text
Subtotal           ₦20,000
Tax                 ₦1,500
Service charge       ₦2,000
────────────────────────────
Total               ₦23,500
```

The system should not hard-code service charge to restaurants.

---

# 172. Tax & Service Charge Configuration

You selected:

> **Administrator-controlled configuration.**

Therefore settings should include:

```text
Tax enabled       ✓
Tax rate          7.5%

Service charge    ✓
Service charge    10%
```

The effective settings can follow the previously established configuration hierarchy.

---

# 173. Payment Methods

Supported POS payment methods:

```text
Cash
Card
Bank Transfer
Store Credit
```

The normal customer POS payment methods are completely separate from:

> **Paystack subscription payments**

Paystack is used only for the client's software subscription.

---

# 174. Default Payment Method

The business unit can specify:

```text
Default:
Cash
```

At checkout:

```text
[ PAY ₦7,500 ]
```

can immediately open the Cash payment workflow.

The cashier can choose:

```text
Cash | Card | Transfer | Store Credit
```

when necessary.

---

# 175. Cash Payment

Example:

```text
Total:
₦7,500

Customer gives:
₦10,000

Change:
₦2,500
```

The POS should calculate the change automatically.

---

# 176. Cash Payment Validation

The cashier should not be able to complete:

```text
Amount received:
₦5,000

Total:
₦7,500
```

as a fully paid cash transaction.

The system should clearly indicate:

> Amount received is insufficient.

---

# 177. Card Payment

Card payments are recorded as:

```text
Payment Method:
CARD

Amount:
₦7,500
```

The system should support recording successful card transactions without assuming that the POS itself processes the card terminal.

The external terminal remains the payment instrument.

The cashier confirms the result according to the configured workflow.

---

# 178. Bank Transfer

Similarly:

```text
Payment Method:
BANK TRANSFER
```

The cashier records the transaction after confirming payment according to the business's operational process.

The platform should distinguish:

```text
Payment recorded
```

from:

```text
Paystack subscription payment
```

because they are entirely different financial domains.

---

# 179. Store Credit

Store credit is supported.

It must be associated with an existing customer.

Workflow:

```text
Select Customer
      ↓
Choose Store Credit
      ↓
Check available balance
      ↓
Apply credit
      ↓
Complete sale
```

---

# 180. Store Credit Validation

Suppose:

```text
Customer credit:
₦10,000

Sale:
₦7,000
```

After completion:

```text
Remaining credit:
₦3,000
```

The system must prevent using more credit than available.

---

# 181. Store Credit Ledger

Store credit should use a ledger rather than simply overwriting:

```text
customer.credit = 5000
```

Instead:

```text
Credit Granted      +₦10,000
Sale                -₦7,000
Adjustment           +₦2,000
────────────────────────────
Balance              ₦5,000
```

Every change should be auditable.

---

# 182. Customer Selection

The cashier can attach an existing customer to a sale.

Search by:

* Name
* Phone number
* Customer ID

The customer becomes associated with the transaction.

---

# 183. Customer Creation During Checkout

Because you specified that customers can be created by users such as cashiers and administrators, the POS should allow:

> **Create Customer**

without forcing the cashier to leave checkout.

Minimum information can be:

```text
Name
Phone
```

Additional customer fields can be collected when appropriate.

---

# 184. Anonymous Sales

A sale should not require a customer.

Example:

```text
Customer:
Walk-in Customer
```

This is important for high-volume retail environments.

---

# 185. Layaway

Layaway is supported.

The fundamental record must include:

```text
Customer
Total amount
Amount paid
Outstanding balance
Payment history
Status
```

Example:

```text
Total:
₦100,000

Paid:
₦40,000

Outstanding:
₦60,000
```

---

# 186. Layaway Installments

A customer can make multiple payments:

```text
₦20,000
↓
₦10,000
↓
₦10,000
↓
₦60,000
```

Each payment creates a separate ledger entry.

---

# 187. Layaway Status

Recommended:

```text
ACTIVE
COMPLETED
CANCELLED
DEFAULTED
```

The exact default behavior can be finalized in the financial workflow.

---

# 188. Suspended Sales

The cashier can hold a sale.

Example:

```text
Customer A
 ↓
Cart ₦50,000
 ↓
Suspend
```

The cashier can then serve Customer B.

---

# 189. Resume Suspended Sale

A suspended sale can be retrieved by an authorized user.

The POS should display:

```text
Suspended Sales

#001 — ₦50,000
#002 — ₦18,500
```

The cashier selects one to resume.

---

# 190. Suspended Sale Expiration

Suspended sales should not remain indefinitely without management.

The system should support configurable retention/cleanup rules.

However, deleting a suspended cart is different from deleting a completed transaction because a suspended sale is not yet a financial transaction.

---

# 191. Sale Completion

The critical workflow is:

```text
Cart
 ↓
Validate products
 ↓
Validate stock
 ↓
Calculate totals
 ↓
Apply discounts
 ↓
Calculate tax
 ↓
Calculate service charge
 ↓
Select payment
 ↓
Validate payment
 ↓
Create sale
 ↓
Create sale items
 ↓
Create payment
 ↓
Deduct inventory
 ↓
Create inventory movements
 ↓
Commit
 ↓
Generate receipt
```

All financial/inventory mutations must be handled atomically.

---

# 192. Transaction ID

Every completed sale receives a unique transaction identifier.

Example:

```text
SALE-20260821-000001
```

It should be:

* unique
* human-readable
* searchable
* printable
* immutable

---

# 193. Transaction Number Generation

Transaction numbering must be concurrency-safe.

Two cashiers processing sales simultaneously must never receive:

```text
SALE-000123
```

both.

The database should be the authoritative source for uniqueness.

---

# 194. Idempotency

This is another critical requirement.

If a request is accidentally sent twice:

```text
Complete Sale
↓
Request 1
Request 2
```

the system must not create two sales.

The checkout API should use an idempotency mechanism for critical transaction operations.

Conceptually:

```text
Idempotency Key
      ↓
Already processed?
   ↙        ↘
 YES         NO
 ↓           ↓
Return      Process
existing    transaction
result
```

---

# 195. Double-Click Protection

The frontend should also prevent accidental duplicate submissions.

After clicking:

> **Complete Payment**

the button should immediately enter a processing state.

However:

> **Frontend protection is not a replacement for backend idempotency.**

Both should exist.

---

# 196. Transaction Status

Sales should have explicit statuses.

For example:

```text
PENDING
COMPLETED
CANCELLED
REFUNDED
PARTIALLY_REFUNDED
```

A completed transaction should not simply be deleted.

---

# 197. Transaction Immutability

You explicitly selected:

> **Transactional data must be immutable.**

Therefore a completed sale cannot be edited directly.

For example, the system must not allow:

```text
Sale total:
₦50,000

UPDATE → ₦40,000
```

Instead, the appropriate corrective operation is:

```text
Refund
Adjustment
Correction transaction
```

with an audit trail.

---

# 198. Returns & Refunds

Returns and refunds are supported.

A refund must reference the original transaction.

Example:

```text
Original:
SALE-000123

Refund:
REF-000031

References:
SALE-000123
```

This prevents orphan refunds.

---

# 199. Refund Authorization

You explicitly decided:

> **Refunds require authorization.**

Therefore the cashier may initiate a refund request, but completing the refund requires a user with the appropriate permission.

Example:

```text
Cashier
 ↓
Request Refund
 ↓
Manager authorization
 ↓
Refund completed
```

The exact approval model can be kept simple.

---

# 200. Refund Permissions

Recommended:

```text
Refunds
├── View Refunds
├── Request Refund
├── Approve Refund
└── Complete Refund
```

The Owner can delegate these permissions.

---

# 201. Refund Inventory

If a physical item is returned and accepted back into sellable stock:

```text
Original sale
-1

Refund
+1
```

The inventory movement references the refund.

---

# 202. Partial Refunds

Although you excluded **partial payments**, the refund system can still support refunding individual items from a completed transaction.

Example:

```text
Sale:
3 × Coca-Cola
2 × Bread

Customer returns:
1 × Coca-Cola
```

The refund references only the returned item.

---

# 203. Exchanges

You explicitly excluded exchanges.

Therefore:

> The system will not implement a dedicated exchange workflow.

Businesses can instead use:

```text
Refund
+
New Sale
```

if operationally required.

---

# 204. Receipt Generation

The system supports receipts.

Receipts should contain:

```text
Business name
Logo
Branch
Business unit
Address/contact
Transaction ID
Date/time
Cashier
Items
Quantities
Prices
Discount
Tax
Service charge
Payment method
Total
```

---

# 205. Receipt Templates

You requested multiple receipt templates.

Templates are configurable by administrators.

Examples:

```text
Compact
Standard
Detailed
```

The exact template library can expand later.

---

# 206. Receipt Branding

Receipts should use the business's configured:

* Logo
* Brand name
* Primary color
* Secondary color

where the selected receipt template supports branding.

---

# 207. Digital Receipts

Digital receipts are supported.

The system can provide a receipt accessible through the application.

For example:

```text
Sale completed.

[ View Receipt ]
[ Print Receipt ]
```

---

# 208. Email/SMS Receipts

You explicitly excluded:

* Email receipts
* SMS receipts
* WhatsApp receipts

Therefore Resend should **not** be used to send normal customer receipts.

Resend is reserved for system/admin communications such as subscription notifications and other configured administrative emails.

---

# 209. Receipt Printing

The initial hardware target includes receipt printers.

The web POS should support printing through the browser/system print workflow initially.

Hardware-specific integrations should be designed behind an abstraction so that future direct printer integrations can be added without changing the transaction engine.

---

# 210. Customer Display

Customer displays are supported.

A secondary display can show:

```text
Product
Quantity
Price
Subtotal
Discount
Tax
Service charge
Total
```

During payment:

```text
TOTAL
₦15,500
```

The architecture should treat the customer display as a presentation layer, not as a separate source of transaction state.

---

# 211. POS Hardware

Initial target:

* Barcode scanner
* Receipt printer
* Customer display
* Desktop browser
* Tablet
* Phone

The application remains:

> **Responsive web**

rather than requiring separate native applications.

---

# 212. Keyboard Shortcuts

Because speed is a core requirement, desktop POS should support keyboard shortcuts.

Potential examples:

```text
F2 → Search
F4 → Customer
F6 → Discount
F8 → Hold Sale
F9 → Payment
Esc → Close modal
```

The exact shortcut map will be finalized during UI/UX implementation.

---

# 213. Touch Optimization

On tablets and phones:

* buttons must be sufficiently large
* cart actions must be touch-friendly
* search must be prominent
* payment controls must be easy to reach

The desktop keyboard workflow should not be forced onto mobile.

---

# 214. POS Error Handling

Errors should be understandable.

Bad:

> `500 Internal Server Error`

Better:

> **This product is no longer available in the requested quantity. Please review the cart.**

Technical details should still be logged internally.

---

# 215. Transaction Failure

If a critical operation fails:

```text
Sale
 ↓
Payment validation
 ↓
Failure
```

the system must not create a misleading completed sale.

The user should receive a clear retry/recovery option.

---

# 216. Network Failure

Because offline capability has been **completely eliminated**, the POS requires a live connection to the application/backend.

If the connection is lost:

```text
Connection lost
```

The system should:

* prevent new critical transactions
* preserve the current unsaved cart locally in the browser where reasonably safe
* allow the user to retry
* clearly indicate that the sale has not been completed

It must **not** pretend that an offline sale was completed.

---

# 217. No Offline Transaction Queue

There must be no:

```text
Offline Sale Queue
Sync Queue
Conflict Resolver
Offline Inventory
```

This significantly simplifies:

* concurrency
* inventory integrity
* transaction numbering
* refunds
* payment state
* database consistency
* architecture
* maintenance

---

# 218. POS Transaction Security

Every completed sale must be tied to:

```text
User
Branch
Business Unit
Timestamp
Transaction ID
Payment
Inventory movements
```

This creates the foundation for audit and reporting.

---

# 219. Final Checkout Architecture

The core flow is therefore:

```text
                  POS
                   │
            Product Selection
                   │
                Cart
                   │
             Price Resolution
                   │
              Discount
                   │
           Tax / Service Charge
                   │
               Customer
                   │
               Payment
                   │
        ┌──────────┴──────────┐
        │                     │
     Validate             Authorize
        │                     │
        └──────────┬──────────┘
                   ↓
            Atomic Transaction
                   │
       ┌───────────┼────────────┐
       │           │            │
      Sale       Payment     Inventory
       │           │            │
       └───────────┼────────────┘
                   ↓
                Receipt
                   ↓
             Audit Record
```

---

# 220. Core POS Invariant

The most important rule in this entire module is:

> **A sale is either completely committed or it does not exist as a completed sale.**

There should never be a state where:

* money says one thing,
* inventory says another,
* the receipt says something else,
* and the transaction record says something different.

The database transaction boundary must protect this invariant.

---

# Stage: Functional Specification — Part 6

# Customer Management, Store Credit & Layaway

This module establishes the customer layer shared across all supported business types. The important architectural principle is that **customers are optional for ordinary sales**, but become mandatory for customer-linked financial features such as **store credit and layaway**.

---

## 221. Customer Management Objectives

The customer system should allow businesses to:

* Create customers
* Search customers
* View customer profiles
* View purchase history
* Associate customers with sales
* Manage store credit
* Manage layaway/installment purchases
* View refunds
* View outstanding balances
* View customer activity
* Maintain customer contact information
* Restrict access to sensitive customer information through permissions

The system should remain useful even when a business does not identify most customers.

---

# 222. Customer Model

A customer belongs to the business/organization.

Conceptually:

```text
Organization
    │
    ├── Branch A
    ├── Branch B
    └── Branch C
          │
       Customers
```

The customer is therefore not inherently owned by a single branch.

This allows a customer to purchase from different branches of the same business.

---

# 223. Customer Identification

You selected the simpler identification approach.

The POS should support:

* Customer name
* Phone number
* Customer ID

The phone number should be particularly useful for quick lookup.

Example:

```text
Search customer:
0803...
```

→

```text
John Adebayo
0803 XXX XXXX
```

---

# 224. Walk-In Customer

Every business should have an implicit/default customer concept:

> **Walk-in Customer**

This should not require the business to create thousands of duplicate customer records.

For example:

```text
Customer:
Walk-in Customer
```

can be used for anonymous transactions.

---

# 225. Customer Creation

Authorized users can create customers directly from:

* Customer management
* POS checkout
* Layaway
* Store-credit workflows

Minimum required information should remain low-friction.

Recommended:

```text
Full Name *
Phone Number
Email
Address
Notes
```

Only the fields actually required by the business should be mandatory.

---

# 226. Customer Duplicate Detection

The system should attempt to prevent accidental duplicates.

For example, when entering:

```text
Phone:
08031234567
```

and an existing customer has the same phone number, the system should warn:

> A customer with this phone number already exists.

Options:

```text
[View Existing Customer]
[Continue Anyway]
```

The exact duplicate policy can be configurable later.

---

# 227. Customer Profile

The customer profile should provide a consolidated view:

```text
John Adebayo

Phone
Email
Customer ID

────────────────────────

Total Purchases
Outstanding Layaway
Store Credit Balance

────────────────────────

Purchase History
Refund History
Layaway History
Credit History
Activity
```

---

# 228. Customer Dashboard

The customer list should support:

* Search
* Sorting
* Filtering
* Pagination
* Customer status
* Outstanding balances
* Store credit balance

Example:

```text
Customers

[ Search customers... ]

John Adebayo       ₦5,000 credit
Mary Johnson       ₦0
David Okoro        ₦25,000 outstanding
```

---

# 229. Customer Purchase History

A customer profile should show previous sales.

Example:

```text
Purchase History

SALE-001238
21 Aug 2026
₦45,000
Cash

SALE-001112
14 Aug 2026
₦18,500
Card

SALE-000945
02 Aug 2026
₦72,000
Transfer
```

Selecting a transaction opens the transaction details.

---

# 230. Customer Transaction Details

The business should be able to see:

* Products purchased
* Quantities
* Prices
* Discounts
* Tax
* Service charge
* Payment method
* Total
* Branch
* Business unit
* Cashier
* Date/time
* Refund information

Access should be controlled by permissions.

---

# 231. Customer Purchase History vs Transaction History

These should not be separate duplicate data structures.

The customer history should be a **view over the transaction system**.

This prevents unnecessary duplication.

Conceptually:

```text
Sales
  │
  └── customer_id
          │
          ↓
    Customer History
```

---

# 232. Customer Store Credit

Store credit is one of the most important customer-linked financial features.

A customer can have:

```text
Available Credit
```

which can be applied toward future purchases.

---

# 233. Store Credit Ledger

As established earlier, store credit must be ledger-based.

Do not simply maintain:

```text
customer.credit_balance
```

as the only source of truth.

Instead:

```text
Credit Ledger

+ ₦20,000  Credit issued
- ₦5,000   Used on SALE-00120
+ ₦10,000  Credit adjustment
- ₦8,000   Used on SALE-00150
────────────────────────────
Balance = ₦17,000
```

The current balance can be derived/cached from this ledger.

---

# 234. Sources of Store Credit

Store credit may be created through authorized actions such as:

### Refund to store credit

```text
Refund
 ↓
Store Credit
```

### Manual credit

```text
Authorized user
 ↓
Credit customer
```

### Other approved adjustment

Every manual adjustment must have a reason.

---

# 235. Store Credit Authorization

Store credit should be permission-controlled.

Recommended permissions:

```text
Customers
├── View Credit
├── Issue Credit
├── Adjust Credit
└── Use Credit
```

Ordinary use during checkout should be allowed when the user has permission to complete sales using store credit.

---

# 236. Manual Credit Adjustment

If an authorized manager adds:

```text
₦50,000
```

the system should require a reason:

```text
Reason:
Customer compensation
```

The audit record becomes:

```text
User: Branch Manager
Action: Credit Adjustment
Amount: +₦50,000
Reason: Customer compensation
Timestamp: ...
```

---

# 237. Negative Store Credit

The system must never allow the customer balance to become negative through normal checkout.

Example:

```text
Available:
₦5,000

Sale:
₦8,000
```

The POS cannot apply the full ₦8,000 as store credit.

---

# 238. Store Credit + Other Payment

You previously selected **no split payments**.

Therefore a transaction cannot do:

```text
₦5,000 Store Credit
+
₦3,000 Cash
```

within the same sale.

The system should require one supported payment method for the transaction.

This is an important constraint that should remain consistent throughout the architecture.

---

# 239. Store Credit Expiration

Unless you later decide otherwise, store credit should **not automatically expire**.

An expiration mechanism would introduce additional financial complexity and customer-service considerations.

If introduced later, it should be explicitly configured.

---

# 240. Layaway Customer Requirement

Layaway must be associated with an existing customer.

Therefore:

```text
Anonymous customer
     ↓
Layaway
     ✕
```

The POS should require:

> Select or create customer.

---

# 241. Layaway Record

A layaway record should contain:

```text
Layaway ID
Customer
Items
Original amount
Amount paid
Outstanding balance
Payment history
Status
Created by
Created at
Branch
Business unit
```

---

# 242. Layaway Workflow

The simple workflow you selected:

```text
Customer
   ↓
Select Products
   ↓
Create Layaway
   ↓
Record Initial Payment
   ↓
Outstanding Balance
   ↓
Customer Makes Installments
   ↓
Balance Reaches ₦0
   ↓
Completed
```

---

# 243. Initial Layaway Payment

A customer may make an initial payment.

Example:

```text
Total:
₦250,000

Initial payment:
₦50,000

Outstanding:
₦200,000
```

The system records the initial payment separately.

---

# 244. Installment Payment

Later:

```text
Customer:
John Adebayo

Layaway:
LAY-00045

Outstanding:
₦200,000

Payment:
₦50,000
```

New balance:

```text
₦150,000
```

The payment is recorded in the layaway payment ledger.

---

# 245. Multiple Installments

There is no fixed number of installments.

For example:

```text
₦50,000
₦30,000
₦20,000
₦100,000
```

can all contribute toward the same layaway.

---

# 246. Layaway Completion

When:

```text
Outstanding Balance = ₦0
```

the system automatically marks:

```text
COMPLETED
```

The customer should no longer be able to make additional payments against that layaway.

---

# 247. Layaway Overpayment Protection

If:

```text
Outstanding:
₦20,000

Customer attempts:
₦25,000
```

the system should prevent the payment or require correction.

It should never silently create:

```text
Balance = -₦5,000
```

---

# 248. Layaway Cancellation

Authorized users can cancel a layaway.

Cancellation should require a reason.

Example:

```text
Cancel Layaway?

Reason:
Customer cancelled order
```

The system should preserve the original layaway and its payment history.

It should not delete the record.

---

# 249. Layaway Refunds

If money needs to be returned after a layaway cancellation, the refund should be a separate financial transaction referencing the layaway.

Example:

```text
LAY-00045
     ↓
Cancellation
     ↓
Refund REF-00125
```

This maintains financial traceability.

---

# 250. Layaway Product Reservation

This is an important design decision.

A layaway may involve products that are intended to be held for the customer.

Because inventory is branch-specific and there is no offline capability, the system can support a simple reservation model.

Example:

```text
Physical Stock:
10

Layaway reservation:
2

Available for normal sale:
8
```

This prevents the business from selling inventory that has already been committed to a layaway customer.

---

# 251. Layaway Reservation States

Recommended:

```text
RESERVED
RELEASED
FULFILLED
CANCELLED
```

The implementation should remain simple rather than becoming a full warehouse reservation engine.

---

# 252. Customer Notifications

You selected in-app and email notifications.

However, customer receipts/messages are not being sent through email/SMS/WhatsApp.

Therefore customer-related system notifications should be carefully separated from transactional receipts.

For example, the system may eventually send administrative notifications about:

* Layaway status
* Outstanding balance
* Account changes

but these should only be implemented where explicitly required.

---

# 253. Customer Privacy

Customer information should follow least-privilege access.

For example, a cashier may need:

```text
Name
Phone
Customer ID
```

but may not need access to:

```text
Customer financial history
Store-credit adjustments
Internal notes
```

unless granted permission.

---

# 254. Customer Permissions

Recommended granular permission structure:

```text
Customers
├── View Customers
├── Create Customers
├── Edit Customers
├── Delete Customers
├── View Purchase History
├── View Financial History
├── Manage Store Credit
├── Manage Layaway
└── Export Customer Data
```

This fits your requirement for granular RBAC.

---

# 255. Customer Deletion

You previously selected the recommended approach for deletion.

Because customers can be connected to:

* sales
* refunds
* store credit
* layaway
* audit records

a customer with financial history should **not simply be hard-deleted**.

Instead, the system should use a safe deletion/anonymization strategy where appropriate.

---

# 256. Transactional References Must Survive

Suppose:

```text
John Adebayo
```

has made 200 purchases.

Deleting his customer profile must not cause:

```text
SALE-001
SALE-002
SALE-003
...
```

to lose their historical integrity.

Transactions remain immutable.

---

# 257. Customer Deactivation

A safer normal operation is:

```text
Customer
ACTIVE
   ↓
DEACTIVATED
```

A deactivated customer cannot normally be selected for new customer-linked operations but their historical transactions remain accessible according to permissions.

---

# 258. Customer Data Retention

The architecture should distinguish:

```text
Operational deletion
```

from:

```text
Historical financial records
```

Financial records have stronger retention requirements.

This will be especially important when we define the audit and accounting architecture.

---

# 259. Customer Search Performance

Customer lookup must remain fast even with a large customer database.

Indexes should exist for frequently queried identifiers such as:

```text
phone
customer_id
organization_id
```

and appropriate search fields.

---

# 260. Cross-Branch Customer Access

Because customers belong to the organization rather than an individual branch, authorized users can access customers across branches according to their permissions.

However, a branch-level employee should normally have branch-scoped access unless explicitly granted broader access.

Example:

```text
Owner
→ All branches

Branch Manager
→ Assigned branch

Cashier
→ Current branch
```

---

# 261. Customer + Business Unit

A customer can transact with multiple business units owned by the same organization.

Example:

```text
ABC Enterprises

Abuja Branch
├── Supermarket
└── Pharmacy
```

The same customer can have:

```text
Supermarket purchase
+
Pharmacy purchase
```

while remaining one customer record.

---

# 262. Customer + Product Restrictions

Because you deliberately excluded pharmacy prescription-management functionality, the customer system should **not** become a hidden patient-record system.

The platform should treat pharmacy customers as normal customers unless additional pharmacy functionality is added in a future version.

---

# 263. Customer Analytics

Customer reports should eventually support:

* Total spending
* Number of purchases
* Average transaction value
* Store-credit balance
* Layaway balance
* Refund history
* Purchase frequency
* Most purchased products

These are derived analytics rather than duplicated transactional data.

---

# 264. Customer Audit Events

Important customer events should enter the audit system:

```text
Customer created
Customer edited
Customer deactivated
Customer reactivated
Credit issued
Credit adjusted
Layaway created
Layaway payment recorded
Layaway cancelled
```

---

# 265. Customer Module Architecture

Conceptually:

```text
                  CUSTOMER
                     │
       ┌─────────────┼──────────────┐
       │             │              │
    PROFILE       SALES         FINANCIAL
                     │              │
                     │        ┌─────┴─────┐
                     │        │           │
                  HISTORY   CREDIT     LAYAWAY
                                │           │
                              LEDGER      PAYMENTS
```

The customer module should therefore **reference** financial records rather than becoming a second financial system.

---

# 266. Critical Data Relationships

At a high level:

```text
Customer
   │
   ├── Sales
   │
   ├── Refunds
   │
   ├── Store Credit Ledger
   │
   └── Layaway
          │
          └── Layaway Payments
```

This gives us a clean foundation for the financial module.

---

# 267. Important Architectural Rule

There should be **one source of truth** for each financial event.

For example:

> Store credit balance should not independently exist in the customer profile and in the financial system with two potentially different values.

Instead:

```text
Credit Ledger
     ↓
Current Balance
     ↓
Customer Profile
```

The customer profile displays the result.

---

# 268. Customer Module Completion Criteria

The module will be considered complete when:

* Customers can be created.
* Customers can be searched.
* Customers can be attached to sales.
* Walk-in sales work without a customer.
* Purchase history is available.
* Store credit works through a ledger.
* Store credit cannot be overused.
* Layaway requires a customer.
* Layaway supports multiple payments.
* Outstanding balances are calculated correctly.
* Layaway completion is automatic at zero balance.
* Refunds can reference layaway records.
* Customer deletion does not corrupt historical transactions.
* Customer permissions are enforced through RBAC.
* Customer actions are audited.

---

# Stage: Functional Specification — Part 7

# Product Catalog & Inventory Architecture

This is one of the most important modules in the entire POS because **products, pricing, inventory, branches, business units, and transactions are tightly coupled**.

The design below follows your decisions:

* Inventory is branch-specific.
* Business units exist under branches.
* A business unit has its own POS configuration.
* A product **cannot exist in multiple business units**.
* Pricing is configurable at the **branch level**.
* Stock transfers are supported, but kept simple.
* No suppliers/procurement system.
* No damaged-stock/wastage workflow.
* Multiple inventory models are supported.
* Offline capability has been completely eliminated.
* Product creation is available to Super Admin, Admin/Owner, Branch Manager and authorized custom roles.
* Transactional data is immutable.

---

# 269. Product System Objectives

The product system must support products across:

* Supermarkets
* Convenience stores
* Restaurants
* Pharmacies
* Clothing stores
* Electronics stores
* Hardware stores
* Beauty salons/barbers
* Hotels
* Bakeries
* Wholesalers
* General retail
* Future business types

The product model therefore cannot be designed around only supermarket products.

For example:

### Supermarket

```text
Coca-Cola 50cl
```

### Clothing

```text
Men's Shirt
```

with:

```text
Color: Black
Size: XL
```

### Electronics

```text
Samsung TV
```

with:

```text
Model
Storage
Color
```

### Pharmacy

```text
Paracetamol 500mg
```

### Salon

```text
Haircut
```

which may not represent physical inventory in the same way.

This means the product system needs to support **physical goods and non-stock/service products**.

---

# 270. Product Types

The platform should support at least:

```text
PRODUCT
SERVICE
```

### Product

A physical item that can have inventory.

Example:

```text
Coca-Cola 50cl
```

### Service

A sellable service that does not require conventional stock deduction.

Examples:

```text
Haircut
Hair styling
Phone repair
Hotel room service
```

This is important for salons, barbers, service businesses and some other business types.

---

# 271. Product Lifecycle

A product should have a lifecycle:

```text
Draft
  ↓
Active
  ↓
Archived
```

An archived product should no longer appear as a normal POS item but must remain available for historical transactions.

---

# 272. Product Identity

Every product should have a unique internal identifier.

Conceptually:

```text
product_id
```

This is an internal database identifier and should not be used as the human-facing SKU.

---

# 273. SKU

Each sellable product/variant should have a SKU.

Example:

```text
SKU:
COKE-50CL
```

For variants:

```text
SHIRT-BLK-M
SHIRT-BLK-L
SHIRT-WHT-M
SHIRT-WHT-L
```

The SKU should be unique within the relevant organization scope.

---

# 274. Barcode

A product can have a barcode.

Example:

```text
Barcode:
5449000000996
```

The barcode should be indexed for fast POS lookup.

A barcode should not be assumed to be the same thing as the SKU.

---

# 275. Multiple Barcodes

The architecture should support multiple barcodes for a product/variant where appropriate.

This is useful when:

* different packaging has different barcodes
* businesses receive products with alternative barcodes
* regional barcodes exist
* legacy barcode systems need to be supported

Example:

```text
Product:
Coca-Cola 50cl

Barcodes:
5449000000996
1234567890123
```

---

# 276. Product Name

Every sellable item requires a human-readable name.

Example:

```text
Coca-Cola Zero 50cl
```

The name appears throughout:

* POS
* receipts
* reports
* inventory
* customer history

---

# 277. Product Description

Products can optionally contain:

* Description
* Internal notes
* Customer-facing description

The POS should not display lengthy descriptions unless useful.

---

# 278. Categories

Product categories are dynamic and administrator-defined.

Examples:

```text
Food
Drinks
Electronics
Clothing
Accessories
Beauty
```

The system should not hard-code these categories.

---

# 279. Category Hierarchy

The category system should support nesting.

Example:

```text
Clothing
├── Men's
│   ├── Shirts
│   ├── Trousers
│   └── Jackets
└── Women's
    ├── Dresses
    └── Tops
```

This provides flexibility without requiring separate product systems for every business type.

---

# 280. Brands

The product model should optionally support brands.

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

This allows reporting and filtering by brand.

---

# 281. Product Images

Products can have images.

The system should support:

* Primary image
* Additional images

The POS may only need the primary image.

The dashboard can provide the full image management interface.

---

# 282. Product Variants

Variants are supported.

A product can have:

```text
Product:
T-Shirt

Variants:
Black / S
Black / M
Black / L
White / S
White / M
White / L
```

Each variant can have its own:

* SKU
* Barcode
* Price
* Inventory
* Image if necessary

---

# 283. Variant Attributes

Variant attributes should be configurable.

Examples:

```text
Size
Color
Storage
Capacity
Material
Weight
```

The system should not hard-code:

```text
Size
Color
```

as the only possible variant attributes.

---

# 284. Variant Attribute Values

Example:

```text
Color
├── Black
├── White
└── Red

Size
├── Small
├── Medium
├── Large
└── XL
```

The product defines which attributes it uses.

---

# 285. Variant Generation

The UI can optionally generate combinations automatically.

For:

```text
Color:
Black, White

Size:
S, M, L
```

the system can generate:

```text
Black / S
Black / M
Black / L
White / S
White / M
White / L
```

The administrator can then disable combinations that are not actually sold.

---

# 286. Business Unit Product Ownership

This is one of your most important decisions:

> **The same product cannot exist in multiple business units.**

Therefore the architecture must explicitly associate a product with one business unit.

Conceptually:

```text
Organization
   ↓
Branch
   ↓
Business Unit
   ↓
Product
```

Example:

```text
ABC Enterprises
└── Abuja Branch
    ├── Supermarket
    │   └── Coca-Cola 50cl
    │
    └── Pharmacy
        └── Paracetamol 500mg
```

The supermarket's Coca-Cola product is not automatically available to the pharmacy business unit.

---

# 287. Why This Constraint Matters

Without this restriction, a product could accidentally become shared between unrelated business units:

```text
Pharmacy
     ↕
Shared Product
     ↕
Supermarket
```

That could cause confusion around:

* pricing
* stock
* categories
* tax
* POS configuration
* reporting
* permissions

Your chosen model gives each business unit a cleaner catalog.

---

# 288. Cross-Business-Unit Product Duplication

Because the same product cannot exist in multiple business units, if the owner wants a similar item in another business unit, they create a separate product record.

Example:

```text
Supermarket:
Water 75cl

Pharmacy:
Water 75cl
```

These are separate product records even if they happen to represent the same real-world item.

This is consistent with your Q23 decision.

---

# 289. Business Unit Configuration

Each business unit can have its own POS configuration.

For example:

```text
ABC Enterprises
│
└── Abuja Branch
    │
    ├── Supermarket
    │    ├── Product Catalog
    │    ├── POS Configuration
    │    └── Tax Configuration
    │
    └── Pharmacy
         ├── Product Catalog
         ├── POS Configuration
         └── Tax Configuration
```

This is why the business-unit layer should be a first-class entity rather than simply a category.

---

# 290. Inventory Ownership

Inventory is branch-specific.

The important distinction is:

> **Product ownership and inventory location are not the same thing.**

A product belongs to a business unit.

Its inventory is held at a branch.

Conceptually:

```text
Product
   ↓
Business Unit

Inventory
   ↓
Branch + Product
```

---

# 291. Business Unit Inventory Interpretation

You selected:

> **C**

for whether a business unit should have its own inventory.

The architecture should therefore avoid treating each business unit as a completely independent warehouse unless required.

Instead:

```text
Branch
│
├── Business Unit A
├── Business Unit B
└── Shared physical location
```

can exist while the system still records which business unit owns the product and which branch holds its stock.

This is particularly useful for your example of:

> A supermarket with a pharmacy operating within the same building.

---

# 292. Stock Quantity

Inventory should maintain at minimum:

```text
Quantity on hand
Reserved quantity
Available quantity
```

Conceptually:

```text
Available =
On Hand - Reserved
```

This is important for layaway.

---

# 293. Inventory Model

You selected support for different inventory models.

The system should support at least:

### Stock-tracked

Inventory is deducted when sold.

```text
Water
Stock: 100
Sale: -1
Remaining: 99
```

### Non-stock/service

No conventional stock deduction.

```text
Haircut
Inventory:
Not tracked
```

### Optional inventory behavior

The product configuration can determine whether stock is:

```text
Tracked
Not tracked
```

rather than requiring every business type to use inventory.

---

# 294. Inventory Units

The system should support units such as:

```text
Piece
Box
Pack
Bottle
Kilogram
Gram
Liter
Meter
Service
```

The unit system should be configurable rather than hard-coded to retail assumptions.

---

# 295. Selling Unit

A product should define how it is sold.

Example:

```text
Water
Unit: Bottle
```

or:

```text
Cable
Unit: Meter
```

or:

```text
Haircut
Unit: Service
```

---

# 296. Stock Adjustment

Authorized users can adjust inventory.

Example:

```text
Current:
100

Adjustment:
+10

New:
110
```

or:

```text
Current:
100

Adjustment:
-5

New:
95
```

---

# 297. Adjustment Reason

Every manual stock adjustment should have a reason.

Examples:

```text
Stock count correction
Opening balance
System correction
Found stock
Inventory reconciliation
```

Since you excluded dedicated damaged-stock and wastage workflows, the system should not introduce those as separate inventory modules.

---

# 298. Inventory Movement Ledger

Inventory should be ledger-based.

Example:

```text
Opening Balance       +100
Sale                    -5
Refund                  +1
Adjustment              +4
Transfer Out           -10
Transfer In             +10
────────────────────────────
Current Stock           100
```

This is considerably safer than simply updating one quantity field without history.

---

# 299. Inventory Movement Types

Recommended movement types:

```text
OPENING_BALANCE
SALE
REFUND
ADJUSTMENT
TRANSFER_OUT
TRANSFER_IN
RESERVATION
RESERVATION_RELEASE
```

This provides the foundation for inventory reporting.

---

# 300. Stock Transfers

You changed your original decision and selected:

> **YES — but keep it simple.**

The transfer workflow should therefore be deliberately lightweight.

---

# 301. Simple Stock Transfer Workflow

```text
Source Branch
     ↓
Select Product
     ↓
Quantity
     ↓
Destination Branch
     ↓
Submit Transfer
     ↓
Authorize if required
     ↓
Complete
```

Example:

```text
Abuja Branch
10 Coca-Cola
       ↓
Transfer 5
       ↓
Lagos Branch
```

---

# 302. Transfer Status

Keep the state machine small:

```text
DRAFT
PENDING
COMPLETED
CANCELLED
```

A transfer should not require a complex procurement-style workflow.

---

# 303. Transfer Inventory

When completed:

```text
Source:
-5

Destination:
+5
```

Both movements should belong to the same transfer record.

---

# 304. Transfer Atomicity

The source deduction and destination addition must be handled atomically.

The system must never reach:

```text
Source -5
Destination +0
```

because of a partial database failure.

Either:

```text
-5 / +5
```

is committed, or neither is.

---

# 305. Transfer Permissions

Recommended permissions:

```text
Inventory
├── View Inventory
├── Adjust Inventory
├── Create Transfer
├── Approve Transfer
└── Cancel Transfer
```

The Owner can decide which roles receive them.

---

# 306. Transfer Validation

Before completion:

```text
Source available stock >= transfer quantity
```

must be true.

Example:

```text
Available:
4

Transfer:
10
```

→ Reject.

---

# 307. Same-Branch Transfer

A transfer between business units within the same physical branch should not automatically be treated as a conventional branch stock transfer.

Because your architecture distinguishes:

```text
Branch
Business Unit
```

we should later define whether such movement is:

* a business-unit inventory adjustment, or
* an internal transfer.

For the initial version, I recommend **not implementing internal business-unit transfers** unless a real business requirement appears.

That keeps the transfer system simple.

---

# 308. Pricing

You selected:

> **Pricing configurable at Branch Level.**

Therefore pricing should not be embedded directly into the global product record as the only price.

Instead:

```text
Product
   ↓
Branch Pricing
```

Example:

```text
Coca-Cola

Abuja Branch:
₦700

Lagos Branch:
₦750
```

---

# 309. Business Unit Pricing

Because products belong to business units but pricing is branch-level, the system needs a clear interpretation.

Recommended:

```text
Product
 ↓
Business Unit
 ↓
Branch
 ↓
Price
```

The branch price applies to that product within its owning business unit.

This prevents unrelated business units from sharing pricing.

---

# 310. Price History

Price changes should not overwrite historical transaction prices.

Example:

```text
Product:
Coke

Old price:
₦600

New price:
₦700
```

Previous transactions must still show:

```text
₦600
```

because transaction line items should store the effective sale price.

---

# 311. Price Changes

Authorized users can change prices according to permission.

Recommended permissions:

```text
Products
├── View Products
├── Create Products
├── Edit Products
├── Archive Products
├── Manage Pricing
└── Manage Inventory
```

---

# 312. Product Creation Permissions

You explicitly selected:

> Super Admin, Admin/Owner, Branch Manager, Custom Roles.

Therefore:

```text
Super Admin       ✓
Owner             ✓
Branch Manager    ✓
Cashier           configurable
Salesperson       configurable
Custom Role       configurable
```

A cashier should not automatically receive product creation permissions.

---

# 313. Product Creation Scope

A Branch Manager should only be able to create products within the business unit/branch scope allowed by their role.

The Super Admin remains unrestricted.

This follows your overall hierarchy.

---

# 314. Product Editing

Editing a product must distinguish between:

### Safe metadata

Can generally be edited:

* Name
* Description
* Image
* Category
* Brand

### Sensitive configuration

Requires stronger permissions:

* Price
* Inventory model
* SKU
* Barcode
* Tax configuration
* Product status

---

# 315. SKU Changes

Changing a SKU after transactions exist should be restricted.

Historical transactions must continue to retain the original SKU/product snapshot necessary for reporting and receipt reconstruction.

---

# 316. Barcode Changes

Barcode changes should also be audited.

Example:

```text
Old:
123456789

New:
987654321

Changed by:
Branch Manager

Reason:
Supplier barcode correction
```

---

# 317. Product Archiving

Products should normally be archived rather than deleted once they have transaction history.

Example:

```text
Active
 ↓
Archived
```

Archived products:

* disappear from normal POS search
* remain in historical transactions
* remain available in reports
* retain their inventory history

---

# 318. Product Deletion

A product with transactional history should not be physically deleted.

If it has never been used, controlled deletion may be allowed.

This follows the same principle as customer deletion.

---

# 319. Product Images & Storage

Because the project must stay within your:

> **$0 target / maximum ~$10 monthly budget**

image storage needs to be designed carefully.

Supabase Storage should be preferred where its free allocation is sufficient.

Images should also be:

* resized
* compressed
* limited in dimensions
* stored using predictable paths

For example:

```text
products/{business_unit_id}/{product_id}/primary.webp
```

This prevents unnecessary storage growth.

---

# 320. Bulk Product Import

The product system should support bulk creation eventually.

Example:

```text
CSV
 ↓
Validate
 ↓
Preview
 ↓
Import
```

Useful for businesses with thousands of products.

The import process should validate:

* SKU
* barcode
* name
* category
* price
* inventory configuration
* variant information

before committing anything.

---

# 321. Import Failure Handling

The import should not partially corrupt the catalog.

Example:

```text
1,000 products
998 valid
2 invalid
```

The UI should show:

```text
998 ready to import
2 errors
```

The user can correct the errors before committing.

---

# 322. Product Export

Authorized users can export product data.

Potential formats:

* CSV
* Excel-compatible spreadsheet

This is particularly useful for:

* backups
* bulk editing
* migration
* reporting

---

# 323. Low Stock

Products should support a low-stock threshold.

Example:

```text
Current:
12

Low-stock threshold:
20
```

The system marks the product:

> Low Stock

---

# 324. Out of Stock

When:

```text
Available quantity = 0
```

the product becomes:

> Out of Stock

The POS should prevent selling it unless the business explicitly allows negative inventory.

---

# 325. Negative Inventory

I recommend:

> **Negative inventory should be disabled by default.**

For a POS intended to maintain accurate inventory, allowing:

```text
Stock = -15
```

creates significant reporting and reconciliation problems.

If you later determine that certain businesses require it, it can become a configurable advanced option.

---

# 326. Inventory Reservation

Inventory reservation is required for layaway.

The system should distinguish:

```text
On Hand = 100
Reserved = 20
Available = 80
```

A normal sale can only consume the available quantity.

---

# 327. Sale + Reservation Concurrency

This is where your earlier request to add concurrency checks becomes important.

Suppose:

```text
Stock = 1
```

Cashier A attempts to sell it.

Cashier B simultaneously attempts to sell it.

The backend must prevent both transactions from successfully consuming the same unit.

This cannot be solved reliably with frontend validation.

The database transaction must perform the final stock check and update atomically.

---

# 328. Inventory Concurrency Model

Conceptually:

```text
Read stock
     ↓
Lock/check current row
     ↓
Verify quantity
     ↓
Deduct
     ↓
Create movement
     ↓
Commit
```

If another transaction already consumed the stock:

```text
Transaction rejected
```

rather than allowing negative or duplicated inventory.

---

# 329. Inventory Count

The system should provide a simple stock-count/reconciliation function.

Example:

```text
System quantity:
100

Physical quantity:
97

Adjustment:
-3
```

The system creates:

```text
ADJUSTMENT
-3
```

rather than silently rewriting the quantity.

---

# 330. Inventory Reports

Inventory reporting should include:

* Current stock
* Low stock
* Out of stock
* Inventory movements
* Stock adjustments
* Stock transfers
* Product valuation
* Stock by branch
* Stock by business unit
* Stock movement history

---

# 331. Inventory Valuation

Since you want intermediate financial capabilities, the system should prepare the architecture for inventory valuation.

However, I recommend keeping the first implementation simple.

Potential methods can later include:

* Cost price
* Average cost

We should **not introduce complex accounting inventory valuation** unless required.

---

# 332. Product Cost

Products should have a cost value separate from selling price.

Example:

```text
Selling price:
₦10,000

Cost:
₦7,000
```

This allows:

```text
Gross profit:
₦3,000
```

in reporting.

Because procurement is excluded, the initial cost can be manually entered/updated by authorized users.

---

# 333. Cost History

Cost changes should be auditable.

Historical sales should retain the relevant cost snapshot if profit reporting depends on it.

Otherwise future cost changes would incorrectly rewrite historical profitability.

---

# 334. Product Configuration by Business Type

This is where the **dynamic platform architecture** becomes important.

Business type should influence the default experience, not create a completely different product system.

For example:

### Supermarket

Default:

```text
Stock tracking ✓
Barcode ✓
Variants optional
```

### Clothing

```text
Stock tracking ✓
Variants ✓
Size ✓
Color ✓
```

### Salon

```text
Services ✓
Stock tracking optional
Barcode optional
```

### Electronics

```text
Stock tracking ✓
Serial number support potentially enabled
```

The product engine remains shared.

---

# 335. Business Type Should Not Hard-Code Features

Avoid code such as:

```text
if businessType === "restaurant" {
   ...
}

if businessType === "pharmacy" {
   ...
}
```

everywhere in the application.

Instead, the business type should primarily establish:

```text
Feature Configuration
+
Default Settings
+
Default Catalog Configuration
```

This is much more scalable.

---

# 336. Product Capability Flags

A product can have configurable capabilities such as:

```text
Track Inventory
Has Variants
Requires Barcode
Has Cost
Can Be Discounted
Taxable
Service Item
```

This gives the platform flexibility without creating separate product models.

---

# 337. Example: Clothing Product

```text
Product:
Men's Shirt

Type:
PRODUCT

Category:
Men's Clothing

Variants:
Black / M
Black / L
White / M
White / L

Inventory:
Tracked

Barcode:
Yes

Discountable:
Yes
```

---

# 338. Example: Salon Service

```text
Product:
Haircut

Type:
SERVICE

Category:
Hair Services

Inventory:
Not tracked

Barcode:
No

Price:
₦10,000
```

The same POS engine handles both.

---

# 339. Example: Electronics

```text
Product:
Samsung 55" TV

Type:
PRODUCT

Inventory:
Tracked

SKU:
TV-SAM-55-001

Barcode:
...

Cost:
₦850,000

Price:
₦1,000,000
```

---

# 340. Product Module Architecture

The conceptual model becomes:

```text
                 PRODUCT
                    │
        ┌───────────┼────────────┐
        │           │            │
    Category      Brand       Variants
                                  │
                           SKU / Barcode
                                  │
                     ┌────────────┴──────────┐
                     │                       │
                  Pricing                Inventory
                     │                       │
                  Branch                 Movements
                                             │
                                  ┌──────────┴─────────┐
                                  │                    │
                                Sales               Transfers
                                  │
                              Transactions
```

---

# 341. Critical Product/Inventory Rule

The database should never treat:

```text
product.stock
```

as the complete inventory system.

Inventory belongs to the combination of the relevant organizational/location context and product.

Conceptually:

```text
Inventory
(
  product_id,
  branch_id,
  quantity_on_hand,
  quantity_reserved
)
```

with appropriate uniqueness constraints.

---

# 342. Critical Pricing Rule

Likewise:

```text
product.price
```

should not be the sole source of pricing.

Instead:

```text
Branch
+
Product
=
Applicable Price
```

This supports your branch-level pricing requirement.

---

# 343. Product + Transaction Snapshot

When a sale occurs, the transaction item should preserve the relevant values at the moment of sale.

For example:

```text
Product:
Coke

Current price:
₦800
```

but yesterday:

```text
Sale:
₦700
```

The historical sale must continue showing:

```text
₦700
```

even after the product price changes.

---

# 344. Inventory + Transaction Integrity

A completed sale should produce both:

```text
Sale Item
```

and:

```text
Inventory Movement
```

as part of the same atomic operation.

This relationship is fundamental to the entire system.

---

# 345. Product Permissions

Recommended permission structure:

```text
Products
├── View Products
├── Create Products
├── Edit Products
├── Archive Products
├── Delete Products
├── Manage Categories
├── Manage Brands
├── Manage Variants
├── Manage Pricing
├── View Inventory
├── Adjust Inventory
├── Transfer Stock
└── Export Products
```

The Owner can assign these permissions to custom roles.

---

# 346. Product Module Completion Criteria

The module is complete when:

* Products can be created.
* Products belong to one business unit.
* The same product cannot exist across multiple business units.
* Products can have variants.
* Variants can have SKUs and barcodes.
* Categories are dynamic.
* Products can be physical or service-based.
* Inventory is branch-specific.
* Pricing is branch-configurable.
* Stock movements are ledger-based.
* Stock transfers work.
* Transfers are atomic.
* Low-stock thresholds work.
* Negative inventory is prevented by default.
* Product archiving preserves history.
* Historical transaction prices remain immutable.
* Product changes are audited.
* Granular product permissions work.
* Bulk import/export is supported or architecturally prepared.

---

# Stage: Business Types, Business Units & Configuration Engine

This is the architectural layer that makes the POS genuinely **dynamic** rather than simply being a retail POS with a few optional features.

The core principle should be:

> **Business type determines the recommended/default configuration; configuration determines what the system actually does.**

A business type should **never** be the mechanism that hard-codes functionality.

---

# 347. The Organizational Hierarchy

The platform should use this hierarchy:

```text
SUPER ADMIN
    │
    └── CLIENT ORGANIZATION
            │
            ├── Organization Settings
            ├── Subscription
            ├── Users
            ├── Roles & Permissions
            │
            ├── Branch A
            │      │
            │      ├── Business Unit A
            │      │       ├── Products
            │      │       ├── POS Configuration
            │      │       ├── Pricing
            │      │       └── Transactions
            │      │
            │      └── Business Unit B
            │              ├── Products
            │              ├── POS Configuration
            │              ├── Pricing
            │              └── Transactions
            │
            └── Branch B
                   │
                   └── Business Unit A
```

This gives us three important concepts:

```text
Organization
Branch
Business Unit
```

They must not be treated as interchangeable.

---

# 348. Organization

The **Organization** represents the client/company that purchased the POS.

Example:

```text
ABC Enterprises
```

It owns:

* subscription
* users
* branches
* business units
* system-wide configuration
* branding
* financial configuration
* reporting
* customers
* audit records

The organization is effectively the client's entire POS installation.

Because you've chosen **independent deployment per client**, there is no need to design the application as a conventional shared SaaS multi-tenant system.

---

# 349. Independent Deployment Architecture

Each client deployment is conceptually:

```text
Client A
├── Application
├── Supabase Project
├── Database
└── Storage

Client B
├── Application
├── Supabase Project
├── Database
└── Storage
```

rather than:

```text
One application
    ↓
Many unrelated tenants
    ↓
Shared database
```

This substantially simplifies tenant isolation.

It also means your Super Admin layer needs to be treated differently from normal client application access.

---

# 350. Super Admin

Your Super Admin is the platform operator.

You previously specified:

> Super Admin gets untethered access.

Therefore the Super Admin is **not constrained by a client's subscription state**.

For example:

```text
Client subscription expired
        ↓
Client users → locked out
        ↓
Super Admin → unrestricted access
```

The Super Admin can therefore:

* access deployments
* manage subscription configuration
* configure pricing
* inspect system information
* manage platform-level configuration
* access administrative tooling
* manage client deployment metadata

However, there should still be an **audit trail** for Super Admin actions.

"Untethered" should mean unrestricted operational access—not invisible or unauditable access.

---

# 351. Organization Profile

During onboarding, the Owner should provide:

```text
Business Name
Brand Name
Logo
Primary Color
Secondary Color
Contact Email
Phone
Address
Country
Currency
Timezone
```

Some fields should be system-defined or controlled by Super Admin.

---

# 352. Business Type

You selected the second architectural interpretation:

> **Business type is a classification/default configuration rather than a completely separate system.**

This is the correct approach.

A business type answers:

> "What kind of business does this organization primarily operate?"

It does **not** answer:

> "What code should the application execute?"

---

# 353. Supported Business Types

Initial options:

```text
SUPERMARKET
CONVENIENCE_STORE
RESTAURANT
PHARMACY
CLOTHING_FASHION
ELECTRONICS
HARDWARE_BUILDING_MATERIALS
BEAUTY_SALON_BARBERSHOP
HOTEL
BAKERY
WHOLESALER
GENERAL_RETAIL
OTHER
```

The `OTHER` option is important.

The platform should never assume the list will remain static.

---

# 354. Primary Business Type

An organization can select one or more business types during onboarding, but we should distinguish:

```text
Primary Business Type
```

from:

```text
Business Unit Type
```

For example:

```text
ABC Enterprises

Primary Business Type:
Supermarket
```

but:

```text
Abuja Branch
├── Supermarket
└── Pharmacy
```

The organization remains primarily a supermarket business while also operating a pharmacy.

---

# 355. Business Unit Type

A Business Unit should have its own operational type.

Example:

```text
Business Unit:
ABC Pharmacy

Type:
PHARMACY
```

while:

```text
Business Unit:
ABC Supermarket

Type:
SUPERMARKET
```

This is much more useful than assigning only one type to the entire organization.

---

# 356. Why Business Units Need Types

Consider:

```text
ABC Enterprises
```

with:

```text
Branch 1
├── Supermarket
├── Pharmacy
└── Bakery
```

Each unit can have different:

* product structures
* POS settings
* tax behavior
* service charge behavior
* receipt templates
* categories
* operational workflows

without creating three different applications.

---

# 357. Business Unit Is Not a Branch

A branch answers:

> **Where is the operation physically located?**

A business unit answers:

> **What operational business exists there?**

Example:

```text
Abuja Branch
```

could contain:

```text
Supermarket
Pharmacy
Bakery
```

All three operate in the same physical location.

---

# 358. Business Unit Naming

The Owner should be able to give the unit a custom name.

For example:

```text
Name:
CityCare Pharmacy
```

Type:

```text
PHARMACY
```

or:

```text
Name:
Main Supermarket
```

Type:

```text
SUPERMARKET
```

This prevents the UI from being forced to display generic names.

---

# 359. Business Unit Status

Business units should support:

```text
ACTIVE
INACTIVE
ARCHIVED
```

An inactive unit cannot process new sales.

Historical records remain intact.

---

# 360. Business Unit POS Configuration

You explicitly selected:

> **YES — each business unit should have its own POS configuration.**

Therefore:

```text
Business Unit
       ↓
POS Configuration
```

Example:

```text
Supermarket
├── Default payment method: Cash
├── Tax: Enabled
├── Service charge: Disabled
└── Receipt template: Template A

Restaurant
├── Default payment method: Transfer
├── Tax: Enabled
├── Service charge: Enabled
└── Receipt template: Template B
```

---

# 361. Configuration Hierarchy

We should establish a clear configuration hierarchy.

Recommended:

```text
PLATFORM DEFAULT
      ↓
ORGANIZATION
      ↓
BRANCH
      ↓
BUSINESS UNIT
      ↓
POS TERMINAL
```

Not every setting needs to exist at every level.

---

# 362. Configuration Precedence

When multiple levels define a setting:

```text
Terminal
   ↓
Business Unit
   ↓
Branch
   ↓
Organization
   ↓
Platform Default
```

The most specific applicable configuration wins.

Example:

```text
Platform:
Tax = Enabled

Organization:
Tax = Enabled

Branch:
Tax = Enabled

Business Unit:
Tax = Disabled
```

Result:

```text
Business Unit:
Tax = Disabled
```

---

# 363. Do Not Copy Configuration Blindly

The system should avoid physically duplicating every setting at every level.

Instead, use configuration inheritance.

Conceptually:

```text
setting
value
scope
scope_id
```

This keeps the architecture maintainable.

---

# 364. Configuration Categories

The configuration engine should eventually cover:

```text
POS
Products
Inventory
Pricing
Tax
Service Charges
Payments
Receipts
Customers
Discounts
Returns
Refunds
Layaway
Cash Registers
Notifications
Security
Branding
Reports
```

---

# 365. Feature Flags vs Configuration

These should be separated.

### Feature flag

Answers:

> Is this feature available?

Example:

```text
service_charge_enabled = true
```

### Configuration

Answers:

> How does this feature behave?

Example:

```text
service_charge_type = percentage
service_charge_value = 5
```

Do not combine these into one giant configuration object.

---

# 366. Feature Availability

For example:

```text
Restaurant
Service Charge:
Enabled

Supermarket
Service Charge:
Disabled
```

But both business units use the same underlying service-charge implementation.

---

# 367. Business Type Presets

When creating a business unit, the system can offer:

> Start with recommended settings for Pharmacy

The platform then preconfigures sensible defaults.

Example:

```text
PHARMACY PRESET
├── Inventory tracking: ON
├── Barcode scanning: ON
├── Product variants: ON
├── Customer identification: Available
└── Service charge: OFF
```

The Owner can modify these afterward.

---

# 368. Presets Must Be Editable

The preset should **not lock the business into the selected business type**.

For example, a pharmacy could still enable:

```text
Service Charge
```

if appropriate.

This is the core difference between:

```text
Business Type
```

and:

```text
Feature Configuration
```

---

# 369. Feature Matrix

The system should maintain a conceptual feature registry.

For example:

```text
Feature
├── inventory
├── variants
├── barcode
├── layaway
├── store_credit
├── service_charge
├── customer_management
├── cash_register
├── stock_transfer
├── custom_reports
└── ...
```

Each feature can have:

```text
enabled
configuration
```

at the appropriate scope.

---

# 370. Feature Dependencies

Some features depend on others.

Example:

```text
Layaway
   ↓
Customer Management
```

Therefore the system should not allow:

```text
Customer Management = OFF
Layaway = ON
```

if layaway requires an identified customer.

Similarly:

```text
Stock Transfer
   ↓
Inventory Tracking
```

---

# 371. Dependency Validation

When an administrator enables a feature:

```text
Enable Layaway
```

the system checks dependencies.

If customer management is disabled:

```text
Customer Management is required for Layaway.
Enable it?
```

This prevents invalid configurations.

---

# 372. Configuration UI

The Owner's settings interface should not be one enormous page.

Use sections:

```text
Settings
├── General
├── Business
├── Branches
├── Business Units
├── POS
├── Products
├── Inventory
├── Payments
├── Taxes & Charges
├── Receipts
├── Customers
├── Discounts
├── Layaway
├── Users & Roles
├── Notifications
├── Security
├── Branding
└── Reports
```

---

# 373. POS Configuration

The POS settings should include things such as:

```text
Default payment method
Product search behavior
Barcode scanning
Quick-sale behavior
Discount behavior
Receipt behavior
Tax display
Service charge
Customer requirement
Suspended sales
Refund workflow
```

---

# 374. Default Payment Method

You specified:

> Cash, Card and Transfer.

One can be selected as the default.

Example:

```text
Default:
Cash
```

The POS should therefore make:

```text
Cash
```

the fastest checkout option.

The cashier can still choose:

```text
Card
Transfer
```

when needed.

---

# 375. Tax Configuration

You selected:

> Tax/service charge should be configured as a percentage or fixed amount.

The configuration should therefore support:

```text
Tax
├── Enabled
├── Type
│   ├── Percentage
│   └── Fixed
└── Value
```

However, there is an important distinction.

For tax, percentage-based taxation is generally the more natural model.

The system can support the fixed option if your business requirements require it, but it should be clearly labelled to avoid confusion.

---

# 376. Service Charge

Service charge is a platform-wide capability but can be enabled by an administrator.

Configuration:

```text
Service Charge
├── Enabled
├── Type
│   ├── Percentage
│   └── Fixed
├── Value
└── Apply Automatically
```

Example:

```text
Subtotal:
₦10,000

Service Charge:
5%

Charge:
₦500
```

---

# 377. Discount Configuration

Discount configuration should include:

```text
Percentage
Fixed amount
```

and permissions should determine who can issue them.

---

# 378. Discount Authorization

The POS should not simply assume every cashier can discount.

Permission example:

```text
discount.apply
```

A business could configure:

```text
Cashier:
No discount

Manager:
Yes
```

or:

```text
Cashier:
Yes
```

depending on policy.

---

# 379. Discount Limits

The architecture should support limits.

Example:

```text
Cashier:
Maximum 5%

Manager:
Maximum 20%

Owner:
Unlimited
```

This should be configurable through role permissions.

---

# 380. Refund Configuration

You selected:

> Refunds require authorization.

Therefore the refund workflow should support:

```text
Cashier requests refund
        ↓
Authorization required
        ↓
Authorized user approves
        ↓
Refund processed
```

The authorization should be permission-based.

---

# 381. Store Credit

Store credit is supported.

It must be tied to an existing customer.

Example:

```text
Customer:
John Doe

Store Credit:
₦20,000
```

A cashier cannot arbitrarily create anonymous store credit.

---

# 382. Store Credit Ledger

Store credit should use a ledger rather than simply changing a balance.

Example:

```text
Refund → Store Credit     +₦10,000
Purchase                 -₦4,000
Remaining                 ₦6,000
```

This allows complete auditing.

---

# 383. Layaway Configuration

Layaway should support:

```text
Customer
Outstanding balance
Payment history
Multiple installment payments
```

Example:

```text
Product:
Television

Total:
₦500,000

Initial payment:
₦200,000

Outstanding:
₦300,000
```

Then:

```text
Payment 2:
₦100,000

Outstanding:
₦200,000
```

---

# 384. Layaway State

Recommended:

```text
ACTIVE
PARTIALLY_PAID
PAID
CANCELLED
```

---

# 385. Customer Configuration

Customer identification is enabled according to your selected option.

The POS should allow:

```text
Walk-in customer
```

when customer identification is not mandatory.

But features such as:

```text
Store Credit
Layaway
```

must require an existing customer.

---

# 386. Receipt Configuration

You selected multiple receipt templates.

The Owner should be able to choose from system-provided templates.

For example:

```text
Classic
Compact
Modern
Detailed
```

The Super Admin can control the available templates.

The Owner selects the active one.

---

# 387. Branding

The business can configure:

```text
Logo
Brand Name
Primary Color
Secondary Color
```

The interface should use these values throughout appropriate areas.

However, the POS checkout interface should remain optimized for speed and readability.

Branding must not compromise usability.

---

# 388. Branding Boundaries

Business branding should not be allowed to modify critical accessibility elements arbitrarily.

For example, an administrator should not be able to choose:

```text
light gray text
on
white background
```

and make the POS unreadable.

The design system should maintain minimum contrast rules.

---

# 389. Branch Configuration

Branch-level settings should include things such as:

```text
Branch name
Address
Contact information
Operating status
Pricing
Inventory
Registers
Business units
```

---

# 390. Branch Pricing

As decided earlier:

```text
Organization
   ↓
Branch
   ↓
Product Price
```

This means two branches can legitimately sell the same business-unit product at different prices.

---

# 391. Business Unit Configuration

Business-unit configuration includes:

```text
Name
Type
Status
POS settings
Feature settings
Product catalog
Receipt settings
Tax/service charge settings
```

---

# 392. Terminal Configuration

Although the initial platform is responsive web, individual devices can be treated as POS terminals.

Example:

```text
Terminal:
Front Counter 01

Branch:
Abuja

Business Unit:
Supermarket
```

This becomes useful for:

* terminal-specific defaults
* printer configuration
* customer display configuration
* cashier assignment
* register assignment

---

# 393. Responsive Web Architecture

The initial application remains:

> **Responsive web everywhere.**

Therefore:

```text
Desktop
Tablet
Phone
```

all use the same application.

The interface adapts based on viewport and device capability.

---

# 394. Hardware Architecture

Hardware integration should be designed around browser-compatible mechanisms wherever possible.

### Barcode scanner

Most USB barcode scanners behave like keyboards.

Therefore:

```text
Scanner
 ↓
Keyboard input
 ↓
POS barcode field
```

requires no proprietary backend service.

---

# 395. Receipt Printers

Receipt printing should initially use browser/system printing where possible.

Architecture should keep a printer abstraction:

```text
ReceiptService
   ↓
Browser Print
   ↓
Future Native/Local Printer Bridge
```

This avoids locking the initial system to expensive proprietary printer software.

---

# 396. Customer Displays

Customer display support should be designed as a separate UI surface.

Conceptually:

```text
POS Screen
     │
     ├── Cashier Interface
     │
     └── Customer Display
```

A future implementation can synchronize the display using browser communication mechanisms.

---

# 397. Configuration Audit

Every sensitive configuration change should be audited.

Example:

```text
Service Charge
Old:
Disabled

New:
Enabled

Changed by:
Owner

Timestamp:
...
```

This is particularly important because configuration can change the financial behavior of the POS.

---

# 398. Configuration Versioning

I recommend that configuration changes produce a history rather than silently overwriting everything.

For example:

```text
POS Configuration v1
POS Configuration v2
POS Configuration v3
```

The system does not necessarily need a complicated rollback UI initially.

But the database should preserve enough history to determine:

> What configuration existed when this transaction occurred?

---

# 399. Transaction Configuration Snapshot

This is extremely important.

Suppose:

```text
Tax = 5%
```

today.

A sale occurs.

Tomorrow:

```text
Tax = 7%
```

Historical transactions must remain:

```text
5%
```

Therefore transactional records should store the actual applied values.

The system should never recalculate historical transactions using today's configuration.

---

# 400. Configuration and Offline

You have now explicitly eliminated offline capability.

Therefore:

```text
NO OFFLINE MODE
NO OFFLINE TRANSACTION QUEUE
NO SYNC ENGINE
NO CONFLICT RESOLUTION
NO OFFLINE DATABASE
```

This significantly simplifies the architecture.

The POS requires network connectivity to process transactions.

This also means concurrency can be handled centrally through Supabase/PostgreSQL.

---

# 401. Feature Configuration Security

A normal user must never be able to simply manipulate frontend state to enable a disabled feature.

Bad:

```text
Frontend:
serviceChargeEnabled = true
```

and backend trusts it.

Correct:

```text
Frontend request
       ↓
Backend/database authorization
       ↓
Check configuration
       ↓
Execute
```

Feature availability is therefore enforced server-side.

---

# 402. Recommended Configuration Data Model

Conceptually:

```text
organizations
branches
business_units

feature_definitions
feature_configurations

pos_configurations
tax_configurations
service_charge_configurations
branding_configurations
receipt_configurations
```

The exact schema will be finalized in the database architecture stage.

---

# 403. Configuration Engine Principles

The configuration engine should follow these rules:

### 1. Defaults exist

Every configuration has a safe default.

### 2. Overrides are explicit

Only configured values override inherited values.

### 3. Feature dependencies are validated

Invalid combinations are prevented.

### 4. Server-side enforcement

Configuration is never trusted from the frontend.

### 5. Changes are audited

Sensitive settings generate audit records.

### 6. Transactions snapshot applied settings

Historical behavior never changes retroactively.

---

# 404. What This Architecture Gives Us

With this model, one application can support:

```text
Supermarket
       +
Pharmacy
       +
Restaurant
       +
Salon
       +
Electronics
```

without creating five separate applications.

Instead:

```text
Same Core
   ↓
Different Business Types
   ↓
Different Presets
   ↓
Different Configurations
   ↓
Different Business Units
```

This is the central architectural principle of the POS.

---

# 405. Example Complete Organization

Consider:

```text
ABC Enterprises
```

### Branch: Abuja

```text
Abuja Branch
│
├── Main Supermarket
│     Type: SUPERMARKET
│     Inventory: Enabled
│     Barcode: Enabled
│     Service Charge: Disabled
│
├── ABC Pharmacy
│     Type: PHARMACY
│     Inventory: Enabled
│     Barcode: Enabled
│     Service Charge: Disabled
│
└── ABC Juice Bar
      Type: RESTAURANT
      Inventory: Enabled
      Service Charge: Enabled
```

Each unit gets:

```text
Own configuration
Own product catalog
Own POS behavior
```

while remaining under:

```text
ABC Enterprises
```

---

# 406. Recommended Architectural Decision

At this point, I recommend we formally establish:

> **Business Type = classification + recommended preset**

> **Business Unit = operational entity**

> **Feature Configuration = actual enabled capabilities**

> **Branch = physical location**

> **Organization = client/company**

> **Terminal = individual POS device/session environment**

This should become a foundational rule in the PRD and architecture document.

---

# Stage: Users, Roles, Permissions & Authorization Architecture

This stage defines **who can do what, where they can do it, and under what conditions**.

Because this POS handles money, inventory, refunds, customer credit, employee management and configuration, authorization needs to be designed into the architecture rather than added later.

---

# 408. Authorization Model

The POS will use:

> **RBAC + granular permissions + scope-based access control**

In other words:

```text
ROLE
  ↓
PERMISSIONS
  ↓
SCOPE
  ↓
ACTION
```

A user's role determines what they *can potentially do*.

Their scope determines **where** they can do it.

---

# 409. Example

Suppose:

```text
John
Role: Branch Manager
```

and John is assigned to:

```text
Abuja Branch
```

He may have:

```text
products.view
products.create
products.edit
inventory.view
inventory.adjust
reports.view
users.view
```

But that doesn't mean he can perform those actions across the entire organization.

His effective permission could be:

```text
inventory.adjust
Scope: Abuja Branch
```

---

# 410. Permission Structure

Permissions should follow a predictable naming convention.

Recommended:

```text
resource.action
```

Examples:

```text
products.view
products.create
products.edit
products.delete

sales.view
sales.create
sales.cancel

refunds.view
refunds.create
refunds.approve

customers.view
customers.create
customers.edit

inventory.view
inventory.adjust

reports.view
reports.export
```

This makes permissions easier to understand and manage.

---

# 411. Permission Categories

The initial permission system should cover:

```text
Dashboard
POS
Sales
Returns
Refunds
Products
Categories
Inventory
Stock Transfers
Customers
Store Credit
Layaway
Discounts
Taxes
Service Charges
Cash Registers
Reports
Analytics
Users
Roles
Branches
Business Units
Settings
Receipts
Notifications
Audit Logs
Subscription
```

Not every user will receive these permissions.

---

# 412. Permission Granularity

You selected:

> **Granular permissions**

Therefore we should avoid permissions like:

```text
manage_everything
```

for normal client users.

Instead:

```text
products.view
products.create
products.edit
products.delete
```

This allows the Owner to create very precise roles.

---

# 413. Permission Levels

For some resources, we can use:

```text
View
Create
Edit
Delete
Approve
Export
```

Not every resource needs every action.

For example:

```text
refunds.view
refunds.create
refunds.approve
```

is more appropriate than:

```text
refunds.delete
```

because completed financial transactions should not be deleted.

---

# 414. Immutable Transactions

You specified:

> Transactional data should be immutable.

Therefore permissions must not provide:

```text
sales.delete
refunds.delete
payments.delete
```

in the conventional sense.

Instead, corrective actions should create new records.

For example:

```text
Sale
 ↓
Refund
 ↓
Audit trail
```

rather than:

```text
Sale
 ↓
DELETE
```

---

# 415. System Roles

The platform will contain two fundamentally different authorization domains.

### Platform-level

```text
Super Admin
```

### Client-level

```text
Owner
Branch Manager
Cashier
Salesperson
Pharmacist
Waiter
Kitchen Staff
Custom Role
```

---

# 416. Super Admin

Super Admin is outside normal client RBAC.

Capabilities include:

```text
Manage client deployments
Manage subscription pricing
Manage subscription status
Access client administration
Manage platform configuration
Manage system-level settings
```

The Super Admin has unrestricted access as previously specified.

However:

> **Every Super Admin sensitive action should still be audited.**

---

# 417. Owner

The Owner is the highest-level client user.

Default capabilities:

```text
Organization management
Branch management
Business-unit management
User management
Role management
Product management
Inventory management
POS configuration
Financial configuration
Reports
Analytics
Customer management
Subscription renewal
Branding
System settings
```

The Owner should have a broad permission set by default.

---

# 418. Branch Manager

The Branch Manager operates within assigned branch scope.

Typical permissions:

```text
products.view
products.create
products.edit

inventory.view
inventory.adjust
inventory.transfer

sales.view
refunds.create
refunds.approve

customers.view
customers.create
customers.edit

reports.view
```

But these permissions are configurable by the Owner.

---

# 419. Cashier

Default Cashier permissions:

```text
pos.access
sales.create
sales.view
customers.create
customers.view
suspended_sales.create
suspended_sales.resume
receipts.print
```

They should **not automatically receive**:

```text
refunds.approve
products.delete
users.create
roles.manage
settings.manage
```

---

# 420. Salesperson

Salesperson permissions can focus on:

```text
products.view
customers.view
customers.create
sales.create
sales.view
```

The Owner can modify this role.

---

# 421. Pharmacist

The Pharmacist role exists because the platform supports pharmacy businesses.

However, because you've deliberately excluded prescription-management functionality, this role should initially focus on normal POS operations.

Possible defaults:

```text
pos.access
products.view
products.create
products.edit
inventory.view
customers.view
customers.create
sales.create
refunds.create
```

Any additional pharmacy-specific functionality can be added later without redesigning RBAC.

---

# 422. Waiter

The Waiter role supports restaurant-oriented deployments.

Possible permissions:

```text
pos.access
products.view
sales.create
customers.view
customers.create
```

Since you removed tables, table assignments, reservations and similar restaurant workflows, the Waiter role remains relatively simple.

---

# 423. Kitchen Staff

Since recipes, ingredients and kitchen-management functionality were excluded, Kitchen Staff will have a much smaller initial role.

The role can remain in the architecture for future restaurant functionality.

Possible permissions:

```text
kitchen.view
orders.view
```

If those capabilities aren't enabled for a business unit, the role effectively has no operational functionality there.

---

# 424. Custom Roles

The Owner should be able to create:

```text
Custom Role
```

Example:

```text
Senior Cashier
```

with:

```text
POS
Sales
Customers
Discounts
Reports
```

but without:

```text
Refund Approval
User Management
Settings
```

---

# 425. Role Creation Workflow

Owner:

```text
Settings
 → Roles & Permissions
 → Create Role
```

Then:

```text
Role Name:
Senior Cashier

Permissions:
☑ View products
☑ Create sales
☑ Apply discounts
☐ Approve refunds
☑ View customers
☐ Manage users
```

Then:

```text
Save Role
```

---

# 426. Roles Should Be Permission Sets

A role should essentially be:

```text
Role
+
Permissions
+
Scope
```

Example:

```text
Senior Cashier
├── pos.access
├── sales.create
├── sales.view
├── discounts.apply
└── customers.view

Scope:
Abuja Branch
```

---

# 427. Scope-Based Authorization

This is one of the most important parts of the architecture.

A user can have permission:

```text
products.edit
```

but that permission must be scoped.

Possible scopes:

```text
Organization
Branch
Business Unit
```

---

# 428. Example

User:

```text
John
```

Role:

```text
Branch Manager
```

Scope:

```text
Abuja Branch
```

John attempts:

```text
Edit Product
Lagos Branch
```

Result:

```text
403 Forbidden
```

Even if:

```text
products.edit = true
```

because John doesn't have the appropriate scope.

---

# 429. Business Unit Scope

The architecture should also support:

```text
Scope:
Business Unit
```

Example:

```text
Pharmacy Manager
```

can manage:

```text
Abuja Branch
 └── Pharmacy
```

but cannot manage:

```text
Abuja Branch
 └── Supermarket
```

unless explicitly granted access.

---

# 430. Multi-Scope Assignment

A user may need access to multiple locations.

Example:

```text
Regional Manager
```

could have:

```text
Abuja Branch
Lagos Branch
Kaduna Branch
```

with the same permissions.

Therefore the data model should support **multiple scope assignments**, not just one branch ID on the user.

---

# 431. User Assignment Model

Conceptually:

```text
User
 ↓
Role Assignment
 ↓
Role
 ↓
Permissions

Role Assignment
 ↓
Scope
```

This is preferable to embedding role information directly inside the user record.

---

# 432. Multiple Roles

I recommend allowing a user to have multiple roles where appropriate.

Example:

```text
John
├── Cashier
└── Inventory Officer
```

Their effective permissions are the union of the assigned roles, subject to scope.

This is more flexible than forcing every employee into exactly one role.

---

# 433. Permission Conflicts

A key question is what happens if:

```text
Role A:
refunds.approve = YES

Role B:
refunds.approve = NO
```

I recommend:

> **Explicit deny should override allow.**

However, for the first implementation, we can simplify this by avoiding explicit deny permissions entirely.

Instead:

```text
User receives permission
OR
User does not receive permission
```

This greatly reduces complexity.

---

# 434. Recommended Initial Model

Use:

```text
Allow-based RBAC
```

rather than:

```text
Allow + Deny RBAC
```

Example:

```text
Cashier
→ refunds.approve = absent
```

Therefore:

```text
Not authorized
```

---

# 435. Sensitive Actions

Some actions should require **both permission and additional authorization**.

Examples:

```text
Refund
Large discount
Store credit adjustment
Layaway cancellation
Inventory adjustment
User permission changes
```

This creates:

```text
Permission
+
Authorization
```

rather than merely:

```text
Permission
```

---

# 436. Refund Authorization

Example:

```text
Cashier
    ↓
Request Refund
    ↓
System checks permission
    ↓
Authorization required
    ↓
Manager approves
    ↓
Refund recorded
```

The approving user must possess:

```text
refunds.approve
```

---

# 437. Authorization Methods

We should support:

```text
Manager selection
```

rather than requiring a password-sharing workflow.

For example:

```text
Refund requires authorization

Select authorized employee:
[ Branch Manager ]

Confirm authorization
```

The manager authenticates using their own active session/credential.

No employee should ever need to give their password to another employee.

---

# 438. Discount Authorization

Depending on configuration:

```text
Cashier applies 5% discount
```

could be automatically permitted.

But:

```text
Cashier applies 25% discount
```

could trigger authorization.

This is where configurable permission thresholds become useful.

---

# 439. Permission Thresholds

For selected actions, configuration can support:

```text
Maximum allowed without authorization
```

Example:

```text
Cashier discount limit:
10%
```

Then:

```text
0–10%
→ permitted

>10%
→ manager authorization
```

---

# 440. User Status

Users should have:

```text
ACTIVE
SUSPENDED
INVITED
DISABLED
```

An inactive employee cannot authenticate into the POS.

Historical transactions remain linked to the employee.

---

# 441. Employee Deletion

Employees should generally **not be physically deleted** if they have transactional history.

Instead:

```text
Active employee
      ↓
Disabled employee
```

This preserves:

```text
Sale created by:
John Doe
```

even if John no longer works there.

---

# 442. Invitation Workflow

Owner/authorized manager:

```text
Users
 → Add Employee
```

Enter:

```text
Name
Email
Role
Branch
Business Unit
```

System sends an invitation.

User establishes their account credentials.

---

# 443. Email

You selected:

> Resend

Therefore employee invitations can use Resend.

The same email infrastructure can handle:

```text
Employee invitation
Password reset
Subscription expiry notifications
Security notifications
System notifications
```

---

# 444. Account Recovery

The authentication system should support:

```text
Forgot Password
Reset Password
Session Management
Account Disablement
```

MFA is explicitly excluded from the current requirements.

---

# 445. Session Security

Even without MFA, sessions should be protected through:

```text
Secure cookies/tokens
Session expiration
Server-side authorization
Revocation capability
Password hashing
Rate limiting
```

---

# 446. Login Protection

The authentication system should protect against:

```text
Brute-force attempts
Credential stuffing
Session hijacking
```

using appropriate rate limiting and secure authentication practices.

---

# 447. Subscription Enforcement

Subscription state is also an authorization boundary.

For normal client users:

```text
Subscription ACTIVE
        ↓
Access permitted
```

When expired:

```text
Subscription EXPIRED
        ↓
Login disabled
        ↓
Existing sessions invalidated
```

The Super Admin remains unaffected.

---

# 448. Important: Subscription Enforcement Must Be Server-Side

Do **not** implement:

```text
if(subscriptionExpired) {
  showExpiredScreen()
}
```

only in the frontend.

A user could potentially bypass that.

Instead:

```text
Request
 ↓
Authentication
 ↓
Subscription validation
 ↓
Authorization
 ↓
Resource access
```

---

# 449. Authorization Evaluation

A request should conceptually pass through:

```text
1. Is the user authenticated?
        ↓
2. Is the account active?
        ↓
3. Is the subscription active?
        ↓
4. Does the user have the permission?
        ↓
5. Does the permission apply to this scope?
        ↓
6. Is additional authorization required?
        ↓
7. Execute action
        ↓
8. Audit action
```

Super Admin bypasses the client subscription restriction.

---

# 450. Supabase RLS

Because the stack is:

> **Supabase + ERN**

Row Level Security should be a major part of the authorization architecture.

The database should not rely solely on frontend permission checks.

Conceptually:

```text
Frontend
   ↓
API / Supabase
   ↓
Authorization
   ↓
PostgreSQL RLS
   ↓
Data
```

---

# 451. Defense in Depth

We should have:

```text
UI permission checks
        +
Application authorization
        +
Supabase/Postgres RLS
```

The frontend improves UX.

The application layer enforces business rules.

RLS provides database-level protection.

---

# 452. Example RLS Scenario

Suppose John belongs to:

```text
Abuja Branch
```

and attempts to retrieve:

```text
Lagos Branch sales
```

Even if the frontend accidentally sends the request:

```text
GET Lagos sales
```

the database should prevent unauthorized rows from being returned.

---

# 453. Audit System

Because you selected a complete audit system, authorization events should be auditable.

Examples:

```text
User created
Role created
Permission changed
User role changed
User suspended
Refund approved
Discount authorized
Configuration changed
Subscription renewed
Subscription expired
```

---

# 454. Audit Record

Conceptually:

```text
Actor:
John Doe

Action:
refund.approve

Resource:
Refund #1234

Scope:
Abuja Pharmacy

Timestamp:
2026-08-21 14:32

Result:
SUCCESS
```

For failures:

```text
Result:
DENIED
```

This is valuable for security investigations.

---

# 455. Audit Logs Must Be Append-Only

Normal users should not be able to:

```text
Edit audit log
Delete audit log
```

The Super Admin should have access to audit records but should also have their own actions audited.

---

# 456. Authorization Performance

The POS must remain extremely fast.

We should avoid repeatedly performing expensive permission queries on every button click.

The architecture should cache appropriate non-sensitive authorization metadata where safe, while maintaining server-side enforcement.

The UI should immediately know:

```text
Can this user see this button?
```

while the backend remains authoritative.

---

# 457. Permission-Aware UI

For example:

Cashier does not have:

```text
refunds.approve
```

Therefore:

```text
Approve Refund
```

should not appear.

But hiding the button is **not security**.

The backend still rejects unauthorized requests.

---

# 458. Recommended Authorization Data Model

Conceptually:

```text
users
roles
permissions

role_permissions

user_roles

role_scopes
```

Potential scope fields:

```text
organization_id
branch_id
business_unit_id
```

depending on assignment.

---

# 459. Effective Permission

A user's effective authorization can be thought of as:

```text
Effective Permission =
User
+
Role
+
Permission
+
Scope
+
Feature Configuration
+
Subscription State
```

All of these conditions must be satisfied where applicable.

---

# 460. Example End-to-End

John is a cashier.

```text
Role:
Cashier

Permission:
sales.create

Scope:
Abuja Supermarket

Feature:
POS enabled

Subscription:
Active
```

John can:

```text
Create sale
```

But:

```text
Refund approval
```

fails because:

```text
refunds.approve
```

is absent.

And:

```text
Edit Lagos inventory
```

fails because the scope doesn't match.

---

# 461. Why This Model Is Appropriate

This gives us a POS that can support:

```text
Small single-branch store
```

and also:

```text
Large organization
├── 20 branches
├── 50 business units
├── 300 employees
└── custom operational roles
```

without fundamentally changing the authorization architecture.

---

# 462. Stage Decision

The PRD should now formally state:

> **The POS shall implement granular, scope-aware RBAC with customizable roles and permissions. Authorization shall be enforced at the application and database layers, with sensitive actions requiring additional authorization where configured.**

---

# Stage: Product & Inventory Architecture

This stage defines the **universal product engine** of the POS.

The goal is not to create separate product systems for supermarkets, pharmacies, clothing stores, electronics stores, etc.

Instead, we create **one flexible product model** that can represent different kinds of products through configuration.

The guiding principle is:

> **A product is a universal commercial item; its business-specific behavior is determined by its configuration and inventory model.**

---

# 464. Product Architecture

The product system should be structured approximately as:

```text
Organization
   │
   └── Branch
         │
         └── Business Unit
                │
                └── Product
                      ├── Category
                      ├── Variants
                      ├── SKU
                      ├── Barcode(s)
                      ├── Pricing
                      ├── Inventory
                      └── Configuration
```

However, there is one important decision from your earlier answer:

> **The same product cannot exist in multiple business units.**

We should preserve that.

Therefore, product ownership belongs to a **specific business unit**, rather than globally to the entire organization.

---

# 465. Product Ownership

Example:

```text
ABC Enterprises
│
└── Abuja Branch
      │
      ├── Supermarket
      │     └── Coca-Cola 50cl
      │
      └── Pharmacy
            └── Paracetamol
```

The Coca-Cola product belongs to the Supermarket business unit.

The Pharmacy cannot simply attach that same product record to itself.

It would need its own product record.

This maintains the separation you requested.

---

# 466. Product Identity

Every product should have:

```text
Product ID
Product Name
SKU
Category
Description
Product Type
Status
Brand
Image
```

Some fields should be optional.

For example, a hardware store may care about:

```text
Brand
Model
Material
```

while a supermarket may not.

---

# 467. Product Status

Products should support:

```text
ACTIVE
INACTIVE
ARCHIVED
```

An inactive product:

* cannot normally be added to new sales
* remains visible in historical transactions
* retains its inventory history

An archived product should remain available for reporting/history.

---

# 468. Product Types

The universal engine should initially support:

```text
STANDARD
VARIANT
SERVICE
COMPOSITE
```

But we should be careful with **COMPOSITE**.

Because you explicitly removed:

* recipes
* ingredients
* modifiers
* add-ons

we should not build a complex manufacturing/BOM engine at this stage.

Therefore, the initial implementation can focus primarily on:

```text
STANDARD
VARIANT
SERVICE
```

with composite products reserved architecturally for future expansion.

---

# 469. Standard Product

A standard product is a single sellable item.

Example:

```text
Product:
Coca-Cola 50cl

SKU:
COKE-50

Barcode:
5449000000996
```

It has one inventory identity.

---

# 470. Variant Product

Variants represent products where different configurations are individually sellable.

Examples:

### Clothing

```text
T-Shirt
├── Black / Small
├── Black / Medium
├── Black / Large
├── White / Small
├── White / Medium
└── White / Large
```

### Electronics

```text
iPhone
├── 128GB
├── 256GB
└── 512GB
```

Each variant can have:

* SKU
* barcode
* price
* stock quantity
* image
* status

---

# 471. Variant Attributes

Rather than hard-coding:

```text
size
color
storage
```

we should support configurable variant attributes.

Example:

```text
Variant Attribute:
Color

Values:
Black
White
Blue
```

Another product could use:

```text
Variant Attribute:
Storage

Values:
128GB
256GB
512GB
```

---

# 472. Variant Combinations

For clothing:

```text
Color:
Black
White

Size:
S
M
L
```

the system can produce:

```text
Black / S
Black / M
Black / L
White / S
White / M
White / L
```

Each combination becomes an independently trackable inventory item.

---

# 473. SKU

SKU should be **business-defined**.

The system can automatically generate one, but administrators should be able to customize it.

Example:

```text
SKU:
TSH-BLK-M
```

SKU uniqueness should be enforced within the relevant business-unit product catalog.

---

# 474. Barcode

Barcode support is critical.

A product/variant can have one or more barcode identifiers.

Example:

```text
Product:
Coke 50cl

Barcode:
5449000000996
```

A variant can have:

```text
SKU:
SHOE-BLK-42

Barcode:
1234567890123
```

---

# 475. Multiple Barcodes

I recommend supporting multiple barcodes per product/variant.

Why?

Some businesses may have:

* manufacturer barcode
* internal barcode
* alternate barcode
* old barcode

Example:

```text
Product
├── Barcode A
├── Barcode B
└── Barcode C
```

Any valid barcode can locate the item at checkout.

---

# 476. Barcode Uniqueness

Barcode uniqueness should be enforced at the appropriate deployment level.

Two active products in the same business unit should not normally have the same barcode.

Otherwise:

```text
Scanner
 ↓
Barcode
 ↓
??? Product
```

becomes ambiguous.

---

# 477. Categories

Categories are dynamic and administrator-defined.

Example:

```text
Supermarket
├── Beverages
├── Snacks
├── Household
└── Personal Care
```

Clothing:

```text
Clothing
├── Shirts
├── Trousers
├── Dresses
└── Shoes
```

Pharmacy:

```text
Pharmacy
├── Analgesics
├── Vitamins
├── Antibiotics
└── Personal Care
```

---

# 478. Category Hierarchy

The architecture should support nested categories.

Example:

```text
Electronics
└── Phones
      └── Smartphones
            └── Android
```

However, the UI should not force businesses to create deep hierarchies.

A simple:

```text
Category
```

should work perfectly.

---

# 479. Brands

Brands should be optionally associated with products.

Example:

```text
Brand:
Samsung
```

This becomes particularly useful for:

* electronics
* fashion
* cosmetics
* beverages
* pharmaceuticals

---

# 480. Product Images

Products should support images.

Storage should use Supabase Storage.

Recommended:

```text
product-images/
    organization/
        business-unit/
            product/
```

The application should generate appropriate thumbnails where useful.

---

# 481. Product Pricing

You specified:

> **Pricing is configurable at branch level.**

Therefore pricing should not be permanently embedded in the product itself.

Conceptually:

```text
Product
   ↓
Branch Price
```

Example:

```text
Coke 50cl

Abuja Branch:
₦500

Lagos Branch:
₦550
```

---

# 482. Business Unit Pricing

Because products belong to business units, pricing needs to respect:

```text
Business Unit
    ↓
Branch
    ↓
Price
```

Example:

```text
Abuja Branch
├── Supermarket
│     └── Coke → ₦500
│
└── Pharmacy
      └── Paracetamol → ₦1,500
```

---

# 483. Price History

Prices should be historical.

If:

```text
August 20:
₦500
```

and:

```text
August 21:
₦550
```

a transaction from August 20 must still show:

```text
₦500
```

not the current ₦550.

Therefore sale lines must store the actual selling price applied.

---

# 484. Pricing Rules

Initial pricing should remain simple.

Support:

```text
Base price
Selling price
Discount
```

We do **not** need a complex pricing engine initially.

Avoid building:

* customer-specific pricing
* membership pricing
* complex price books

because you explicitly excluded customer-specific pricing and loyalty/membership features.

---

# 485. Cost Price

The product engine should support cost price because reporting requires profitability calculations.

Example:

```text
Cost:
₦300

Selling:
₦500

Gross margin:
₦200
```

The cost used for historical reporting must be captured appropriately.

---

# 486. Inventory Models

You specifically requested:

> **Different inventory models.**

This is one of the most important dynamic features.

The system should support multiple inventory tracking modes.

---

# 487. Inventory Model 1 — Quantity

The basic model:

```text
Quantity:
100
```

Suitable for:

* supermarkets
* convenience stores
* clothing
* electronics
* general retail

---

# 488. Inventory Model 2 — Decimal Quantity

Some businesses sell by measurable quantities.

Examples:

```text
25.5 kg
3.75 meters
12.5 liters
```

Therefore inventory quantities should not necessarily be restricted to integers.

The data model should support:

```text
numeric/decimal quantity
```

where appropriate.

---

# 489. Units of Measurement

Products should support configurable units.

Examples:

```text
Piece
Pack
Box
Kg
Gram
Liter
Milliliter
Meter
Centimeter
```

The business should be able to define additional units if necessary.

---

# 490. Unit Precision

Each unit can have an appropriate precision.

Example:

```text
Piece:
0 decimals

Kilogram:
3 decimals

Liter:
3 decimals
```

This prevents awkward quantities such as:

```text
1.237 pieces
```

while permitting:

```text
1.237 kg
```

---

# 491. Inventory Model 3 — Serialized Inventory

For products where every physical unit has a unique identifier:

```text
Laptop
IMEI
Device Serial Number
```

The system can support serialized items.

Example:

```text
Laptop
├── SN-001
├── SN-002
└── SN-003
```

This is particularly valuable for:

* electronics
* high-value equipment

---

# 492. Serialized Sales

When selling a serialized product:

```text
Scan product
       ↓
Select serial number
       ↓
Validate availability
       ↓
Complete sale
```

The serial number becomes attached to the transaction.

---

# 493. Batch/Lot Inventory

Pharmacies and some other businesses benefit from batch tracking.

The product engine should support:

```text
Batch Number
Expiry Date
Quantity
```

Example:

```text
Paracetamol

Batch:
PCM-2026-A

Expiry:
2028-06-30

Quantity:
100
```

---

# 494. Expiry Tracking

Expiry tracking should be configurable rather than mandatory for every product.

For example:

```text
Pharmacy:
Enabled

Supermarket:
Optional

Clothing:
Disabled
```

This is another example of the configuration-driven architecture.

---

# 495. Expiry Alerts

Where expiry tracking is enabled:

```text
90 days before expiry
60 days
30 days
7 days
```

can eventually generate notifications.

The exact alert intervals should be configurable.

---

# 496. Batch Selection

For batch-tracked products, the POS should have a configurable stock-selection policy.

For example:

```text
FEFO
First Expiry, First Out
```

This is particularly useful for pharmacy operations.

However, since prescription management and advanced pharmaceutical workflows are excluded, this should remain strictly an inventory capability.

---

# 497. Inventory Ownership

You previously selected:

> Business unit should have its own inventory.

Therefore:

```text
Business Unit
    ↓
Inventory
```

rather than:

```text
Organization
    ↓
Global inventory
```

---

# 498. Example

```text
Abuja Branch
├── Supermarket
│     └── Coke
│          Stock: 200
│
└── Pharmacy
      └── Paracetamol
           Stock: 150
```

The supermarket's inventory and pharmacy's inventory are independent.

---

# 499. Branch-Level Inventory

Because you also selected branch-specific inventory, the full conceptual relationship is:

```text
Organization
 ↓
Branch
 ↓
Business Unit
 ↓
Product
 ↓
Inventory
```

This allows:

```text
Abuja / Supermarket / Coke = 200
Lagos / Supermarket / Coke = 120
```

But remember your Q23 decision:

> **The same product record should not exist in multiple business units.**

So the product catalog ownership must remain clear.

---

# 500. Stock Transfers

You changed the original decision to:

> **YES — keep it simple.**

The first implementation should support only:

```text
Source Business Unit
        ↓
Transfer Request
        ↓
Destination Business Unit
        ↓
Receive
```

No complex procurement or warehouse-management system.

---

# 501. Stock Transfer Example

```text
Abuja Supermarket
Coke:
200 units
```

Transfer:

```text
50 units
```

to:

```text
Lagos Supermarket
```

After confirmation:

```text
Abuja:
150

Lagos:
+50
```

---

# 502. Transfer Status

Keep the workflow simple:

```text
PENDING
COMPLETED
CANCELLED
```

Potentially:

```text
PENDING
   ↓
RECEIVED
```

The exact workflow can be finalized during transaction design.

---

# 503. Stock Transfer Authorization

Not everyone should automatically transfer stock.

Permission:

```text
inventory.transfer
```

can be assigned to:

```text
Owner
Branch Manager
Custom Role
```

depending on business policy.

---

# 504. Stock Adjustments

The system needs inventory adjustments.

Examples:

```text
+20
-5
```

Reasons could include:

```text
Opening balance
Correction
Stock count
Administrative adjustment
```

You explicitly excluded:

* damaged stock
* wastage

so these should not be first-class inventory adjustment reasons.

---

# 505. Inventory Ledger

Never simply update:

```text
stock_quantity = 95
```

without recording why.

Instead maintain an inventory movement ledger:

```text
+100 Opening Stock
-5 Sale
+10 Adjustment
-20 Transfer
```

Current stock becomes the result of those movements.

---

# 506. Inventory Movement

Conceptually:

```text
Inventory Movement
├── Product
├── Business Unit
├── Quantity
├── Movement Type
├── Reference
├── User
└── Timestamp
```

Movement types could include:

```text
SALE
RETURN
ADJUSTMENT
TRANSFER_OUT
TRANSFER_IN
OPENING_BALANCE
```

---

# 507. Returns and Inventory

A returned product should create an inventory movement.

Example:

```text
Sale:
-1

Return:
+1
```

Whether the returned item becomes sellable again can be determined by the return workflow.

Since damaged stock is explicitly excluded, we should not introduce a damaged-stock subsystem merely to handle this.

---

# 508. Stock Count

Inventory should support stock counting.

Example:

```text
System quantity:
100

Physical count:
97
```

The system records:

```text
Adjustment:
-3
```

rather than silently changing the quantity.

---

# 509. Low Stock

Products can have:

```text
Low Stock Threshold
```

Example:

```text
Coke
Current: 8
Threshold: 10
```

The system generates:

```text
Low Stock
```

notification.

---

# 510. Out of Stock

When:

```text
quantity = 0
```

the product should normally become unavailable for sale.

However, the business should have a configurable option for whether negative stock is allowed.

---

# 511. Negative Stock

I recommend:

> **Negative inventory should be disabled by default.**

A sale should not be allowed when:

```text
Available stock = 0
```

unless an authorized configuration explicitly allows it.

This protects inventory integrity.

---

# 512. Inventory Concurrency

Because you specifically requested concurrency checks, stock updates must be atomic.

Bad:

```text
Read stock = 5
Frontend says sell 4
Write stock = 1
```

Two simultaneous cashiers could both read:

```text
5
```

and sell more than the available inventory.

Correct:

```text
Atomic transaction
        ↓
Validate current stock
        ↓
Reserve/decrement
        ↓
Create sale
        ↓
Commit
```

PostgreSQL is particularly useful here.

---

# 513. Product Creation Permissions

You previously specified:

> Super Admin, Admin, Branch Manager, Custom Roles.

Therefore:

```text
products.create
```

should be assignable to those roles.

It should not automatically belong to:

```text
Cashier
Waiter
```

unless explicitly configured.

---

# 514. Product Deletion

Products should generally not be physically deleted once they have transaction history.

Instead:

```text
ACTIVE
 ↓
INACTIVE
 ↓
ARCHIVED
```

This protects historical data.

---

# 515. Category Deletion

Categories should follow similar rules.

If products currently reference a category, the system should either:

* prevent deletion, or
* require reassignment before deletion.

I recommend reassignment or deactivation rather than destructive deletion.

---

# 516. Product Custom Fields

This is one area where the dynamic POS can become extremely powerful.

Instead of hard-coding every industry-specific field, support optional custom product attributes.

Example:

### Electronics

```text
Model
Warranty Period
Voltage
```

### Clothing

```text
Material
Fit
Gender
```

### Hardware

```text
Material
Length
Grade
```

### Pharmacy

```text
Active Ingredient
Strength
Dosage Form
```

These are **descriptive fields**, not advanced pharmaceutical functionality.

---

# 517. Custom Field Architecture

Conceptually:

```text
Product Field Definition
        ↓
Product Field Value
```

For example:

```text
Field:
Material

Product:
Hammer

Value:
Steel
```

This avoids adding hundreds of nullable database columns.

---

# 518. Important Restriction

Custom fields should **not** replace core system fields.

For example:

```text
price
quantity
SKU
barcode
product ID
```

must remain first-class fields.

Custom fields are for additional information.

---

# 519. Product Search

The POS needs extremely fast search.

Search should support:

```text
Product name
SKU
Barcode
Category
Brand
Variant
```

Barcode lookup should be optimized separately from general text search.

---

# 520. POS Search Behavior

The cashier can:

```text
Scan barcode
```

or:

```text
Type product name
```

or:

```text
Search SKU
```

Results should appear rapidly.

For the POS interface, unnecessary network requests should be minimized.

---

# 521. Search Indexing

PostgreSQL should be able to handle the initial search requirements using appropriate indexes.

We should avoid introducing an external search engine such as Elasticsearch because:

> Your target is free infrastructure and a maximum paid-service budget of approximately $10.

PostgreSQL is sufficient for the initial scale.

---

# 522. Product Catalog UI

The product management interface should provide:

```text
Products
├── Search
├── Filters
├── Categories
├── Brands
├── Status
├── Inventory status
└── Create Product
```

---

# 523. Product Creation Flow

Example:

```text
Create Product
      ↓
Basic Information
      ↓
Product Type
      ↓
Category
      ↓
Pricing
      ↓
Inventory Model
      ↓
Variants / Barcodes
      ↓
Additional Fields
      ↓
Save
```

The UI should dynamically change based on the selected inventory/product model.

---

# 524. Dynamic Form Example

If:

```text
Inventory Model:
Serialized
```

show:

```text
Serial Number configuration
```

If:

```text
Inventory Model:
Batch
```

show:

```text
Batch
Expiry
```

If:

```text
Product Type:
Variant
```

show:

```text
Variant Attributes
```

This is exactly how the platform remains flexible without becoming cluttered.

---

# 525. Inventory Model Selection

I recommend making inventory model explicit during product creation:

```text
Inventory Tracking

○ None
○ Quantity
○ Decimal Quantity
○ Serialized
○ Batch/Lot
```

Not every business needs every model.

---

# 526. Service Products

A service product has:

```text
Inventory:
None
```

Examples:

```text
Haircut
Installation
Consultation
Repair Service
```

This makes the POS usable by:

* salons
* barbers
* service businesses

without forcing fake inventory quantities.

---

# 527. Bakery Example

A bakery can use:

```text
Product:
Chocolate Cake

Inventory Model:
Quantity

Unit:
Piece
```

No recipe or ingredient tracking is required.

---

# 528. Hardware Store Example

```text
Product:
Cable

Inventory:
Decimal Quantity

Unit:
Meter
```

The POS can sell:

```text
2.5 meters
```

without requiring a recipe/ingredient system.

---

# 529. Clothing Store Example

```text
Product:
Polo Shirt

Type:
Variant

Attributes:
Color
Size

Inventory:
Quantity
```

Each variant tracks its own stock.

---

# 530. Electronics Example

```text
Product:
Laptop

Inventory:
Serialized

Attributes:
RAM
Storage

Serial:
SN12345
```

This allows the POS to know exactly which unit was sold.

---

# 531. Pharmacy Example

```text
Product:
Paracetamol 500mg

Inventory:
Batch/Lot

Unit:
Pack

Batch:
PCM2026-01

Expiry:
2028-05
```

No prescription workflow is required.

---

# 532. Supermarket Example

```text
Product:
Coca-Cola 50cl

Inventory:
Quantity

Unit:
Piece

Barcode:
...
```

This represents the simplest possible product.

---

# 533. Product Architecture Summary

The final model becomes:

```text
                 PRODUCT
                    │
        ┌───────────┼────────────┐
        │           │            │
     Category      SKU        Barcode(s)
        │
     Variants
        │
 Inventory Model
        │
 ┌──────┼─────────────┐
 │      │             │
Qty   Serialized    Batch
 │                    │
Unit                Expiry
 │
Stock
 │
Inventory Ledger
```

---

# 534. Critical Database Principle

Inventory quantity should **not** be treated as the only source of truth.

We should maintain:

```text
Inventory Balance
+
Inventory Movement Ledger
```

The balance enables fast reads.

The ledger provides:

* auditability
* reconciliation
* debugging
* historical analysis

---

# 535. Product & Inventory Security

Every inventory-sensitive operation should record:

```text
Actor
Product
Business Unit
Branch
Quantity
Previous Balance
New Balance
Reason
Timestamp
Reference
```

This is particularly important for:

* adjustments
* returns
* transfers
* sales

---

# 536. Product Architecture Decision

The PRD should formally establish:

> **The POS shall provide a universal, configurable product engine capable of supporting standard, variant, service, quantity-based, decimal, serialized and batch/lot inventory models. Industry-specific behavior shall be achieved through configuration and optional attributes rather than separate product subsystems.**

---

# 537. What We Have Now

The architecture is beginning to converge:

```text
Organization
    ↓
Branches
    ↓
Business Units
    ↓
Business Type / Preset
    ↓
Feature Configuration
    ↓
Products
    ↓
Inventory
    ↓
POS
```

And authorization operates across the entire hierarchy:

```text
User
 ↓
Role
 ↓
Permission
 ↓
Scope
 ↓
Business Unit / Branch
```

---

