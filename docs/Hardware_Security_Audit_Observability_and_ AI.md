# Stage 31 — Hardware, Security, Audit, Observability & AI

This stage defines the **technical/runtime layer** of the Dynamic POS. We are not revisiting the POS Transaction Engine, Customer Management, Inventory, or Administration systems already completed.

The key objective is to make the system **fast, secure, auditable, inexpensive to operate, and ready for future expansion**.

---

# 31.1 Hardware Support

The initial platform is:

> **Responsive Web Application**

It must work across:

* Desktop computers
* Laptops
* Tablets
* Phones

The POS interface should be optimized primarily for desktop/tablet use while remaining responsive on smaller screens.

---

# 31.2 Barcode Scanner Support

The initial barcode implementation should prioritize standard USB/Bluetooth scanners that behave as keyboard input devices.

Typical workflow:

```text
Scanner
   ↓
Barcode Input
   ↓
POS Search
   ↓
Product Match
   ↓
Add to Cart
```

This avoids requiring proprietary scanner SDKs.

The POS should support rapid consecutive scans without requiring the cashier to manually focus the search field after every scan.

---

# 31.3 Camera-Based Barcode Scanning

Camera scanning should be architecturally possible but does not need to be the primary scanning method for the first release.

It can later support:

* Phone cameras
* Tablet cameras
* Laptop webcams

This should be treated as an enhancement rather than a dependency.

---

# 31.4 Receipt Printer Support

The system should support common receipt-printer workflows.

The initial architecture should avoid requiring an expensive proprietary printing service.

The browser/application can provide:

```text
Print Receipt
      ↓
System Print Dialog
      ↓
Compatible Receipt Printer
```

Where direct thermal-printer integration is later required, it should be implemented behind a hardware abstraction layer.

---

# 31.5 Customer Display

Customer displays should be supported where the hardware setup permits it.

The display can show:

```text
Business Logo

Product             Price
-------------------------
Item A              ₦5,000
Item B              ₦3,000

Subtotal            ₦8,000
Tax                   ₦400
Total               ₦8,400
```

The customer display should not need access to sensitive administrative information.

---

# 31.6 Hardware Abstraction

Hardware functionality should not be embedded directly into the transaction engine.

Instead:

```text
POS
 │
 ├── Barcode Adapter
 ├── Printer Adapter
 └── Customer Display Adapter
```

This allows different hardware implementations without rewriting the POS.

---

# 31.7 POS Performance

You previously selected **all POS speed/UX requirements**.

Therefore the POS must prioritize:

* Minimal clicks
* Keyboard navigation
* Fast product search
* Barcode-first workflows
* Instant cart updates
* Persistent cart state
* Fast checkout
* Clear feedback
* Minimal animations
* No unnecessary page reloads

The POS should feel substantially faster than the administration dashboard.

---

# 31.8 POS Interface Philosophy

The system has two distinct UI philosophies.

### Administration

```text
Modern SaaS Dashboard
```

### POS

```text
Extremely Fast Retail Interface
```

They should share the same underlying design system but should **not be forced into the same interaction model**.

---

# 31.9 Keyboard-First POS

Desktop POS users should be able to perform common actions without constantly reaching for a mouse.

Potential shortcuts:

```text
Search
Scan
Add quantity
Remove item
Hold sale
Resume sale
Apply discount
Select payment
Complete sale
Print receipt
```

The exact keyboard map should be finalized during UI implementation.

---

# 31.10 Loading Behaviour

The POS should avoid full-page loading states wherever possible.

Prefer:

```text
User action
   ↓
Immediate UI response
   ↓
Backend operation
   ↓
Confirmation/error
```

For example, adding an already-loaded product to a cart should be effectively instantaneous.

---

# 31.11 Concurrency Protection

You specifically requested **concurrency checks**.

This is particularly important for inventory and transactions.

Example:

```text
Stock = 1

Cashier A → attempts purchase
Cashier B → attempts purchase
```

The backend must prevent both transactions from successfully consuming the same final unit.

---

# 31.12 Database-Level Concurrency

Concurrency protection should not depend solely on frontend validation.

The database transaction should perform the authoritative check.

