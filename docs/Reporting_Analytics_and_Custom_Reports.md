# Stage 12 — Reporting, Analytics & Custom Reports

This stage defines the reporting layer of the Dynamic POS.

The key architectural principle is:

> **Reports should consume structured transactional data; they should never modify operational data.**

Because the POS is intended for many business types, reporting must be **generic at its core** while automatically adapting to the business types, branches, business units, products, transactions and features actually enabled.

---

# 1. Reporting Architecture

The reporting system should sit above the operational system:

```text
                    POS OPERATIONS
                         │
        ┌────────────────┼────────────────┐
        ↓                ↓                ↓
      Sales          Inventory        Customers
        ↓                ↓                ↓
        └────────────────┼────────────────┘
                         ↓
                 REPORTING LAYER
                         │
          ┌──────────────┼──────────────┐
          ↓              ↓              ↓
      Dashboards      Standard       Custom
                       Reports        Reports
```

The reporting layer should **read** from the database.

It should not directly manipulate:

* sales
* inventory
* customers
* payments
* users
* products

---

# 2. Reporting Hierarchy

Reports should respect the business hierarchy we established:

```text
Super Admin
    │
    └── Business
          │
          ├── Branch A
          │      ├── Business Unit 1
          │      └── Business Unit 2
          │
          ├── Branch B
          │      └── Business Unit 3
          │
          └── Branch C
```

This means an Owner can potentially see:

> Entire business

while a Branch Manager may see:

> Only Branch A

and a user assigned to a particular business unit may see:

> Only that business unit.

---

# 3. Report Scope

Every report should have a scope.

Possible scopes:

```text
Entire Business
Branch
Business Unit
```

For example:

### Owner

```text
Sales
All Branches
All Business Units
```

### Branch Manager

```text
Sales
Branch A
```

### Business-unit manager

```text
Sales
Pharmacy Unit
```

This should be enforced through authorization rather than merely hiding UI controls.

---

# 4. Dashboard vs Reports

These are different concepts.

### Dashboard

Optimized for:

> "What's happening right now?"

### Reports

Optimized for:

> "Let me investigate what happened."

For example:

Dashboard:

```text
Today's Sales
₦2.4M
```

Report:

```text
Sales Report
Aug 1 – Aug 21

Branch
Product
Cashier
Payment Method
Quantity
Discount
Tax
Total
...
```

---

# 5. Main Dashboard

The Owner dashboard should provide a high-level overview.

Recommended cards:

```text
Today's Sales
₦2,450,000

Transactions
342

Refunds
₦75,000

Net Sales
₦2,375,000

Outstanding Layaway
₦850,000

Store Credit Outstanding
₦120,000
```

Where cost data exists:

```text
Gross Profit
₦920,000
```

---

# 6. Dashboard Time Range

The dashboard should allow:

```text
Today
Yesterday
This Week
This Month
Last Month
This Quarter
This Year
Custom
```

The selected period should update the dashboard consistently.

---

# 7. Sales Analytics

The sales dashboard should provide:

* Gross sales
* Discounts
* Refunds
* Net sales
* Number of transactions
* Average transaction value
* Items sold
* Tax collected
* Service charges

---

# 8. Sales Trend

A simple chart:

```text
Sales
 ^
 |                    ●
 |             ●      |
 |       ●     |  ●   |
 |  ●    |  ●  |  |   |
 └────────────────────────>
    Mon Tue Wed Thu Fri
```

The user should be able to switch between:

* Revenue
* Transactions
* Units sold
* Gross profit

---

# 9. Top Products

The system should identify:

```text
Top Selling Products
```

Example:

```text
1. Coca-Cola 50cl       1,250 units
2. Bread                 980 units
3. Water                 870 units
4. Milk                  650 units
```

Filters:

* Date
* Branch
* Business unit
* Category

---

# 10. Product Performance

A product report should provide:

```text
Product
Units Sold
Gross Sales
Discounts
Refunds
Net Sales
Cost
Gross Profit
Stock Remaining
```

This gives the Owner an understanding of both sales and inventory performance.

---

# 11. Slow-Moving Products

The reporting engine should also support:

> Products with little or no sales during a selected period.

Example:

```text
Product          Units Sold
Product A            0
Product B            2
Product C            3
```

This can help businesses identify inventory that is sitting idle.

---

# 12. Inventory Reports

Inventory reporting should include:

### Current Stock

