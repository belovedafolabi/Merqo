# Stage: UX/UI & Design System Specification

We now move from **application architecture** into the visual and interaction system. The goal is to make the POS feel like **one coherent product**, while allowing each client to apply their own branding without breaking usability.

---

# 1. Design Philosophy

The system should follow two distinct but related design philosophies.

### Management interface

**Modern SaaS**

* Clean
* Minimal
* Information-dense
* Professional
* Spacious where appropriate
* Strong hierarchy
* Desktop-first but responsive

### POS interface

**Operational / speed-first**

* Extremely fast
* Large touch targets
* Minimal navigation
* High information density
* Keyboard-friendly
* Scanner-friendly
* Few unnecessary animations
* Important actions always obvious

The POS should feel closer to a **professional retail terminal** than a normal SaaS dashboard.

---

# 2. Core Design Principles

### 1. Speed

Every common POS operation should require as few interactions as reasonably possible.

### 2. Clarity

A cashier should immediately understand:

> What am I selling, how much is it, and what do I need to do next?

### 3. Consistency

Buttons, forms, tables, modals, notifications and navigation should behave consistently.

### 4. Progressive disclosure

Don't expose advanced functionality unless it is relevant.

### 5. Configuration over duplication

Different businesses should use the same underlying components with different capabilities.

### 6. Accessibility

The interface must remain usable with:

* keyboard
* mouse
* touch
* barcode scanners
* screen readers where practical

---

# 3. Color System

Your decision:

> **Neutral black/white + business-configurable branding**

is a good fit.

The base application should therefore use neutral design tokens.

Conceptually:

```text
Background
Surface
Surface Secondary
Border
Text Primary
Text Secondary
Text Muted
Success
Warning
Danger
Info
```

The business branding sits on top.

---

# 4. Business Branding

During onboarding/settings, the owner can configure:

### Brand name

```text
Business Name
```

### Logo

Upload business logo.

### Primary color

Used for:

* primary buttons
* selected navigation
* links
* important actions
* branded receipt elements

### Secondary color

Used more sparingly for:

* secondary actions
* accents
* visual differentiation

---

# 5. Branding Safety

A client should **not be allowed to completely redefine the UI colors**.

For example, a business shouldn't be able to select:

> bright yellow text on white backgrounds.

Instead:

```text
Brand Color
      ↓
Contrast validation
      ↓
Generate usable shades
      ↓
Apply to allowed tokens
```

This protects usability and accessibility.

---

# 6. Typography

Use a modern sans-serif system.

A strong default would be:

**Inter**

with system fallbacks.

Typography hierarchy:

```text
Display
H1
H2
H3
H4
Body
Body Small
Caption
Label
```

The POS should use slightly larger text than the management dashboard because it must work comfortably on touch screens.

---

# 7. Spacing

Use a consistent spacing scale.

Conceptually:

```text
4
8
12
16
20
24
32
40
48
64
```

Avoid arbitrary values throughout the application.

This makes the UI much easier to maintain.

---

# 8. Border Radius

The system should use moderate rounding.

Avoid the extremely rounded "consumer app" appearance.

Suggested philosophy:

```text
Inputs       → medium
Buttons      → medium
Cards        → medium
Dialogs      → medium
POS controls → medium
```

The overall appearance should be **professional rather than playful**.

---

# 9. Shadows

Use shadows sparingly.

Most dashboard components should rely primarily on:

```text
surface
border
spacing
```

rather than heavy shadows.

Dialogs and floating POS elements can use stronger elevation.

---

# 10. Component System

The component foundation should use:

* shadcn/ui
* Radix primitives
* Tailwind

Core components:

```text
Button
Input
Select
Combobox
Checkbox
Radio
Switch
Tabs
Dialog
Drawer
Dropdown
Popover
Tooltip
Toast
Alert
Badge
Card
Table
Pagination
Breadcrumb
Command Menu
Date Picker
Data Table
```

