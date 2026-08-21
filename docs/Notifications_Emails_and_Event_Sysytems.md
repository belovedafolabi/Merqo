# Stage 13 — Notifications, Email & Event System

This stage defines the notification architecture for the Dynamic POS.

The guiding principle is:

> **Notifications should be event-driven, permission-aware, non-blocking, and inexpensive to operate.**

The POS must never depend on a notification being successfully delivered for a core transaction to succeed.

---

# 1. Notification Architecture

The system should follow:

```text
POS / System Event
        ↓
   Event Creation
        ↓
 Notification Service
        ↓
 ┌───────────────┐
 │               │
 ↓               ↓
In-App          Email
```

For example:

```text
Subscription expires in 7 days
        ↓
Notification Event
        ↓
 ├── In-app notification
 └── Email to Owner
```

---

# 2. Notification Channels

You selected:

### In-app

**Yes**

### Email

**Yes**

### SMS

**No**

### WhatsApp

**No**

This is important for keeping operational costs low.

The initial communication architecture therefore only requires:

> PostgreSQL/Supabase + Resend.

---

# 3. Notification Types

The system should support several categories.

### Business

* New employee
* Product created
* Product updated
* Inventory alert
* Stock transfer
* Refund
* Discount
* Layaway
* Store credit

### Security

* Suspicious transaction
* Permission changes
* User changes
* Important account events

### Subscription

* Subscription expiring
* Subscription expired
* Subscription renewed
* Subscription payment successful
* Subscription payment failed

### System

* Important system events
* Integration failures
* System maintenance

---

# 4. Events vs Notifications

This distinction is important architecturally.

An **event** is something that happened.

A **notification** is a message generated because something happened.

Example:

```text
Sale completed
```

is an event.

While:

```text
₦250,000 sale completed by John
```

is a notification.

This allows multiple consumers to react to the same event later.

---

# 5. Event Architecture

Conceptually:

```text
Transaction Created
        ↓
    Event Bus
        ↓
 ┌──────┼─────────┐
 ↓      ↓         ↓
Audit  Reports  Notifications
```

This also prepares the architecture for future AI functionality.

---

# 6. Do Not Build a Complex Event Bus Yet

Because of the budget constraint, we should **not** introduce Kafka, RabbitMQ, or another dedicated event infrastructure.

For the initial system, Supabase/PostgreSQL can handle the event/outbox mechanism.

If the system eventually grows substantially, the event infrastructure can be upgraded.

---

# 7. Event Outbox Pattern

For important events, use an **outbox table**.

Example:

```text
event_outbox

id
event_type
aggregate_type
aggregate_id
payload
created_at
processed_at
```

Example record:

```text
event_type:
SALE_COMPLETED

aggregate_type:
SALE

aggregate_id:
sale_10292
```

This gives us reliable event processing without requiring expensive infrastructure.

---

# 8. Why the Outbox Matters

Imagine:

```text
Sale completed
       ↓
Save sale
       ↓
Send notification
```

If email sending fails, you don't want the sale itself to fail.

Instead:

```text
Database transaction
 ├── Sale
 └── Event
       ↓
Transaction succeeds
       ↓
Notification processed separately
```

Therefore:

> **Notification failure must never roll back a successful sale.**

---

# 9. In-App Notification Storage

In-app notifications will be stored in Supabase/PostgreSQL.

A conceptual table:

```text
notifications

id
recipient_user_id
type
title
message
data
read_at
created_at
```

---

# 10. Avoiding the Storage Problem

You previously raised concern about notification storage becoming large.

We should therefore **not retain every notification forever**.

Recommended retention:

```text
Unread notifications:
Keep

Read notifications:
Keep for a limited period

Old notifications:
Automatically delete/archive
```

For example, a configurable retention period could initially be:

> 90 days.

This should be configurable later.

---

# 11. Notification Read State

Each notification should support:

```text
Unread
Read
```

The UI can display:

```text
🔔 3
```

Clicking the notification marks it as read.

---

# 12. Notification Center

The application should have a global notification center.

Example:

```text
┌─────────────────────────────┐
│ Notifications          See all │
├─────────────────────────────┤
│ 🔴 Low stock                │
│ Coca-Cola is below threshold│
│ 2 min ago                   │
├─────────────────────────────┤
│ 👤 New employee             │
│ John Doe joined Branch A    │
│ 1 hour ago                  │
└─────────────────────────────┘
```

---

# 13. Notification Priority

