Absolutely. We’ll proceed to the **API & Application Contract** stage.

# Dynamic POS — API & Application Contract

**Version:** 1.0
**Status:** Engineering Architecture Baseline
**Stack:** React/TypeScript + Express/TypeScript + Supabase PostgreSQL
**Architecture:** Modular monolith
**Offline:** Eliminated

---

# 1. API Architecture

The API should follow:

```text
React Frontend
      │
      ▼
Express API
      │
 ┌────┴──────────────────┐
 │                       │
Auth Middleware      Request Validation
 │                       │
 └──────────┬────────────┘
            ▼
      Authorization
            │
            ▼
       Service Layer
            │
     ┌──────┴──────┐
     ▼             ▼
PostgreSQL      Supabase
```

The frontend should **never directly implement business-critical database operations**.

For example, the frontend should not independently:

```text
UPDATE inventory
INSERT sale
INSERT payment
```

Instead:

```text
POST /api/v1/sales
```

and the backend performs the complete transactional operation.

---

# 2. API Base URL

All application endpoints should be versioned:

```text
/api/v1
```

Example:

```text
/api/v1/products
/api/v1/sales
/api/v1/customers
```

This allows a future:

```text
/api/v2
```

without immediately breaking existing clients.

---

# 3. Standard API Response Format

Successful responses should follow a predictable structure.

### Single resource

```json
{
  "success": true,
  "data": {}
}
```

### Collection

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 25,
    "total": 250
  }
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "The requested product does not exist."
  }
}
```

This makes frontend error handling consistent.

---

# 4. Authentication

Supabase Auth handles:

* Login
* Logout
* Password authentication
* Password reset
* Session management

The frontend obtains the authenticated session.

The API verifies the Supabase JWT.

```text
User
 ↓
Supabase Auth
 ↓
JWT
 ↓
Express
 ↓
JWT verification
 ↓
Profile
 ↓
Organization membership
 ↓
Permissions
```

---

# 5. Authentication Endpoints

Although Supabase performs the underlying authentication, the application can expose convenience endpoints.

### Get current user

```http
GET /api/v1/auth/me
```

Response:

```json
{
  "success": true,
  "data": {
    "user": {},
    "organizations": [],
    "roles": [],
    "permissions": []
  }
}
```

---

### Logout

```http
POST /api/v1/auth/logout
```

The frontend/Supabase client handles session termination.

---

# 6. Authorization Architecture

Every protected request passes through:

```text
authenticate()
      ↓
resolveOrganization()
      ↓
resolveBusinessContext()
      ↓
authorize(permission)
```

Example:

```text
POST /products
```

might require:

```text
products.create
```

while:

```text
DELETE /products/:id
```

could require:

```text
products.archive
```

---

# 7. Business Context

The application needs to know which Business Unit the user is operating within.

For example:

```text
Organization
   ↓
Abuja Branch
   ↓
Pharmacy
```

A user could switch to:

```text
Abuja Branch
   ↓
Supermarket
```

if their permissions allow it.

The selected context should be represented explicitly rather than inferred from random frontend state.

Example header:

```http
X-Business-Unit-ID: uuid
```

The backend must independently validate that the authenticated user actually has access to that Business Unit.

**Never trust the header alone.**

---

# 8. Organizations API

### Get organization

```http
GET /api/v1/organizations/:organizationId
```

### Update organization

```http
PATCH /api/v1/organizations/:organizationId
```

Permission:

```text
organization.update
```

### Get organization configuration

```http
GET /api/v1/organizations/:organizationId/configuration
```

---

# 9. Branch API

### List branches

```http
GET /api/v1/organizations/:organizationId/branches
```

### Create branch

```http
POST /api/v1/organizations/:organizationId/branches
```

### Get branch

```http
GET /api/v1/branches/:branchId
```

### Update branch

```http
PATCH /api/v1/branches/:branchId
```

### Archive branch

```http
DELETE /api/v1/branches/:branchId
```

This should perform an archive operation rather than physical deletion.

---

# 10. Business Unit API

### Create

```http
POST /api/v1/branches/:branchId/business-units
```

Request:

```json
{
  "name": "ABC Pharmacy",
  "code": "PHARMACY",
  "businessTypeId": "uuid"
}
```

### List

```http
GET /api/v1/branches/:branchId/business-units
```

### Update

```http
PATCH /api/v1/business-units/:businessUnitId
```

### Archive

```http
DELETE /api/v1/business-units/:businessUnitId
```

---

# 11. Capability API

Capabilities determine which features are available.

### Get capabilities

```http
GET /api/v1/business-units/:businessUnitId/capabilities
```

### Update capability

```http
PATCH /api/v1/business-units/:businessUnitId/capabilities/:capabilityId
```

Permission:

```text
configuration.manage
```

Example:

```json
{
  "enabled": true
}
```

---

# 12. Important Capability Rule

A capability should not merely hide a button.

If:

```text
inventory = false
```

then:

```text
Frontend:
hide inventory UI

