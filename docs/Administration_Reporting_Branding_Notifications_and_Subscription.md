# Stage 30 — Administration, Reporting, Branding, Notifications & Subscription

This stage defines the **management layer** of the Dynamic POS: everything the Owner/Admin and Super Admin need to configure, monitor, manage, brand, report on, and maintain the system.

It sits above the product, inventory, transaction, customer, and business-specific modules already defined.

---

# 30.1 Administration Hierarchy

The system has two fundamentally different administrative levels.

```text
SUPER ADMIN
   │
   └── Client Business
          │
          ├── Owner / Admin
          │      │
          │      ├── Branches
          │      │      └── Business Units
          │      │
          │      ├── Employees
          │      ├── Products
          │      ├── Customers
          │      ├── Inventory
          │      ├── Transactions
          │      └── Reports
          │
          └── Subscription
```

The **Super Admin is untethered** from the client's subscription status.

If a client's subscription expires, the Super Admin retains access.

---

# 30.2 Owner / Admin Dashboard

The Owner/Admin dashboard is the primary management interface for the client.

It should provide an overview of:

* Sales
* Revenue
* Transactions
* Inventory
* Customers
* Employees
* Branches
* Business units
* Outstanding layaways
* Store credit
* Reports
* Notifications
* Subscription

The exact dashboard widgets should be configurable based on permissions.

---

# 30.3 Dashboard KPIs

The dashboard should support metrics such as:

```text
Today's Sales
Today's Transactions
Average Transaction Value
Items Sold
Refunds
Discounts
Low Stock
Outstanding Layaway
Store Credit
```

Where applicable:

```text
Gross Sales
Net Sales
Tax
Service Charges
Tips
```

---

# 30.4 Branch Dashboard Context

The Admin should be able to switch between:

```text
All Branches
Branch A
Branch B
Branch C
```

Reports and dashboard metrics should update according to the selected scope.

---

# 30.5 Business Unit Context

Where a branch contains multiple business units:

```text
Wuse
├── Supermarket
└── Pharmacy
```

the Admin should be able to view:

```text
Entire Branch
Supermarket
Pharmacy
```

This prevents the reporting layer from mixing operational contexts unintentionally.

---

# 30.6 Employee Management

Admin users should be able to:

* Create employees
* Invite employees
* Activate employees
* Deactivate employees
* Assign roles
* Change roles
* Assign branches
* Assign business units
* Revoke access

The employee's permissions should derive from their assigned role.

---

# 30.7 Employee Access Scope

A user's role and scope determine what they can access.

Example:

```text
Cashier
   ↓
Wuse Branch
   ↓
Supermarket
```

That cashier should not automatically gain access to:

```text
Maitama Branch
Pharmacy Unit
Owner Settings
```

unless explicitly authorized.

---

# 30.8 Custom Roles

You previously approved:

> Custom roles + granular permissions.

The Admin should therefore be able to create roles such as:

```text
Senior Cashier
Inventory Officer
Sales Supervisor
Pharmacy Assistant
Operations Manager
```

with individually selected permissions.

---

# 30.9 Permission Categories

Permissions should be grouped logically.

For example:

```text
Products
Inventory
Customers
Transactions
Refunds
Discounts
Employees
Reports
Settings
Branches
Business Units
Subscription
```

The detailed permission matrix will be finalized during the security/architecture stage.

---

# 30.10 Branch Management

Admins can:

* Create branches
* Edit branches
* Activate/deactivate branches
* Configure branch details
* Configure branch pricing
* Configure branch inventory
* Configure branch POS settings
* Assign employees

---

# 30.11 Business Unit Management

A branch can contain sub-businesses/business units.

Example:

```text
Branch
├── Supermarket
├── Pharmacy
└── Juice Bar
```

Admins can:

* Create business units
* Configure their business type
* Enable capabilities
* Assign products
* Configure POS behaviour
* Assign employees
* Activate/deactivate units

---

# 30.12 Business Settings

The Owner/Admin can configure:

* Business name
* Business type
* Contact information
* Address
* Currency
* Tax
* Service charge
* Default payment method
* Receipt settings
* POS settings
* Customer settings
* Inventory settings
* Notifications

---

# 30.13 Branding

You explicitly selected configurable business branding.

Each client can upload:

### Logo

```text
Business logo
```

### Brand name

```text
ABC Supermarket
```

### Primary colour

```text
#000000
```

### Secondary colour

```text
#FFFFFF
```

---

# 30.14 Branding Architecture

The application should have a neutral foundation:

```text
Black
White
Neutral shades
```

The business branding is applied as a theme layer:

```text
Base Design System
       +
Business Theme
       ↓
Client Interface
```

This avoids creating separate frontend designs for every customer.

---

# 30.15 Branding Scope

Branding can appear in:

* Admin dashboard
* POS
* Receipts
* Login
* Business-facing UI

System-critical UI elements should retain sufficient contrast regardless of the chosen colours.

---

# 30.16 Receipt Templates

The system should provide multiple receipt templates.

The Owner/Admin can select the preferred template.

Example:

```text
Template A
Template B
Template C
```

Receipt templates should support:

* Business logo
* Business name
* Branch
* Business unit
* Items
* Quantities
* Prices
* Discounts
* Tax
* Service charge
* Tips
* Total
* Payment method
* Transaction ID
* Date/time

---

# 30.17 Digital Receipts

Digital receipts are supported.

They can be generated from completed transactions.

The system should **not require email/SMS/WhatsApp delivery**.

A receipt can instead be:

* Viewed
* Downloaded
* Printed

according to the available workflow.

---

# 30.18 Receipt Printing

The application must support receipt printing through compatible browser/device printing workflows and supported receipt printers.

The hardware integration layer will be refined in Stage 31.

---

# 30.19 Reporting System

You selected:

> **All reporting and analytics capabilities + custom reports.**

Therefore reporting should be treated as a first-class subsystem.

---

# 30.20 Core Reports

The system should provide reports for:

### Sales

* Sales summary
* Sales by day
* Sales by branch
* Sales by business unit
* Sales by employee
* Sales by product
* Sales by category

### Transactions

* Completed transactions
* Returns
* Refunds
* Discounts
* Cancelled transactions

### Inventory

* Current stock
* Low stock
* Out-of-stock
* Stock movements
* Adjustments
* Transfers
* Stock counts

### Customers

* Customer activity
* Customer purchases
* Store credit
* Layaway

### Financial

* Revenue
* Tax
* Service charge
* Tips
* Discounts
* Refunds

---

# 30.21 Report Filtering

Reports should support filters such as:

```text
Date range
Branch
Business unit
Employee
Product
Category
Transaction status
Payment method
Customer
```

Not every filter applies to every report.

---

# 30.22 Report Time Ranges

Common shortcuts:

```text
Today
Yesterday
This week
Last week
This month
Last month
This quarter
This year
Custom range
```

---

# 30.23 Custom Report Builder

You explicitly approved custom reports.

The Admin should be able to select:

```text
Data source
      ↓
Fields
      ↓
Filters
      ↓
Grouping
      ↓
Sorting
      ↓
Output
```

Example:

> Show total sales of products in the Pharmacy business unit between January and March, grouped by category.

---

# 30.24 Custom Report Safety

The custom report builder must respect permissions.

A user who cannot view financial information must not be able to construct a custom report that exposes financial fields.

This must be enforced at the backend/data-access layer, not only hidden from the UI.

---

# 30.25 Report Export

Reports should support:

* CSV
* XLSX
* PDF

where practical.

Large reports should be generated efficiently rather than loading massive datasets into the browser.

---

# 30.26 Report Scope

Reports must respect organizational hierarchy:

```text
Business
   ↓
Branch
   ↓
Business Unit
```

A Branch Manager should not automatically see company-wide figures.

---

# 30.27 Notifications

Notifications are supported through:

### In-app

and

### Email

Email notifications go to the configured Admin email address.

---

# 30.28 Notification Events

Approved notification categories include:

* Suspicious transaction
* Cash variance
* New employee
* Subscription expiry
* Important system events