---

# 11. POS-Specific Components

We should create specialized components rather than forcing generic dashboard components into the POS.

Examples:

```text
POSSearch
BarcodeInput
ProductGrid
ProductTile
Cart
CartItem
CartSummary
PaymentSelector
CashPayment
CardPayment
TransferPayment
CustomerSelector
DiscountDialog
SuspendSaleDialog
RefundDialog
ReceiptPreview
```

---

# 12. Management Navigation

The dashboard navigation should be generated dynamically.

Example:

```text
┌──────────────────────┐
│ Logo / Business      │
├──────────────────────┤
│ Overview             │
│ POS                  │
│ Sales                │
│ Products             │
│ Inventory            │
│ Customers            │
│ Layaways             │
│ Reports              │
│ Employees            │
│ Notifications        │
│ ──────────────────── │
│ Settings             │
└──────────────────────┘
```

But a user only sees modules they are authorized to access.

---

# 13. Business Unit Switcher

Because you have:

> Branch → Business Units

the application needs a very clear context switcher.

For example:

```text
Abuja Branch
  ├── Supermarket
  └── Pharmacy
```

A user might see:

```text
Current Business Unit
┌────────────────────────┐
│ Abuja Branch            │
│ Supermarket         ▼   │
└────────────────────────┘
```

Switching the business unit changes the operational context.

---

# 14. Important Context Rule

The system should always know:

```text
Current Organization
Current Branch
Current Business Unit
Current User
```

These should be part of the user's active application context.

This prevents accidental operations against the wrong branch/business unit.

---

# 15. POS Layout

Desktop:

```text
┌─────────────────────────────────────────────────────────────┐
│ Business Unit       Search       Customer    Cashier   Menu │
├─────────────────────────────────────┬───────────────────────┤
│                                     │                       │
│ Product Search                      │ CART                  │
│                                     │                       │
│ [Search / Barcode]                  │ Product 1       x2    │
│                                     │ Product 2       x1    │
│ ┌────────┐ ┌────────┐ ┌────────┐   │ Product 3       x4    │
│ │Product │ │Product │ │Product │   │                       │
│ └────────┘ └────────┘ └────────┘   │                       │
│                                     │ Subtotal              │
│ ┌────────┐ ┌────────┐ ┌────────┐   │ Discount              │
│ │Product │ │Product │ │Product │   │ Tax                   │
│ └────────┘ └────────┘ └────────┘   │ Service charge        │
│                                     │                       │
│                                     │ TOTAL                 │
│                                     │                       │
│                                     │ [ CHECKOUT ]          │
└─────────────────────────────────────┴───────────────────────┘
```

---

# 16. POS Header

Keep the header extremely compact.

It should contain:

* business unit
* current cashier
* customer
* connection/system status
* quick actions
* menu

Avoid a large SaaS-style header.

---

# 17. Product Grid

Product tiles should show:

```text
Product image
Product name
Price
Optional SKU
```

For businesses with many products, the grid should support:

* categories
* search
* pagination/infinite loading
* recently used products

---

# 18. Barcode Workflow

The ideal flow:

```text
Scanner
 ↓
Barcode input
 ↓
Exact lookup
 ↓
Product found
 ↓
Add to cart
 ↓
Search input remains focused
```

A cashier should be able to scan:

```text
SCAN
SCAN
SCAN
SCAN
SCAN
```

without repeatedly clicking the search field.

---

# 19. Cart

Each cart item should support:

```text
Product
Variant
Quantity
Unit price
Discount
Subtotal
Remove
```

Quantity should be adjustable through:

```text
−   2   +
```

and optionally direct keyboard input.

---

# 20. Checkout Button

The checkout action should always be visually dominant.

Example:

```text
┌──────────────────────────────┐
│ TOTAL                        │
│ ₦125,500                     │
│                              │
│        CHECKOUT              │
└──────────────────────────────┘
```