Backend:
reject inventory endpoints
```

For example:

```http
POST /api/v1/inventory/adjustments
```

must return:

```text
FEATURE_DISABLED
```

if inventory isn't enabled for that Business Unit.

This prevents users from bypassing configuration through direct API calls.

---

# 13. User API

### List organization users

```http
GET /api/v1/organizations/:organizationId/users
```

### Create/invite user

```http
POST /api/v1/organizations/:organizationId/users
```

### Update user

```http
PATCH /api/v1/users/:userId
```

### Deactivate user

```http
POST /api/v1/users/:userId/deactivate
```

Do not delete employees who have historical transactions.

---

# 14. Roles API

### List roles

```http
GET /api/v1/organizations/:organizationId/roles
```

### Create custom role

```http
POST /api/v1/organizations/:organizationId/roles
```

Example:

```json
{
  "name": "Senior Cashier",
  "description": "Cashier with refund approval privileges",
  "permissions": [
    "sales.create",
    "sales.view",
    "refunds.create",
    "refunds.approve"
  ]
}
```

---

# 15. Permissions API

```http
GET /api/v1/permissions
```

The frontend can use this to populate the role-management interface.

However, permission names should ultimately come from a controlled backend definition rather than arbitrary frontend strings.

---

# 16. Product API

### List products

```http
GET /api/v1/business-units/:businessUnitId/products
```

Supported filters:

```text
search
category
active
lowStock
barcode
sku
```

Example:

```http
GET /products?search=coke&category=drinks
```

---

### Get product

```http
GET /api/v1/products/:productId
```

### Create

```http
POST /api/v1/business-units/:businessUnitId/products
```

### Update

```http
PATCH /api/v1/products/:productId
```

### Archive

```http
DELETE /api/v1/products/:productId
```

---

# 17. Barcode Lookup

Barcode scanning is one of the most important POS operations.

Dedicated endpoint:

```http
GET /api/v1/business-units/:businessUnitId/products/barcode/:barcode
```

Response should be optimized for speed.

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Coca Cola Zero",
    "sku": "CCZ001",
    "price": 1000,
    "availableQuantity": 25
  }
}
```

The POS should be able to execute this extremely quickly.

---

# 18. Product Categories

```http
GET /api/v1/business-units/:businessUnitId/categories
```

```http
POST /api/v1/business-units/:businessUnitId/categories
```

```http
PATCH /api/v1/categories/:categoryId
```

```http
DELETE /api/v1/categories/:categoryId
```

Categories are archived rather than destructively deleted.

---

# 19. Product Variants

```http
GET /api/v1/products/:productId/variants
```

```http
POST /api/v1/products/:productId/variants
```

```http
PATCH /api/v1/product-variants/:variantId
```

```http
DELETE /api/v1/product-variants/:variantId
```

---

# 20. Pricing API

Because pricing is branch-level:

```http
GET /api/v1/products/:productId/prices
```

```http
PUT /api/v1/products/:productId/prices/:branchId
```

Example:

```json
{
  "sellingPrice": 5200
}
```

---

# 21. Inventory API

### Get inventory

```http
GET /api/v1/business-units/:businessUnitId/inventory
```

Filters:

```text
product
category
lowStock
outOfStock
batch
expiry
```

---

# 22. Inventory Adjustment

```http
POST /api/v1/business-units/:businessUnitId/inventory/adjustments
```

Example:

```json
{
  "productId": "uuid",
  "quantity": 10,
  "type": "ADJUSTMENT_IN",
  "reason": "Physical stock count"
}
```

This must create:

```text
Inventory movement
+
Inventory balance update
+
Audit log
```

inside one database transaction.

---

# 23. Stock Transfer

Since you approved stock transfers but requested simplicity:

### Create transfer

```http
POST /api/v1/stock-transfers
```

### List transfers

```http
GET /api/v1/stock-transfers
```

### Get transfer

```http
GET /api/v1/stock-transfers/:transferId
```

### Complete transfer

```http
POST /api/v1/stock-transfers/:transferId/complete
```

A transfer should simply move inventory:

```text
Source
- quantity

Destination
+ quantity
```

No complicated procurement workflow.

---

# 24. Customer API

### Search customers

```http
GET /api/v1/organizations/:organizationId/customers
```

Filters:

```text
name
phone
email
customerCode
```

### Create customer

```http
POST /api/v1/organizations/:organizationId/customers
```

### Update

```http
PATCH /api/v1/customers/:customerId
```

---

# 25. POS Checkout API

This is the most important endpoint.

```http
POST /api/v1/sales
```

Request:

```json
{
  "businessUnitId": "uuid",
  "customerId": "uuid",
  "items": [
    {
      "productId": "uuid",
      "variantId": null,
      "quantity": 2
    }
  ],
  "discount": {
    "type": "PERCENTAGE",
    "value": 10
  },
  "payment": {
    "method": "CASH",
    "amount": 1800
  }
}
```

The server calculates:

```text
Product prices
+
Discount
+
Tax
+
Service charge
=
Final total
```

**The frontend must never be trusted to calculate the final payable amount.**

---

# 26. Sale Completion Transaction

Internally:

```text
BEGIN

Validate Business Unit
Validate permissions
Validate products
Validate product prices
Lock relevant inventory rows
Validate available quantities
Calculate prices
Calculate discount
Calculate tax
Calculate service charge
Create sale
Create sale items
Create payment
Update inventory
Create inventory movements
Create audit event

COMMIT
```

If anything fails:

```text
ROLLBACK
```

---

# 27. Concurrency Protection

You specifically requested concurrency checks.

Suppose:

```text
Stock = 1
```

Two cashiers attempt to sell it simultaneously.

Without protection:

```text
Cashier A → sees 1
Cashier B → sees 1

A → sells
B → sells

Inventory = -1
```

Not acceptable.

Instead:

```text
Transaction
   ↓
SELECT inventory
FOR UPDATE
   ↓
Check quantity
   ↓
Deduct
   ↓
COMMIT
```

Only one transaction gets the lock at a time.

This is essential.

---

# 28. Idempotency

Checkout also needs idempotency.

Suppose the cashier clicks:

```text
PAY
```

and the network is slow.

They click again.

Without idempotency:

```text
Sale A ✓
Sale B ✓
```

The customer gets charged twice.

The frontend should generate:

```text
Idempotency-Key
```

Example:

```http
Idempotency-Key: 6d2f...
```

The backend stores the key against the transaction.

Repeated requests with the same key return the original result rather than creating another sale.

---

# 29. Suspended Sales

```http
POST /api/v1/suspended-sales
```

```http
GET /api/v1/business-units/:businessUnitId/suspended-sales
```

```http
POST /api/v1/suspended-sales/:id/resume
```

```http
DELETE /api/v1/suspended-sales/:id
```

---

# 30. Returns

```http
POST /api/v1/returns
```

Request:

```json
{
  "saleId": "uuid",
  "items": [
    {
      "saleItemId": "uuid",
      "quantity": 1
    }
  ],
  "reason": "Customer return"
}
```

---

# 31. Refund Authorization

Refund creation should follow:

```text
Cashier
   ↓
Request refund
   ↓
Authorization required
   ↓
Authorized user
   ↓
Approve
   ↓
Refund transaction
```

Permission:

```text
refunds.approve
```

The person requesting and approving a refund should normally be recorded separately.

---

# 32. Store Credit

### Get balance

```http
GET /api/v1/customers/:customerId/store-credit
```

### Add credit

```http
POST /api/v1/customers/:customerId/store-credit
```

### Use credit

Internal sale transaction:

```text
payment_method = STORE_CREDIT
```

The store-credit balance must be validated and deducted atomically with the sale.

---

# 33. Layaway API

### Create

```http
POST /api/v1/layaways
```

### Get