You excluded:

* Failed payment
* Purchase order approval

Purchase orders are already outside the important product scope.

---

# 30.29 In-App Notification Centre

The Admin should have a notification centre:

```text
Notifications
──────────────────
● Subscription expires in 6 days
● New employee added
● Cash variance detected
● Suspicious transaction detected
```

Notifications should have:

* Read/unread state
* Timestamp
* Notification type
* Related entity
* Action where appropriate

---

# 30.30 Email Notifications

Email notifications should be sent through **Resend**.

The architecture should centralize email sending:

```text
Application Event
      ↓
Notification Service
      ↓
Resend
      ↓
Admin Email
```

This avoids embedding email logic throughout the application.

---

# 30.31 Subscription System

The POS is subscription-based.

You selected:

> One price for all features.

There should therefore be **no feature-tier restrictions** based on subscription level.

---

# 30.32 Subscription Duration

The Owner/Admin chooses:

* Monthly
* Quarterly
* Semi-annually
* Annually

The price for each duration is controlled by the Super Admin.

---

# 30.33 Subscription Pricing

The Super Admin should be able to configure:

```text
Monthly:
₦X

Quarterly:
₦X

Semi-Annual:
₦X

Annual:
₦X
```

The actual pricing remains configurable rather than hardcoded.

---

# 30.34 Subscription Payment

Subscription renewal occurs through:

**Paystack**

The payment flow is:

```text
Admin Dashboard
      ↓
Select duration
      ↓
View price
      ↓
Pay with Paystack
      ↓
Payment verification
      ↓
Subscription extended
```

---

# 30.35 Customer POS Payments

This is a critical separation:

> **The POS does NOT process the client's customers' actual POS payments through Paystack.**

The customer may pay using:

* Cash
* Card
* Bank transfer
* Store credit

as already defined.

Paystack is only used by the client to pay **your software subscription**.

---

# 30.36 Subscription State

The subscription should maintain:

```text
START DATE
END DATE
STATUS
PLAN/DURATION
PAYMENT REFERENCE
```

Statuses can include:

```text
ACTIVE
EXPIRING
EXPIRED
```

---

# 30.37 Subscription Countdown

The Admin dashboard should prominently display:

```text
Subscription
────────────────
Expires in 12 days
```

As it approaches expiry:

```text
7 days
6 days
5 days
...
1 day
```

A **Renew Subscription** action should be readily available.

---

# 30.38 Seven-Day Warning

Starting exactly **7 days before expiration**, the system should begin sending email reminders.

Schedule:

```text
7 days remaining
5 days remaining
3 days remaining
1 day remaining
```

However, your earlier requirement specified:

> Email every 2 days starting from the 7-day countdown.

Therefore the intended schedule should be:

```text
7 days
5 days
3 days
1 day
```

rather than daily emails.

---

# 30.39 Expiration Behaviour

You explicitly selected:

> **Complete application lock.**

When the subscription expires:

```text
Client Application
       ↓
LOCKED
```

Login is disabled.

Existing authenticated sessions are invalidated.

Users are logged out.

---

# 30.40 Super Admin Exception

The subscription lock **does not apply to the Super Admin**.

Therefore:

```text
Subscription expired
       │
       ├── Client users → LOCKED
       │
       └── Super Admin → ACCESS
```

This allows you to:

* Inspect the deployment
* Manage the client
* Review subscription state
* Resolve issues
* Renew/modify subscription status

---

# 30.41 Subscription Security

The client must not be able to bypass subscription expiration by manipulating:

* Browser state
* Local storage
* System time
* Frontend JavaScript
* API requests

Subscription status must be enforced server-side.

---

# 30.42 Subscription Renewal After Expiration

The Owner/Admin should still be able to reach the necessary subscription-renewal flow despite the application being locked.

Therefore the architecture needs a **minimal subscription-access path** rather than simply making every route inaccessible.

Conceptually:

```text
Expired
   ↓
Authentication
   ↓
Subscription Renewal Page
   ↓
Paystack
   ↓
Successful Payment
   ↓
Application Unlocked
```