Keyboard shortcut should also trigger it.

---

# 21. Payment Interface

Payment selection should be extremely simple.

```text
Choose Payment

┌────────┐ ┌────────┐ ┌────────┐
│ Cash   │ │ Card   │ │Transfer│
└────────┘ └────────┘ └────────┘

Total: ₦25,000
```

If Cash:

```text
Amount Received
₦30,000

Change
₦5,000
```

Then:

```text
[ COMPLETE SALE ]
```

---

# 22. Customer Selection

Customer identification should be optional for ordinary purchases.

Therefore:

```text
Checkout
   │
   ├── Walk-in customer
   │
   └── Existing customer
```

But customer identification becomes mandatory when required for:

* store credit
* layaway
* customer-specific records

---

# 23. Store Credit UX

If cashier chooses Store Credit:

```text
Select Customer
      ↓
Customer balance
      ↓
Available credit
      ↓
Amount to use
      ↓
Confirm
```

Never allow a cashier to simply type a customer name and apply credit.

The customer must correspond to an existing account.

---

# 24. Layaway UX

Layaway should have its own workflow rather than appearing like an ordinary payment method.

```text
Customer
 ↓
Products
 ↓
Total
 ↓
Initial payment
 ↓
Outstanding balance
 ↓
Create layaway
```

The UI should clearly distinguish:

```text
PAID
REMAINING
DUE
```

---

# 25. Suspended Sales

A cashier should be able to press:

> **Hold Sale**

The system displays a lightweight confirmation:

```text
Hold this sale?

Customer:
Walk-in

Items:
7

Total:
₦54,500

[Cancel] [Hold Sale]
```

Then return immediately to an empty POS.

---

# 26. Resume Sale

A "Held Sales" panel should display:

```text
Held Sales

#1024
7 items
₦54,500
Today, 10:42 AM

[Resume]
```

The user should be able to quickly locate the sale.

---

# 27. Discounts

Discounts should be visually explicit.

Example:

```text
Subtotal      ₦50,000
Discount       -₦5,000
Tax             ₦3,375
────────────────────
TOTAL          ₦48,375
```

The UI should identify:

```text
Discount: 10%
```

or:

```text
Discount: ₦5,000
```

---

# 28. Refund Interface

Refunds should intentionally feel more deliberate than normal sales.

Example:

```text
Refund Sale #10293

Original Total: ₦75,000

Items:
☑ Product A
☑ Product B
☐ Product C

Refund Amount:
₦50,000

Reason:
[ Required ]

[ Request Refund ]
```

Then:

```text
Authorization Required
```

if the current user cannot authorize it.

---

# 29. Management Tables

Data-heavy screens should use consistent tables.

Example:

```text
Products

Search                         Filter      + Add Product

┌──────┬────────────┬────────┬────────┬────────────┐
│      │ Product    │ SKU    │ Price  │ Stock      │
├──────┼────────────┼────────┼────────┼────────────┤
│      │ Coca-Cola  │ CC001  │ ₦700   │ 124        │
│      │ Bread      │ BR002  │ ₦1,200 │ 45         │
└──────┴────────────┴────────┴────────┴────────────┘
```

---

# 30. Product Creation

The product form should be progressive.

### Basic

```text
Product name
SKU
Barcode
Category
Description
```

### Pricing

```text
Selling price
Cost price
Tax
```

### Inventory

```text
Track inventory?
Initial quantity
Reorder threshold
```

### Variants

```text
Has variants?
```

This prevents users from being overwhelmed.

---

# 31. Inventory UX

Inventory should communicate three things immediately:

```text
Current quantity
Inventory value
Stock status
```

Example:

```text
Stock Status

● In Stock
● Low Stock
● Out of Stock
```

---

# 32. Stock Adjustment

Stock adjustments should require:

```text
Product
Quantity
Adjustment type
Reason
```

Because you want auditability, the reason should not be optional for manual adjustments.