Conceptually:

```text
BEGIN
   ↓
Lock/check inventory
   ↓
Validate quantity
   ↓
Create transaction
   ↓
Update inventory
   ↓
COMMIT
```

If the operation cannot safely complete, it should fail atomically.

---

# 31.13 Transaction Atomicity

A completed sale must never produce a partially completed state such as:

```text
Sale created
BUT
Inventory not updated
```

or:

```text
Inventory reduced
BUT
Transaction missing
```

The relevant operations should be handled atomically.

---

# 31.14 Idempotency

Critical operations should be idempotent.

Examples:

* Refund
* Subscription payment verification
* Transaction completion
* Stock adjustment

A duplicated request must not duplicate the financial or inventory effect.

---

# 31.15 Transaction Immutability

You explicitly selected:

> **Transactional data is immutable.**

Therefore completed transactions should not simply be edited.

Instead of:

```text
Transaction #100
₦20,000
      ↓
EDIT
₦15,000
```

the system should create an appropriate corrective transaction/event.

This maintains a trustworthy historical record.

---

# 31.16 Audit System

The audit system records important actions.

An audit entry should generally contain:

```text
Actor
Action
Entity
Entity ID
Timestamp
Branch
Business Unit
Relevant metadata
```

Where appropriate:

```text
Before
After
```

values can also be recorded.

---

# 31.17 Auditable Events

Examples:

```text
Employee created
Employee deactivated
Role changed
Permission changed
Product created
Product price changed
Inventory adjusted
Stock transferred
Discount applied
Refund authorized
Refund completed
Customer credit issued
Customer credit adjusted
Layaway created
Layaway payment recorded
Business configuration changed
Subscription renewed
```

---

# 31.18 Audit Log Immutability

Audit records should themselves not be casually editable or deletable by normal Admin users.

The objective is to preserve:

> **Who did what, when, and to which entity.**

---

# 31.19 Data Deletion

You previously approved the recommended deletion approach.

Therefore transactional records should not be physically deleted simply because a user clicks "Delete."

Instead, where deletion is permissible:

```text
ACTIVE
  ↓
ARCHIVED / DEACTIVATED
```

Historical transactional records remain available.

---

# 31.20 Soft Deletion

Entities such as products, employees, customers and branches may use soft deletion/deactivation where appropriate.

For example:

```text
Product
Status: INACTIVE
```

rather than physically removing the record.

This prevents historical transactions from referencing missing entities.

---

# 31.21 RBAC

Authorization uses:

> **Role-Based Access Control**

with granular permissions.

The architecture should therefore separate:

```text
User
 ↓
Role
 ↓
Permissions
 ↓
Resource/action
```

rather than hardcoding:

```text
if user.role === "cashier"
```

throughout the application.

---

# 31.22 Permission Example

Instead of:

```text
Cashier can refund
```

use:

```text
transactions.refund.create
```

A role can then receive or lose that permission independently.

This is what allows custom roles.

---

# 31.23 Scope-Based Authorization

RBAC should also work with organizational scope.

For example:

```text
Role:
Branch Manager

Permission:
reports.sales.view

Scope:
Wuse Branch
```

This user can view sales reports for Wuse without automatically seeing every branch.

---

# 31.24 Server-Side Authorization

Permissions must be enforced on the backend.

Frontend restrictions are only UX.

A malicious user must not be able to bypass authorization by manually calling an API.

---

# 31.25 Supabase Security

Since the chosen stack is **Supabase + ERN**, Supabase Row Level Security should be a major security boundary.

Conceptually:

```text
Client
  ↓
Supabase Auth
  ↓
Authenticated User
  ↓
RLS Policies
  ↓
Authorized Business Data
```

RLS should enforce tenant/deployment and organizational boundaries even though each client has its own deployment.

---

# 31.26 Deployment Isolation

You selected **independent deployment per client**.

Therefore each client's deployment should have its own:

* Application instance
* Supabase project/database
* Authentication environment
* Storage
* Configuration
* Secrets

This provides stronger isolation than attempting to put all businesses into one shared database.

---

# 31.27 Secrets

Sensitive values must never be exposed in frontend code.