This preserves your "completely locked" requirement while still allowing renewal.

---

# 30.43 Super Admin Subscription Management

The Super Admin can:

* View clients
* View subscription status
* Configure prices
* View subscription duration
* View payment records
* Activate/deactivate subscription state where authorized
* Extend subscriptions
* Inspect expired deployments

---

# 30.44 Subscription Payment Records

Each subscription payment should store:

```text
Business
Amount
Currency
Duration
Payment provider
Payment reference
Status
Created at
Verified at
Subscription period
```

Paystack should be treated as the payment processor, while your database remains the source of truth for subscription state after successful verification.

---

# 30.45 Subscription Idempotency

Subscription payment verification must be idempotent.

A payment callback should never cause:

```text
1 payment
→
2 subscription extensions
```

The payment reference should uniquely identify the transaction.

---

# 30.46 Admin Activity

Important administrative actions should eventually feed the audit system:

```text
Employee created
Role changed
Product created
Price changed
Branch created
Business unit created
Subscription renewed
Subscription settings changed
Receipt template changed
Branding changed
```

The detailed audit architecture is Stage 31.

---

# 30.47 Administration Dashboard Structure

A recommended structure:

```text
Dashboard
│
├── Overview
│
├── POS
│
├── Products
│
├── Inventory
│
├── Customers
│
├── Employees
│
├── Branches
│
├── Business Units
│
├── Transactions
│
├── Reports
│
├── Notifications
│
├── Settings
│
└── Subscription
```

The actual navigation should dynamically hide sections the logged-in user cannot access.

---

# 30.48 Admin Configuration Principle

The Admin dashboard should not expose configuration options that the business cannot use.

For example:

```text
Restaurant capabilities disabled
```

means restaurant-specific configuration should not unnecessarily clutter the interface.

This is one of the main UX benefits of the Dynamic POS architecture.

---

# 30.49 Stage 30 — Final Scope

### Administration

✅ Admin dashboard
✅ Business settings
✅ Branch management
✅ Business-unit management
✅ Employee management
✅ Custom roles
✅ Granular permissions
✅ Product administration
✅ Inventory administration
✅ Customer administration
✅ Transaction administration

### Branding

✅ Logo
✅ Brand name
✅ Primary colour
✅ Secondary colour
✅ Neutral base UI
✅ POS branding
✅ Admin branding
✅ Receipt branding

### Receipts

✅ Multiple templates
✅ Template selection
✅ Digital receipts
✅ Printing
❌ Email receipts
❌ SMS receipts
❌ WhatsApp receipts

### Reporting

✅ Sales reports
✅ Transaction reports
✅ Inventory reports
✅ Customer reports
✅ Financial reports
✅ Branch reports
✅ Business-unit reports
✅ Employee reports
✅ Custom reports
✅ Filters
✅ Export

### Notifications

✅ In-app
✅ Email via Resend
✅ Suspicious transactions
✅ Cash variance
✅ New employee
✅ Subscription alerts

### Subscription

✅ One product/feature tier
✅ Monthly
✅ Quarterly
✅ Semi-annual
✅ Annual
✅ Super Admin pricing
✅ Paystack
✅ Renewal from Admin dashboard
✅ Subscription countdown
✅ 7-day warning
✅ Every-2-day email reminders
✅ Complete client lock on expiry
✅ Session invalidation
✅ Super Admin exemption

---

## Stage 30 Architectural Outcome

At this point, the platform's major management architecture becomes:

```text
                    SUPER ADMIN
                         │
                         ▼
                CLIENT BUSINESS
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
     BRANCHES        EMPLOYEES       SUBSCRIPTION
        │                │
        ▼                ▼
 BUSINESS UNITS      ROLES/RBAC
        │
        └───────────────┐
                        ▼
                  POS PLATFORM
                        │
       ┌────────────────┼────────────────┐
       ▼                ▼                ▼
   PRODUCTS         CUSTOMERS       TRANSACTIONS
       │                │                │
       ▼                ▼                ▼
   INVENTORY       STORE CREDIT       REPORTING
                     LAYAWAY
```