---

# 33. Stock Transfers

You decided:

> YES, but keep it simple.

The UX can therefore be:

```text
Transfer Stock

From:
Abuja Supermarket

To:
Wuse Supermarket

Product:
Coca-Cola

Quantity:
20

[Transfer]
```

The system records:

```text
Source:
-20

Destination:
+20
```

as linked inventory movements.

---

# 34. Business Unit Product Restriction

You explicitly decided:

> The same product cannot exist in multiple business units.

This needs to be reflected clearly in the UX.

When creating a product:

```text
Business Unit
[ Abuja Supermarket ]
```

Once created, the product belongs to that business unit.

This prevents accidental catalog crossover.

---

# 35. Branch-Level Pricing

Because pricing is configurable at:

> Branch level

the UI should make pricing context explicit.

For example:

```text
Product:
Coca-Cola

Branch:
Abuja

Selling Price:
₦700
```

If another branch has:

```text
Lagos
₦750
```

that is a separate branch price configuration.

---

# 36. Employee Management

The employee screen should clearly distinguish:

```text
User
Role
Branch
Business Unit
Status
Permissions
```

Example:

```text
John Doe
Cashier
Abuja → Supermarket
Active
```

---

# 37. Custom Roles

Role creation should be permission-based.

Example:

```text
Create Role

Name:
Senior Cashier

Permissions

Sales
☑ View
☑ Create
☑ Discount
☐ Refund
☐ Delete

Products
☑ View
☐ Create
```

This is much better than a simple role dropdown.

---

# 38. Permission Groups

Instead of showing hundreds of permissions in one giant list:

```text
Sales
Inventory
Products
Customers
Employees
Reports
Settings
```

expand each section.

This makes granular RBAC manageable.

---

# 39. Onboarding

The onboarding experience is especially important because the system is dynamic.

Suggested flow:

```text
1. Create account
        ↓
2. Business information
        ↓
3. Select business type
        ↓
4. Configure branch
        ↓
5. Configure business units
        ↓
6. Select capabilities
        ↓
7. Configure branding
        ↓
8. Create first employee
        ↓
9. Configure POS
        ↓
10. Finish
```

---

# 40. Business Type Selection

The business type should **not permanently lock the business into one mode**.

For example:

```text
Business:
ABC Enterprises

Business types:
☑ Supermarket
☑ Pharmacy
```

The selected types influence the recommended configuration.

---

# 41. Capability Configuration

After selecting business type:

```text
Recommended Features

Inventory                 ✓
Barcode scanning          ✓
Customers                 ✓
Store credit              ✓
Layaway                   ✓
Service charge            ✓

Additional Features

Restaurant ordering       ○
Kitchen management        ○
...
```

The owner can configure what is actually enabled, subject to your product rules.

---

# 42. Business Unit Setup

Onboarding should ask:

```text
How is your business structured?

Branch
 ├── Supermarket
 └── Pharmacy
```

This establishes your important distinction between:

> business → branch → business unit

---

# 43. Subscription UX

The Owner should see:

```text
Subscription

Current Plan
Standard

Status
● Active

Expires
September 18, 2026

29 days remaining

[ Renew Subscription ]
```

When seven days remain:

```text
⚠ Subscription expires in 7 days

[Renew Now]
```

---

# 44. Expired Subscription

Your requirement is strict.

When expired:

```text
LOGIN
  ↓
Subscription check
  ↓
EXPIRED
  ↓
ACCESS DENIED
```

Existing sessions should also be invalidated.

The exception:

> **Super Admin remains completely untethered.**

---

# 45. Super Admin UI

The Super Admin is fundamentally different from a client Owner.

Super Admin should have a dedicated application area:

```text
Super Admin

Organizations
Subscriptions
Deployments
System Configuration
System Users
Audit
Platform Health
```

---

# 46. Super Admin Must Not Be Constrained by Client Subscription