Examples:

* Supabase service-role credentials
* Resend API keys
* Paystack secret keys
* Database credentials
* Encryption secrets

Frontend code should only receive credentials that are explicitly safe for client-side exposure.

---

# 31.28 Authentication

Authentication is:

> **Email + Password**

The previously excluded authentication options remain excluded:

❌ MFA/2FA
❌ Google OAuth
❌ Microsoft OAuth
❌ Biometric authentication

However, the architecture should avoid making these impossible to add later.

---

# 31.29 Password Security

Password handling should be delegated to the authentication infrastructure rather than implemented manually.

The application should never store raw passwords.

---

# 31.30 Session Security

Authenticated sessions should:

* Expire appropriately
* Be invalidated when necessary
* Respect subscription status
* Respect employee activation status
* Respect authorization changes

A deactivated employee should not continue operating indefinitely using an already-issued session.

---

# 31.31 Subscription Enforcement

Subscription checks must occur server-side.

The application should effectively enforce:

```text
Authenticated
      AND
Active Subscription
      AND
Active Employee
      AND
Permission
```

before allowing protected operations.

The Super Admin is the exception to the subscription requirement.

---

# 31.32 Data Security

Data security should include:

* Encryption in transit
* Secure authentication
* Database access controls
* RLS
* Least-privilege access
* Secure secrets
* Input validation
* Output validation
* API authorization
* Audit trails
* Safe error handling

---

# 31.33 Input Validation

Every externally supplied value should be validated.

Examples:

```text
Price
Quantity
Tax rate
Discount
Customer information
Product information
Role permissions
Subscription duration
```

Validation must exist server-side even if the frontend already validates the input.

---

# 31.34 Financial Validation

Financial calculations should not rely on client-provided totals.

The server should calculate authoritative values:

```text
Subtotal
Discount
Tax
Service Charge
Tip
Total
```

The client can display calculations, but the backend determines the final transaction values.

---

# 31.35 Error Handling

You selected:

> **Basic built-in logging/error handling using free/native capabilities.**

Therefore the first release does not require expensive third-party observability platforms.

The system should still provide:

* Structured application errors
* Safe user-facing messages
* Server-side error logging
* Request identifiers where useful
* Database error logging
* Critical-operation logging

---

# 31.36 What We Are NOT Using Initially

You specifically excluded external:

❌ Error tracking
❌ Application logging platforms

We therefore should not introduce services such as paid monitoring platforms merely for the sake of having them.

---

# 31.37 Performance Monitoring

Performance monitoring remains supported through lightweight/native mechanisms.

Useful metrics include:

* API response time
* Database query duration
* POS operation duration
* Page load performance
* Error rate

The implementation should remain within the project's low-cost requirement.

---

# 31.38 Database Monitoring

Database health should be monitored using the capabilities available through the selected infrastructure.

Important indicators include:

* Query performance
* Connection usage
* Storage
* Database size
* Failed queries
* Slow operations

---

# 31.39 Uptime Monitoring

The deployment should have basic uptime monitoring.

Because the target infrastructure should remain free or very inexpensive, we should prefer:

* Native provider capabilities
* Free monitoring allowances
* Lightweight health endpoints

rather than introducing a paid monitoring stack.

---

# 31.40 API Monitoring

Critical API routes should expose enough information to identify:

* Failures
* Slow responses
* Unauthorized requests
* Repeated errors

without exposing sensitive information.

---

# 31.41 AI Architecture

You selected:

> **AI considered from the architecture stage.**

This does **not** mean AI needs to be implemented in the MVP.

Instead, the architecture should leave clean extension points.

Potential future AI capabilities include:

* Sales insights
* Inventory forecasting
* Anomaly detection
* Natural-language reporting
* Business recommendations
* Automated report summaries

---

# 31.42 AI Isolation

AI functionality should be isolated from core transaction processing.

The POS must never depend on an AI service to:

```text
Complete a sale
Update inventory
Process refund
Calculate tax
```

AI should be an enhancement layer.

---

# 31.43 AI and Data Privacy

AI features must not automatically send sensitive business data to third-party AI providers.