```http
GET /api/v1/layaways/:layawayId
```

### Make installment payment

```http
POST /api/v1/layaways/:layawayId/payments
```

### Complete layaway

```http
POST /api/v1/layaways/:layawayId/complete
```

The server should calculate:

```text
total
-
all payments
=
outstanding balance
```

Never trust the client to submit the outstanding balance.

---

# 34. Reports API

```http
GET /api/v1/reports/sales
```

Possible filters:

```text
startDate
endDate
branch
businessUnit
cashier
product
category
paymentMethod
```

Other reports:

```http
GET /api/v1/reports/inventory
GET /api/v1/reports/products
GET /api/v1/reports/customers
GET /api/v1/reports/payments
GET /api/v1/reports/refunds
GET /api/v1/reports/store-credit
GET /api/v1/reports/layaways
```

---

# 35. Custom Reports

Businesses can create custom reports.

However, **do not allow users to submit arbitrary SQL.**

Instead create a report builder based on controlled dimensions and metrics.

For example:

```text
Dimensions:
- Date
- Product
- Category
- Branch
- Business Unit
- Employee
- Payment Method

Metrics:
- Sales
- Quantity
- Revenue
- Discounts
- Tax
- Refunds
```

The backend converts the configuration into a safe query.

---

# 36. Subscription API

### Get subscription

```http
GET /api/v1/subscription
```

### Get available plans/pricing

```http
GET /api/v1/subscription/pricing
```

### Initiate renewal

```http
POST /api/v1/subscription/renew
```

### Verify payment

```http
POST /api/v1/subscription/verify
```

---

# 37. Subscription Enforcement

Every organization request should pass through subscription validation.

Conceptually:

```text
Authenticated
     ↓
Super Admin?
 ┌───┴────┐
YES       NO
 │         │
Allow      Subscription valid?
             │
        ┌────┴────┐
       YES        NO
        │          │
      Allow       LOCK
```

You specifically chose complete application lockout.

Therefore when expired:

```text
Login → rejected
Existing session → revoked
Application → locked
```

Super Admin remains unrestricted.

---

# 38. Subscription Grace Period

I recommend **no grace period** unless you explicitly decide otherwise.

At:

```text
expires_at
```

the organization becomes:

```text
SUBSCRIPTION_EXPIRED
```

and access is blocked.

The UI can still show the renewal mechanism where technically appropriate, but users cannot access normal application functionality.

---

# 39. Subscription Notifications

Starting:

```text
7 days before expiration
```

send:

```text
Day -7 → Email
Day -6 → Email
Day -5 → Email
Day -4 → Email
Day -3 → Email
Day -2 → Email
Day -1 → Email
```

You previously specified every two days, so there is one point we should resolve before implementation:

> **Does "every 2 days starting from 7 days" mean notifications on Day -7, -5, -3, -1, or literally every day from Day -7?**

The API architecture can support either.

---

# 40. Notifications API

```http
GET /api/v1/notifications
```

```http
POST /api/v1/notifications/:id/read
```

```http
POST /api/v1/notifications/read-all
```

Email delivery happens through Resend.

---

# 41. Audit API

Audit logs should generally be **read-only** to users.

```http
GET /api/v1/audit-logs
```

Permissions:

```text
audit.view
```

Super Admin has unrestricted access.

---

# 42. Receipt API

```http
GET /api/v1/sales/:saleId/receipt
```

Possible formats:

```text
HTML
PDF
PRINT
```

The frontend can use the HTML version for digital receipt display and browser printing.

---

# 43. Receipt Templates

```http
GET /api/v1/receipt-templates
```

```http
POST /api/v1/receipt-templates
```

```http
PATCH /api/v1/receipt-templates/:id
```

Only authorized administrators should manage templates.

---

# 44. Dashboard API

Instead of making the frontend request dozens of endpoints when loading the dashboard, provide aggregated endpoints.

```http
GET /api/v1/dashboard/overview
```

Possible response:

```json
{
  "salesToday": 1250000,
  "transactionsToday": 183,
  "topProducts": [],
  "lowStockProducts": [],
  "recentSales": [],
  "salesTrend": []
}
```

This dramatically reduces frontend requests.

---

# 45. POS Initialization Endpoint

For POS performance, provide:

```http
GET /api/v1/pos/context
```