Notifications should have priority.

```text
INFO
WARNING
IMPORTANT
CRITICAL
```

Examples:

### INFO

> New employee added.

### WARNING

> Product stock is low.

### IMPORTANT

> Subscription expires in 7 days.

### CRITICAL

> Suspicious transaction detected.

---

# 14. Notification Permissions

Not every user should receive every notification.

Example:

```text
Suspicious transaction
        ↓
Owner
Branch Manager (if permitted)
```

But not necessarily:

```text
Cashier
```

Therefore notifications must integrate with RBAC.

---

# 15. Notification Preferences

Users should eventually be able to configure certain notifications.

Example:

```text
Notification Preferences

Inventory alerts       ✓
New employees           ✓
Stock transfers         ✓
Security alerts         ✓
```

However, some notifications should be **mandatory** and cannot be disabled.

Examples:

* security events
* subscription expiry
* account lock events

---

# 16. Owner Email

You specified:

> Email notifications should go to the email address specified for the admin account.

The Owner's account therefore becomes the default administrative notification recipient.

Example:

```text
Owner
 └── admin@example.com
```

---

# 17. Subscription Notifications

This is one of the most important notification workflows.

You specified:

> Start notifications 7 days before expiry.

The system should therefore generate:

```text
7 days
6 days
5 days
4 days
3 days
2 days
1 day
Expiry day
```

---

# 18. Email Frequency

You specifically requested:

> Email every 2 days starting from the 7-day countdown.

Therefore:

```text
7 days remaining → Email
5 days remaining → Email
3 days remaining → Email
1 day remaining → Email
```

The system should also send an appropriate expiration email when the subscription expires.

---

# 19. In-App Subscription Notification

Example:

```text
⚠ Subscription Expiring

Your subscription expires in 7 days.

Renew now
```

The notification should contain a direct action:

> **Renew Subscription**

---

# 20. Subscription Banner

The admin dashboard should also display a persistent subscription indicator.

Example:

```text
┌─────────────────────────────────────────┐
│ Subscription expires in 6 days          │
│ [Renew Subscription]                    │
└─────────────────────────────────────────┘
```

As expiry approaches, the urgency level can change.

---

# 21. Subscription Expiry

You previously established:

> When the subscription expires, completely lock the application.

Therefore:

```text
Subscription Active
       ↓
7-day warning
       ↓
Expiry
       ↓
Application Locked
```

All normal users should be prevented from accessing the application.

---

# 22. Super Admin Exception

The Super Admin remains unaffected.

Therefore:

```text
Subscription expired

Owner             → LOCKED
Manager           → LOCKED
Cashier            → LOCKED
Employees         → LOCKED

Super Admin        → ACCESS
```

This allows you to administer the deployment and resolve subscription issues.

---

# 23. Subscription Renewal Event

Successful renewal:

```text
Paystack
   ↓
Payment verified
   ↓
Subscription extended
   ↓
Renewal event
   ↓
Notification
```

The system should not trust only the frontend's Paystack response.

The backend must verify the payment.

---

# 24. Paystack Webhook

The subscription system should use Paystack's webhook mechanism for payment confirmation.

Conceptually:

```text
Paystack
   ↓
Webhook
   ↓
Backend
   ↓
Verify transaction
   ↓
Update subscription
```

The system should also make this process **idempotent**.

If Paystack sends the webhook twice:

```text
Payment processed
Payment processed again
```

the subscription must only be extended once.

---

# 25. Subscription Payment Security

Never allow:

```text
Frontend:
"Payment succeeded"
        ↓
Give subscription
```

Instead:

```text
Frontend
   ↓
Payment initiated

Paystack
   ↓
Payment

Webhook/API verification
   ↓
Backend verification
   ↓
Subscription updated
```

---

# 26. Suspicious Transactions

You selected suspicious transaction notifications.

The first version should use **rule-based detection**, not AI.

Examples:

```text
Unusually large discount
Multiple rapid refunds
Repeated refund attempts
Abnormal transaction amount
```

The exact rules should be configurable later.

---

# 27. Example Suspicious Transaction

```text
⚠ Suspicious Transaction

A ₦450,000 transaction was completed
with a 50% discount.

Cashier:
John Doe

Branch:
Wuse Branch

[View Transaction]
```

This should be sent to authorized users.

---

# 28. New Employee Notification

When an employee is created:

```text
Employee Created
      ↓
Notification
      ↓
Owner / authorized managers
```

Example:

> A new Cashier, John Doe, has been added to Wuse Branch.

---

# 29. Inventory Notifications

When inventory crosses its configured threshold:

```text
Stock Level
    ↓
Threshold reached
    ↓
Notification
```

Example:

> Coca-Cola 50cl has fallen below its minimum stock level.

---

# 30. Stock Transfer Notifications

Because stock transfers are now supported:

```text
Transfer Requested
       ↓
Notification
```

and after completion:

```text
Transfer Completed
       ↓
Notification
```

The exact recipients should depend on permissions.

---

# 31. Refund Notifications

Because refunds require authorization:

```text
Refund Requested
       ↓
Authorized user
       ↓
Approved
       ↓
Refund completed
```

Notifications can therefore be generated at:

* request
* approval
* rejection
* completion

---

# 32. Layaway Notifications

Potential notifications:

```text
Layaway created
Payment received
Balance remaining
Layaway completed
```

We should **not** introduce complex automated customer reminders in the MVP unless you later request them.

---

# 33. Store Credit Notifications

Internal notifications can be generated when:

```text
Credit issued
Credit used
Credit adjusted
```

Again, this is internal system notification rather than SMS/WhatsApp communication.

---

# 34. Email Architecture

Use:

> **Resend**

as the email provider.

The application should have a centralized email service.

Conceptually:

```text
Application
     ↓
Email Service
     ↓
Resend
     ↓
Recipient
```

No feature should directly call Resend.

Bad:

```text
SubscriptionService → Resend
EmployeeService → Resend
RefundService → Resend
```

Better:

```text
Services
   ↓
Notification/Event Layer
   ↓
Email Service
   ↓
Resend
```

---

# 35. Email Templates

Templates should be centralized.

Examples:

```text
subscription-expiring
subscription-expired
subscription-renewed
new-employee
security-alert
refund-requested
refund-approved
inventory-low
```

---

# 36. Email Template Branding

Emails should use the business's branding configuration:

```text
Logo
Brand name
Primary color
Secondary color
```

Therefore the same application deployment can produce:

```text
ABC Supermarket
```

and:

```text
XYZ Pharmacy
```

with different branding.

---

# 37. Email Failure Handling

If Resend fails:

```text
Email attempt
    ↓
Failure
    ↓
Retry
```

But the underlying event should remain intact.

Example:

```text
Subscription renewal
        ↓
Database updated ✓
        ↓
Email failed ✗
```

The subscription remains renewed.

---

# 38. Retry Strategy

For transient email failures:

```text
Attempt 1
   ↓
Attempt 2
   ↓
Attempt 3
```

After the maximum retries:

```text
Failed
```

and the failure can be logged.

We should avoid infinite retries.

---

# 39. Idempotency

Every notification/event should have an idempotency mechanism.

For example:

```text
subscription_expiry:
business_id + expiry_date + warning_days
```

This prevents accidentally sending:

```text
7-day warning
7-day warning
7-day warning
```

multiple times.

---

# 40. Notification Event Lifecycle

A useful lifecycle:

```text
CREATED
   ↓
QUEUED
   ↓
PROCESSING
   ↓
SENT
```

or:

```text
PROCESSING
   ↓
FAILED
   ↓
RETRY
```

---

# 41. Queue Infrastructure

Because your budget target is extremely low, we should **not automatically introduce a paid queue service**.

The first architecture can use:

```text
Supabase PostgreSQL
+
Scheduled/edge processing
```

for lightweight background work.

If the deployment eventually needs heavy queue processing, we can introduce a queue system later.

---

# 42. Scheduled Jobs

Some events require time-based execution.

For example:

```text
Every day
    ↓
Check subscriptions
    ↓
Find subscriptions expiring in
7, 5, 3, 1 days
    ↓
Generate notifications
```

This should be implemented using the cheapest available native scheduling capability rather than a paid third-party scheduler.

---

# 43. Notification Retention

Recommended initial policy:

```text
Unread:
Retain

Read:
90 days

Processed event records:
Longer retention for auditability
```

However, event retention and notification retention should be separate.

---

# 44. Event vs Audit Data

Do not use notifications as an audit system.

For example:

```text
Notification:
"Refund approved"
```

is not sufficient audit information.

The audit system should independently record:

```text
Who
What
When
Where
Before
After
Reason
Reference
```

---

# 45. Notification Payloads

Notifications should store structured metadata.

Example:

```json
{
  "type": "REFUND_APPROVED",
  "transaction_id": "...",
  "branch_id": "...",
  "amount": 45000
}
```

The UI can then generate the appropriate action.

For example:

> View Transaction

rather than storing an arbitrary URL.

---

# 46. Deep Links

Notifications should support navigation.

Example:

```text
Notification
    ↓
View Transaction
    ↓
/transactions/123
```

Permission checks must still happen when the user opens the page.

A notification must **never grant access** to a resource.

---

# 47. Real-Time In-App Notifications

For important in-app notifications, Supabase Realtime can be considered.

Example:

```text
Backend creates notification
        ↓
Realtime event
        ↓
User's browser
        ↓
🔔 Notification appears
```

This avoids constant polling.

However, Realtime should not be used indiscriminately for every database table.

---

# 48. Notification Bell

The global layout should contain:

```text
Logo       Search       🔔       User
```

Clicking 🔔 opens the notification panel.

---

# 49. Notification Page

A dedicated page should allow:

```text
All
Unread
Security
Inventory
Sales
Subscription
System
```

with:

> Mark all as read

---

# 50. Email Unsubscribe

There is an important distinction.

Certain operational/security emails should not necessarily be treated as optional marketing communications.

Since these are transactional system emails, the system can classify them as:

```text
Operational
Security
Billing
```

rather than marketing.

We should not build a marketing email subscription system because it is outside the product scope.

---

# 51. Cost Strategy

The entire notification system should target:

```text
Supabase      $0
Resend        Free tier
Scheduling    Native/free
Email         Resend
SMS           None
WhatsApp      None
External queue None initially
```

This aligns with your:

> **$0 preferred / maximum ~$10 monthly budget**

requirement.

---

# 52. Failure Isolation

The most important reliability rule:

### Notification failure must never break:

* Checkout
* Sale creation
* Refund processing
* Inventory update
* Customer creation
* Product creation
* Subscription state updates

Notifications are secondary effects.

---

# 53. Recommended Event Types

Initial event catalogue:

```text
SALE_COMPLETED
SALE_REFUNDED

REFUND_REQUESTED
REFUND_APPROVED
REFUND_REJECTED

PRODUCT_CREATED
PRODUCT_UPDATED
PRODUCT_LOW_STOCK

STOCK_TRANSFER_CREATED
STOCK_TRANSFER_COMPLETED

EMPLOYEE_CREATED
EMPLOYEE_UPDATED
PERMISSION_CHANGED

LAYAWAY_CREATED
LAYAWAY_PAYMENT_RECEIVED
LAYAWAY_COMPLETED

STORE_CREDIT_ISSUED
STORE_CREDIT_USED

SUSPICIOUS_TRANSACTION_DETECTED

SUBSCRIPTION_EXPIRING
SUBSCRIPTION_EXPIRED
SUBSCRIPTION_RENEWED
SUBSCRIPTION_PAYMENT_FAILED
```

---

# 54. Important Scope Correction

You previously excluded:

> Failed payment

from general notifications.

That remains respected.

However, **subscription payment failure is different** because it directly affects the SaaS subscription.

Therefore:

```text
Customer POS payment failed
→ No notification

Client's software subscription payment failed
→ Notification
```

This distinction should be explicitly encoded in the PRD.

---

# 55. Stage 13 — Locked Decisions

| Area                                     | Decision                  |
| ---------------------------------------- | ------------------------- |
| In-app notifications                     | Yes                       |
| Email                                    | Yes                       |
| SMS                                      | No                        |
| WhatsApp                                 | No                        |
| Event-driven architecture                | Yes                       |
| Outbox pattern                           | Yes                       |
| Complex message broker                   | No initially              |
| Notification retention                   | Limited                   |
| RBAC-aware notifications                 | Yes                       |
| Subscription warnings                    | Yes                       |
| 7-day warning                            | Yes                       |
| Email every 2 days from 7 days           | Yes                       |
| Suspicious transaction alerts            | Yes                       |
| New employee alerts                      | Yes                       |
| Inventory alerts                         | Yes                       |
| Refund notifications                     | Yes                       |
| Stock transfer notifications             | Yes                       |
| AI-generated alerts                      | Deferred                  |
| External monitoring service              | No                        |
| Resend                                   | Yes                       |
| Notification failure blocks transactions | **Never**                 |
| Super Admin access                       | Unrestricted              |
| Subscription expiry                      | Complete application lock |
| Super Admin after expiry                 | Still has access          |

---