```text
Product
Branch
Business Unit
Quantity
Reserved Quantity
Available Quantity
```

### Low Stock

```text
Product
Current Stock
Low-stock Threshold
```

### Inventory Movement

```text
Date
Product
Movement Type
Quantity
Reference
User
```

Movement types can include:

```text
Sale
Refund
Manual Adjustment
Stock Transfer
```

---

# 13. Stock Transfer Reports

Since you ultimately selected **simple stock transfers**, they should appear in reporting.

Example:

```text
Branch A
 ↓
10 units
 ↓
Branch B
```

Report:

```text
Transfer #TR-1022

From:
Branch A

To:
Branch B

Product:
Product X

Quantity:
10

Initiated by:
Manager

Date:
...
```

---

# 14. Low-Stock Analytics

Businesses should be able to see:

```text
Critical
Low
Normal
```

based on product-specific inventory thresholds.

Example:

```text
Product A     2 remaining     CRITICAL
Product B     8 remaining     LOW
Product C     80 remaining    NORMAL
```

---

# 15. Sales by Category

Example:

```text
Food          ₦2.1M
Beverages     ₦1.4M
Electronics   ₦800K
Accessories   ₦300K
```

This should work regardless of business type.

For a pharmacy:

```text
Prescription Drugs
OTC Drugs
Personal Care
Supplements
```

For fashion:

```text
Shirts
Trousers
Shoes
Accessories
```

The reporting engine doesn't need to know what these categories mean.

---

# 16. Payment Analytics

Payment reports should show:

```text
Cash
Card
Transfer
Store Credit
```

Example:

```text
Cash             ₦1,200,000
Card             ₦850,000
Transfer         ₦400,000
Store Credit     ₦100,000
```

This should be filterable by:

* branch
* business unit
* date
* cashier

---

# 17. Refund Analytics

Refund reporting:

```text
Total Refunds
Number of Refunds
Refund Amount
Refund Rate
Refund Reasons
```

Example:

```text
Customer return       52%
Incorrect item        20%
Pricing error         15%
Other                 13%
```

---

# 18. Discount Analytics

The system should report:

```text
Total Discounts
Discounted Transactions
Average Discount
Discount by User
Discount by Branch
Discount by Product
```

This is especially useful for detecting excessive discount usage.

---

# 19. Employee Performance

The reporting engine should support employee-level reporting where appropriate.

Example:

```text
Cashier
Transactions
Sales
Refunds
Discounts
Average Transaction
```

However, employee performance data must respect permissions because it can be sensitive within a business.

---

# 20. Cashier Analytics

Example:

```text
John

Transactions:
82

Sales:
₦720,000

Refunds:
₦15,000

Discounts:
₦8,500

Average Sale:
₦8,780
```

This does **not** mean the system needs the cash-register/shift functionality you rejected.

It is simply transaction analytics.

---

# 21. Customer Analytics

Customer reports should include:

```text
Total Customers
New Customers
Returning Customers
Customers With Store Credit
Customers With Layaway
```

Since you rejected loyalty and membership systems, we should not build reports around those.

---

# 22. Customer Purchase History

Authorized users can view:

```text
Customer
 ↓
Purchase History
 ↓
Transactions
 ↓
Items
 ↓
Payments
 ↓
Refunds
```

This can be extremely useful when handling returns.

---

# 23. Layaway Reports

Because layaway is supported, reporting must include:

```text
Total Layaway Sales
Active Layaways
Completed Layaways
Outstanding Balance
Payments Received
Overdue/Outstanding Accounts
```

Example:

```text
Active Layaways:
23

Total Outstanding:
₦2,500,000
```

---

# 24. Store Credit Reports

Similarly:

```text
Store Credit Issued
Store Credit Used
Outstanding Store Credit
Credit by Customer
```

Example:

```text
Issued:
₦500,000

Used:
₦350,000

Outstanding:
₦150,000
```

---

# 25. Tax Reports

The system should provide:

```text
Taxable Sales
Tax Collected
Tax by Period
Tax by Branch
Tax by Business Unit
```

Historical transactions must use their **original tax snapshot**, not the current tax configuration.

---

# 26. Service Charge Reports

Similarly:

```text
Service Charge Collected
Service Charge by Branch
Service Charge by Business Unit
Service Charge by Period
```

This becomes especially useful for businesses such as:

* restaurants
* hotels
* salons

while remaining available to every business.

---