This can return the data required to initialize the POS:

```json
{
  "businessUnit": {},
  "configuration": {},
  "paymentMethods": [],
  "tax": {},
  "serviceCharge": {},
  "permissions": [],
  "categories": []
}
```

Products can then be searched/paginated independently.

---

# 46. Search Architecture

The POS should avoid loading thousands of products unnecessarily.

Instead:

```text
Barcode
→ direct lookup

Exact SKU
→ indexed lookup

Search
→ server-side search

Category
→ filtered query
```

For a small inventory, caching can make this even faster.

---

# 47. Pagination

Every potentially large collection should support:

```text
page
limit
sort
order
```

or preferably cursor pagination for very large datasets.

Examples:

```text
products
sales
customers
audit_logs
inventory_movements
notifications
```

---

# 48. Validation

Every request entering Express should be validated.

A suitable TypeScript validation library would be:

```text
Zod
```

Example:

```text
POST /sales
     ↓
Zod schema
     ↓
Service
```

This prevents malformed requests reaching the database.

---

# 49. Error Taxonomy

The API should use consistent error codes.

Examples:

```text
AUTH_REQUIRED
AUTH_INVALID
PERMISSION_DENIED

ORGANIZATION_NOT_FOUND
BRANCH_NOT_FOUND
BUSINESS_UNIT_NOT_FOUND

FEATURE_DISABLED

PRODUCT_NOT_FOUND
PRODUCT_INACTIVE
INSUFFICIENT_STOCK

SALE_NOT_FOUND
SALE_ALREADY_COMPLETED

REFUND_NOT_AUTHORIZED

STORE_CREDIT_INSUFFICIENT

LAYAWAY_NOT_FOUND
LAYAWAY_ALREADY_COMPLETED

SUBSCRIPTION_EXPIRED

CONCURRENT_MODIFICATION
IDEMPOTENCY_CONFLICT

VALIDATION_ERROR
INTERNAL_SERVER_ERROR
```

---

# 50. HTTP Status Codes

Use standard semantics.

```text
200 OK
201 Created
204 No Content

400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests
500 Internal Server Error
```

Concurrency conflicts should generally return:

```text
409 Conflict
```

---

# 51. Rate Limiting

Even though the system is intended for low-cost hosting, basic rate limiting should be implemented.

Especially for:

```text
Authentication
Password reset
User invitations
API-heavy searches
Subscription endpoints
```

This protects against abuse without requiring a paid service.

---

# 52. Caching

Do not introduce Redis merely because POS systems commonly use Redis.

The architecture should first work without it.

Potential initial caching:

```text
Browser cache
HTTP caching
PostgreSQL indexes
In-memory cache where appropriate
```

If actual performance measurements show the need for Redis later, it can be introduced.

This aligns with your **$0–$10 infrastructure target**.

---

# 53. Background Jobs

Some operations should not block the POS.

Examples:

```text
Send subscription email
Send notification email
Generate large report
Generate PDF
Cleanup expired suspended sales
```

These can initially use a lightweight database-backed job system or scheduled Supabase mechanisms where appropriate.

We should **not introduce BullMQ + Redis automatically** unless the workload justifies it.

---

# 54. API Security Rules

The API must enforce:

### Never trust:

```text
user ID
organization ID
business unit ID
price
tax
discount amount
inventory quantity
payment amount
permissions
```

sent by the frontend.

The server must resolve/validate them.

---

# 55. Particularly Important: Price Security

The frontend might send:

```json
{
  "productId": "123",
  "unitPrice": 1
}
```

The backend must ignore that price.

Instead:

```text
product
 ↓
branch
 ↓
current configured price
 ↓
server calculation
```

This prevents:

```text
₦10,000 product
```

being purchased for:

```text
₦1
```

through a manipulated request.

---

# 56. Discount Security

Similarly:

```text
Frontend:
discount = 99%
```

doesn't mean it is valid.

Backend checks:

```text
Does user have discount permission?
Is discount within allowed limit?
Does the business allow discounts?
```

Then calculates the actual discount.

---

# 57. Refund Security

Backend validates:

```text
User permission
+
Original sale
+
Remaining refundable quantity
+
Refund amount
+
Authorization
```

before executing the refund.

---

# 58. API Module Structure

The Express application should be organized approximately as:

```text
src/
├── modules/
│   ├── auth/
│   ├── organizations/
│   ├── branches/
│   ├── business-units/
│   ├── capabilities/
│   ├── users/
│   ├── roles/
│   ├── products/
│   ├── inventory/
│   ├── customers/
│   ├── sales/
│   ├── payments/
│   ├── returns/
│   ├── refunds/
│   ├── store-credit/
│   ├── layaway/
│   ├── reports/
│   ├── notifications/
│   ├── subscriptions/
│   └── audit/
│
├── middleware/
├── database/
├── config/
├── shared/
└── app.ts
```

Each module contains its own:

```text
routes
controller
service
repository
schema
types
```

where appropriate.

---

# 59. Critical Separation

A controller should **not** contain business logic.

Bad:

```text
route
 ↓
100 lines of database operations
```

Preferred:

```text
Route
 ↓
Controller
 ↓
Service
 ↓
Repository / Database Function
```

For example:

```text
POST /sales
   ↓
SalesController
   ↓
SalesService
   ↓
completeSale()
   ↓
PostgreSQL transaction
```

---

# 60. Frontend Architecture

The React frontend should similarly be modular:

```text
src/
├── app/
├── modules/
│   ├── auth/
│   ├── dashboard/
│   ├── pos/
│   ├── products/
│   ├── inventory/
│   ├── customers/
│   ├── sales/
│   ├── reports/
│   ├── users/
│   ├── settings/
│   └── subscription/
│
├── components/
├── hooks/
├── lib/
├── services/
└── types/
```

---

# 61. POS Frontend Architecture

The POS deserves special treatment.

It should behave more like a specialized application than a conventional SaaS dashboard.

```text
POS
├── Search
├── Barcode Input
├── Categories
├── Cart
├── Customer
├── Discount
├── Payment
└── Receipt
```

Keyboard-first interactions should be supported.

For example:

```text
F2 → Search
F4 → Customer
F8 → Hold
F9 → Payment
ESC → Clear/close modal
ENTER → Confirm
```

Exact shortcuts can be finalized during UX design.

---

# 62. State Management

Do not put the entire POS state into one global store.

Separate:

```text
Server State
```

from:

```text
UI State
```

and:

```text
POS Transaction State
```

For example:

```text
TanStack Query
→ server state

Zustand
→ local POS/cart state
```

This is a good fit for the application.

---

# 63. POS Transaction State

The cart should exist locally until checkout.

```text
Cart
├── items
├── customer
├── discount
├── tax
├── service charge
└── payment method
```

But:

> **The final transaction is calculated and committed by the server.**

The frontend can show a preview total, but the backend remains authoritative.

---

# 64. No Offline Architecture

This is now explicitly removed.

The application will require connectivity for:

* Product lookup
* Checkout
* Inventory
* Customers
* Reports
* Authentication
* Synchronization

There will be **no offline queue**, local transaction database, or conflict-resolution engine.

This significantly simplifies:

* Concurrency
* Inventory integrity
* Financial consistency
* Authentication
* Deployment
* Maintenance
* Testing

It is a major architectural simplification.

---

# 65. API Contract Status

At this point we have defined the core API boundaries for:

```text
✓ Authentication
✓ Organizations
✓ Branches
✓ Business Units
✓ Capabilities
✓ Users
✓ RBAC
✓ Products
✓ Categories
✓ Variants
✓ Pricing
✓ Inventory
✓ Stock Transfers
✓ Customers
✓ Sales
✓ Payments
✓ Discounts
✓ Returns
✓ Refunds
✓ Store Credit
✓ Layaway
✓ Reports
✓ Notifications
✓ Audit
✓ Subscriptions
✓ Receipts
```

The next engineering stage should therefore **not** be more endpoint brainstorming.

It should be the **actual system workflows and state machines**.

That stage will define, in precise sequence, what happens when someone:

1. Onboards a new business
2. Creates a branch
3. Creates a business unit
4. Configures its business type
5. Creates employees and roles
6. Creates a product
7. Adjusts inventory
8. Transfers stock
9. Makes a sale
10. Suspends/resumes a sale
11. Performs a return/refund
12. Uses store credit
13. Creates a layaway
14. Pays an installment
15. Generates reports
16. Renews the subscription
17. Reaches subscription expiry