Any future AI integration should explicitly define:

* What data is sent
* Where it is sent
* Why it is sent
* Retention
* Access control

---

# 31.44 Cost Constraint

This is one of the most important architectural requirements you've established:

> **The entire product should work without paid services wherever possible, with a maximum target budget of approximately $10/month.**

Therefore every technical decision should be evaluated against:

```text
Does this require a paid service?
        ↓
Can Supabase provide it?
        ↓
Can Vercel/free infrastructure provide it?
        ↓
Can the functionality be implemented internally?
        ↓
If not, is there a free alternative?
```

---

# 31.45 Initial Infrastructure Philosophy

The architecture should prioritize:

### Free

before:

### Cheap

before:

### Paid

A paid service should only be introduced when there is a genuine architectural requirement that cannot reasonably be fulfilled with the existing stack.

---

# 31.46 Recommended Hosting Direction

For the Next.js/frontend portion, **Vercel's free tier is a strong initial candidate** because it aligns naturally with the React/Next.js ecosystem.

Supabase handles:

* PostgreSQL
* Authentication
* Storage
* RLS
* Database APIs

The backend/API architecture should be designed carefully around serverless-compatible execution rather than assuming persistent servers.

---

# 31.47 Important Infrastructure Constraint

Because we removed offline capability, the architecture no longer needs:

* Offline database
* Sync engine
* Conflict-resolution engine
* Offline transaction queue
* Background synchronization
* Local authoritative inventory

This significantly simplifies the system.

The POS is now:

```text
POS
 ↓
Internet
 ↓
Application/API
 ↓
Supabase
```

This is a major architectural simplification.

---

# 31.48 Network Requirement

Because offline mode has been completely eliminated:

> **An active internet connection is required to perform POS operations.**

The UI should clearly communicate connection problems rather than pretending a transaction succeeded.

---

# 31.49 Failure Behaviour

If connectivity is lost during a transaction:

```text
Request
 ↓
Network failure
 ↓
Transaction NOT confirmed
```

The system must never display a false successful sale simply because the local UI completed an action.

This is especially important for financial and inventory integrity.

---

# 31.50 Stage 31 — Final Scope

### Hardware

✅ Barcode scanners
✅ Receipt printers
✅ Customer displays
✅ Desktop
✅ Tablet
✅ Phone
✅ Hardware abstraction

### Performance

✅ Fast POS
✅ Keyboard-first workflows
✅ Minimal clicks
✅ Optimized search
✅ Concurrency checks
✅ Atomic transactions
✅ Idempotency

### Security

✅ RBAC
✅ Granular permissions
✅ Supabase RLS
✅ Server-side authorization
✅ Input validation
✅ Secure secrets
✅ Session control
✅ Subscription enforcement
✅ Data protection
✅ Transaction integrity

### Audit

✅ Immutable transactions
✅ Audit logs
✅ Administrative activity tracking
✅ Before/after data where appropriate
✅ Soft deletion/deactivation

### Observability

✅ Basic logging
✅ Error handling
✅ Performance monitoring
✅ Database monitoring
✅ Uptime monitoring
✅ API monitoring
❌ Paid error-tracking platform
❌ Paid logging platform

### AI

✅ Architecture-ready
❌ AI dependency in core POS
❌ AI required for MVP

### Infrastructure

✅ Internet-only POS
✅ Supabase
✅ React/Next.js ecosystem
✅ Free-first architecture
✅ Target ≤ $10/month
❌ Offline mode
❌ Synchronization engine

---

## Stage 31 Architectural Outcome

The system now has the major runtime safeguards:

```text
                    DYNAMIC POS
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
       FRONTEND       API/SERVER      SUPABASE
          │              │              │
          ▼              ▼              ▼
        POS         Authorization      RLS
        UX          Validation         DB
        Hardware    Transactions       Auth
                    Audit              Storage
                         │
                         ▼
                    OBSERVABILITY
                         │
                  ┌──────┴──────┐
                  ▼             ▼
                Logs          Metrics
```

The removal of offline capability makes the architecture considerably cleaner: **the database remains the authoritative source of truth for inventory, transactions, customers, and financial records.**