# 27. Gross Profit Reports

Where cost information exists:

```text
Net Sales
-
COGS
=
Gross Profit
```

The system should also calculate:

```text
Gross Margin %
```

Example:

```text
Net Sales:
₦5,000,000

COGS:
₦3,000,000

Gross Profit:
₦2,000,000

Gross Margin:
40%
```

---

# 28. Business Unit Comparison

This is one of the more important features created by your architecture.

Suppose:

```text
Branch A

Supermarket
Pharmacy
```

The Owner can see:

```text
Supermarket:
₦5.2M

Pharmacy:
₦1.4M
```

and compare their performance.

---

# 29. Branch Comparison

Likewise:

```text
Branch A     ₦5.2M
Branch B     ₦3.8M
Branch C     ₦2.1M
```

The system should support ranking branches by:

* sales
* transactions
* profit
* units sold
* refunds

---

# 30. Business-Type-Aware Reporting

This is where the **dynamic POS architecture** becomes important.

The reporting engine should not hardcode:

```text
if businessType === "restaurant"
```

everywhere.

Instead, business types determine which features/data exist.

For example:

```text
Business Type
     ↓
Enabled Capabilities
     ↓
Available Data
     ↓
Reports
```

A restaurant might have:

```text
Service Charges
Tips
```

while a supermarket might not.

The report builder should therefore expose only relevant fields.

---

# 31. Standard Reports

We should provide predefined reports.

Recommended initial list:

### Sales

* Sales Summary
* Sales Detail
* Sales by Product
* Sales by Category
* Sales by Branch
* Sales by Business Unit
* Sales by Employee

### Financial

* Payment Summary
* Refund Report
* Discount Report
* Tax Report
* Service Charge Report
* Gross Profit Report

### Inventory

* Inventory Summary
* Low Stock Report
* Inventory Movement
* Stock Transfer Report

### Customers

* Customer Summary
* Customer Purchase History
* Store Credit Report
* Layaway Report

---

# 32. Custom Report Builder

You explicitly selected:

> Businesses should be able to create custom reports.

This should be one of the more powerful parts of the system.

The user shouldn't have to write SQL.

Instead:

```text
Create Report
     ↓
Select Data
     ↓
Select Fields
     ↓
Apply Filters
     ↓
Group
     ↓
Sort
     ↓
Preview
     ↓
Save
```

---

# 33. Step 1 — Select Dataset

The user selects something like:

```text
Sales
Products
Inventory
Customers
Payments
Refunds
Employees
Layaways
Store Credit
```

---

# 34. Step 2 — Select Fields

For Sales:

```text
✓ Transaction ID
✓ Date
✓ Product
✓ Category
✓ Quantity
✓ Unit Price
✓ Discount
✓ Tax
✓ Service Charge
✓ Total
✓ Payment Method
✓ Branch
✓ Business Unit
✓ Cashier
```

---

# 35. Step 3 — Filters

Example:

```text
Date:
Aug 1 – Aug 21

Branch:
Branch A

Payment:
Cash

Total:
> ₦50,000
```

---

# 36. Step 4 — Grouping

Users can group by:

```text
Date
Product
Category
Branch
Business Unit
Employee
Payment Method
```

Example:

```text
Group by:
Branch

Then by:
Category
```

---

# 37. Step 5 — Aggregation

For numeric fields:

```text
SUM
COUNT
AVERAGE
MIN
MAX
```

Example:

```text
Sales Amount → SUM
Transactions → COUNT
Average Sale → AVERAGE
```

---

# 38. Step 6 — Sorting

Example:

```text
Sales:
Highest → Lowest
```

or:

```text
Date:
Newest → Oldest
```

---

# 39. Step 7 — Preview

Before saving:

```text
┌─────────────────────────────────────┐
│ Custom Sales Report                 │
├─────────────────────────────────────┤
│ Branch A                            │
│                                     │
│ Product       Qty       Sales       │
│ Coke          120       ₦120,000    │
│ Water         100       ₦80,000     │
└─────────────────────────────────────┘
```

---

# 40. Saved Reports

Users should be able to save custom reports.

Example:

```text
My Reports

Monthly Branch Performance
Top Products
Cash Sales
High-Value Transactions
Outstanding Layaways
```

---

# 41. Report Permissions

Custom reports must respect RBAC.

For example:

A Cashier may be able to create:

```text
Sales reports
```

but not:

```text
Profit reports
Employee reports
```

The report builder must never allow a user to bypass database authorization simply because they selected a field in the UI.

---

# 42. Report Ownership

Saved reports should belong to a scope.

For example:

```text
Personal
Branch
Business
```

A user can create:

> My Sales Report

while an Owner can create:

> Business Monthly Performance

and make it available to authorized employees.

---

# 43. Export

You selected all relevant formats previously.

The reporting system should support:

* CSV
* Excel/XLSX
* PDF
* JSON

Potentially:

* Print

The underlying report result should be generated first, then transformed into the requested format.

---

# 44. Large Reports

We should **not** generate massive reports directly inside the browser.

Bad:

```text
Database
 ↓
10 million rows
 ↓
Browser
 ↓
Generate Excel
```

Instead:

```text
Database
 ↓
Server-side query
 ↓
Aggregated/streamed result
 ↓
Export generator
 ↓
File
```

This is especially important for Supabase resource limits.

---

# 45. Report Query Security

Custom reports are potentially dangerous because they effectively allow users to construct database queries.

We should **never allow users to submit raw SQL**.

The report builder should generate queries from an approved internal schema.

For example:

```text
Dataset:
Sales

Fields:
Product
Quantity
Total

Filters:
Date > X
```

The backend translates that into a safe parameterized query.

---

# 46. Query Complexity Limits

To protect the free Supabase tier, custom reporting should impose reasonable limits.

For example:

```text
Maximum date range
Maximum rows
Maximum grouped dimensions
Maximum execution time
```

If a report is too expensive:

> "This report is too large to generate directly. Narrow your filters and try again."

This prevents one user from accidentally destroying database performance.

---

# 47. Reporting Indexes

The database schema should be designed around common reporting queries.

Indexes will likely be needed around:

```text
business_id
branch_id
business_unit_id
created_at
transaction_status
payment_method
product_id
category_id
user_id
```

Composite indexes should be added based on actual query patterns rather than blindly indexing everything.

---

# 48. Pre-Aggregation

For an initial deployment, we should avoid building an elaborate data warehouse.

Instead:

### Phase 1

Use PostgreSQL queries and optimized indexes.

### Later

If reporting volume becomes large:

```text
Operational DB
       ↓
Aggregated tables/materialized views
       ↓
Reporting
```

This keeps the MVP much cheaper and simpler.

---

# 49. Materialized Views

For expensive recurring analytics, PostgreSQL materialized views can eventually be used.

For example:

```text
daily_sales_summary
```

containing:

```text
date
branch
business_unit
gross_sales
discounts
refunds
net_sales
transactions
```

Then the dashboard doesn't need to recalculate millions of transactions every time.

---

# 50. Dashboard Performance

The dashboard should not execute 20 independent queries every time it loads.

Instead, we should aggregate dashboard metrics where practical.

Conceptually:

```text
Dashboard Request
       ↓
Reporting Service
       ↓
Optimized queries
       ↓
Single response
```

This reduces latency and database load.

---

# 51. Caching

We can use lightweight caching where useful.

However, because you're targeting a near-zero infrastructure budget, we shouldn't make Redis mandatory for reporting.

The first implementation can use:

* PostgreSQL
* browser caching where appropriate
* short-lived server-side caching where supported

Only introduce Redis if actual scale demonstrates a need.

---

# 52. Real-Time Dashboard

Not every dashboard metric needs real-time database subscriptions.

The POS itself needs immediate transaction confirmation.

Analytics can tolerate small delays.

For example:

```text
Transaction:
Immediate

Dashboard:
Refresh every few seconds/minutes
```

This distinction saves resources.

---

# 53. Report Refresh

Reports should have:

```text
Refresh
```

rather than constantly querying the database.

The UI can display:

> Last updated: 12:34 PM

---

# 54. AI-Ready Reporting Architecture

You selected:

> AI considered from the architecture stage.

The reporting layer should therefore eventually expose a structured analytics interface.

For example, later an AI assistant could receive:

```text
Sales:
₦12.4M

Growth:
+18%

Top category:
Beverages

Worst-performing category:
Accessories
```

and explain it.

But the AI should **not** directly query arbitrary database tables.

Instead:

```text
AI
 ↓
Analytics API
 ↓
Approved reporting functions
 ↓
Database
```

---

# 55. AI Must Not Become a Dependency

The POS must work completely without AI.

Therefore:

```text
POS
 ├── Core Operations
 ├── Reporting
 └── AI (Optional Layer)
```

If the AI service is unavailable:

```text
POS:
✓ Works

Reports:
✓ Work

AI insights:
✗ Temporarily unavailable
```

This is essential for reliability and cost control.

---

# 56. Report Scheduling

I recommend **not implementing scheduled reports in the first MVP**.

It adds:

* background jobs
* email generation
* scheduling infrastructure
* additional complexity

It can be a Phase 2 feature.

The architecture should leave room for:

```text
Saved Report
      ↓
Schedule
      ↓
Generate
      ↓
Email
```

but we don't need to build it immediately.

---

# 57. Report Notifications

Similarly, alerts such as:

> Sales dropped 30%

can be a future analytics feature.

Initial notifications remain focused on the notifications we already defined.

---

# 58. Observability

You selected:

* Performance monitoring
* Database monitoring
* Uptime monitoring
* API monitoring

but no paid external error tracking/logging service.

Therefore the reporting system should include basic instrumentation using native/free mechanisms.

Track:

```text
Report name
Execution time
Rows returned
Success/failure
User
Timestamp
```

This helps identify expensive reports.

---

# 59. Report Audit Trail

The system should log:

```text
User created report
User modified report
User deleted report
User executed sensitive report
User exported report
```

Especially exports containing financial/customer data.

---

# 60. Data Privacy

Reports may expose sensitive information.

Therefore:

```text
Customer phone numbers
Customer addresses
Financial information
Employee information
```

should only appear where the user's permissions allow them.

The report builder should inherit the same authorization rules as the rest of the system.

---

# 61. Super Admin Reporting

Your Super Admin is different.

You previously established:

> **Super Admin has untethered access.**

Therefore the Super Admin can inspect the complete deployment/system data available to the Super Admin role.

This is separate from the Owner's business-level reporting permissions.

---

# 62. What the Super Admin Should NOT Do Automatically

Even though Super Admin has unrestricted access, the system should still maintain an audit record of Super Admin actions.

"Untethered access" should mean:

> Access is unrestricted.

It should **not** mean:

> Actions become invisible.

For example:

```text
Super Admin viewed financial report
```

should still be auditable.

---

# 63. Reporting MVP

For the first production-ready version, I recommend implementing:

### Dashboard

* Sales overview
* Transaction count
* Refunds
* Discounts
* Payment breakdown
* Inventory alerts
* Top products
* Branch comparison
* Business-unit comparison

### Standard reports

* Sales
* Products
* Inventory
* Payments
* Refunds
* Discounts
* Tax
* Service charges
* Customers
* Layaway
* Store credit
* Gross profit

### Custom reports

* Dataset selection
* Field selection
* Filters
* Grouping
* Sorting
* Aggregation
* Preview
* Save
* Export

---

# 64. Deliberately Deferred

To maintain your **free/≤$10/month target**, defer:

* Data warehouse
* Advanced BI engine
* Scheduled report generation
* AI analytics
* Predictive analytics
* Complex anomaly detection
* External analytics platforms
* Power BI integration
* Tableau integration
* Automated accounting integrations

These can be added when the product has revenue to justify them.

---

# 65. Stage 12 — Locked Architecture

| Area                           | Decision |
| ------------------------------ | -------- |
| Dashboard                      | Yes      |
| Standard reports               | Yes      |
| Custom reports                 | Yes      |
| Sales analytics                | Yes      |
| Inventory analytics            | Yes      |
| Financial analytics            | Yes      |
| Customer analytics             | Yes      |
| Employee analytics             | Yes      |
| Branch analytics               | Yes      |
| Business-unit analytics        | Yes      |
| Tax reports                    | Yes      |
| Service-charge reports         | Yes      |
| Refund reports                 | Yes      |
| Discount reports               | Yes      |
| Layaway reports                | Yes      |
| Store-credit reports           | Yes      |
| Gross-profit reports           | Yes      |
| Custom report builder          | Yes      |
| Saved reports                  | Yes      |
| CSV                            | Yes      |
| XLSX                           | Yes      |
| PDF                            | Yes      |
| JSON                           | Yes      |
| Raw SQL reports                | **No**   |
| AI dependency                  | **No**   |
| Data warehouse                 | Deferred |
| Scheduled reports              | Deferred |
| External BI                    | Deferred |
| Heavy reporting infrastructure | Deferred |

---