Your explicit rule:

> Super Admin gets untethered access.

Therefore subscription middleware must recognize:

```text
role = SUPER_ADMIN
```

and bypass client subscription restrictions.

This should be enforced securely server-side, not simply hidden in the UI.

---

# 47. Notifications

Use a consistent notification center.

```text
🔔

Notifications

Subscription expires in 6 days
10 minutes ago

Refund requires authorization
25 minutes ago

Inventory low: Coca-Cola
1 hour ago
```

Unread notifications should be visually distinct.

---

# 48. Email Design

Resend emails should use the same branding system.

For clients:

```text
[Business Logo]

Subscription Reminder

Your POS subscription expires in 7 days.

[Renew Subscription]

Business Name
```

System emails should remain functional rather than marketing-heavy.

---

# 49. Error States

Every major screen needs:

### Loading

Skeletons rather than blank screens.

### Empty

Explain what the user should do.

Example:

> No products yet. Create your first product to start selling.

### Error

Give the user an actionable message.

> We couldn't load your products. Try again.

Not:

> Error 500.

---

# 50. Confirmation Strategy

Don't ask for confirmation for every action.

### No confirmation

* add cart item
* change quantity
* search
* filter

### Confirmation

* delete product
* deactivate employee
* refund
* remove business unit
* destructive inventory operation

This keeps the POS fast.

---

# 51. Destructive Actions

Use a consistent pattern:

```text
This action cannot be undone.

[Cancel] [Continue]
```

But remember:

**Transactional records should never actually be deleted.**

Deletion means:

```text
soft delete / archive
```

where appropriate.

---

# 52. Immutable Transactions

Sales, payments, refunds and other financial records should be treated as immutable.

Instead of:

```text
UPDATE sale
SET total = ...
```

after completion:

```text
Original Sale
      ↓
Correction / Refund / Adjustment
```

This preserves financial history.

---

# 53. Accessibility

Target at least WCAG-conscious design practices:

* sufficient contrast
* visible focus states
* keyboard navigation
* semantic buttons
* labels for inputs
* no color-only indicators
* accessible dialogs
* usable touch targets

This is especially important because POS users may operate the system quickly.

---

# 54. Mobile

The mobile interface should not simply shrink the desktop dashboard.

For example, the mobile POS could use:

```text
┌──────────────────┐
│ Search / Barcode │
├──────────────────┤
│                  │
│ Products         │
│                  │
│                  │
├──────────────────┤
│ 3 Items  ₦12,500 │
│                  │
│ [ VIEW CART ]    │
└──────────────────┘
```

The cart becomes a bottom sheet/drawer.

---

# 55. Desktop Dashboard

A typical dashboard:

```text
┌─────────────────────────────────────────────────────┐
│ Good morning, John                    🔔   Profile  │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Sales Today       Transactions      Avg. Sale       │
│ ₦1.2m             184               ₦6,521          │
│                                                     │
│ ┌──────────────────────────┐ ┌───────────────────┐ │
│ │ Sales Overview           │ │ Low Stock         │ │
│ │                          │ │                   │ │
│ │        GRAPH             │ │ Coca-Cola    4    │ │
│ │                          │ │ Bread        2    │ │
│ └──────────────────────────┘ └───────────────────┘ │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

# 56. Dark Mode

I recommend **supporting dark mode at the architecture/design-token level**, but not making it a major initial design priority.

The system should be built so it can support:

```text
Light
Dark
System
```

later without redesigning components.

The POS can initially prioritize light mode because of its retail environment and printing/display considerations.

---

# 57. Final Design System Direction

The visual identity can therefore be summarized as:

> **Neutral enterprise SaaS foundation + configurable client branding + purpose-built high-speed POS interface.**

It should avoid looking like:

* a generic admin template
* a flashy fintech dashboard
* a restaurant-only POS
* a pharmacy-only application

It should look like a **serious general-purpose business operating system**.

---