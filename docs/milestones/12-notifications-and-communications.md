# Milestone 12 — Notifications & Communications

## Status

Planned

## Objective

Build the event-driven notification model — in-app notifications plus email via Resend, routed through a single shared `EmailService`/`NotificationService` layer — reused by every domain that needs to alert a user: low stock (Milestone 07), subscription expiry (Milestone 13), suspicious activity/security events (Milestone 15), and employee/administrative events (Milestone 11).

## Why This Milestone Exists

Several earlier and later milestones produce events that need to reach a user (low-stock conditions, employee invitations, subscription warnings, security alerts), but per `docs/TAS.md` §32–33, business logic must never call Resend directly — it must go through a `NotificationService`/`EmailService` layering so notification delivery is consistent, testable, and swappable. Building this as its own milestone, after the domains that produce events (05–11) but before Subscription (13, which depends heavily on expiry-warning emails), gives every event producer one correct integration point instead of several inconsistent ones.

## Dependencies

- Milestone 03 (users/audit foundation — notifications are tied to users and are themselves auditable where sensitive).
- Milestone 07 (low-stock condition detection, one of this milestone's first real event sources).
- Milestone 11 (employee invitation, reconciled to use this milestone's shared email path if built earlier).

## Scope

- Internal notification model: `notifications` table (`user_id`, `type`, `title`, `message`, `read_at`, `created_at`), per `docs/TAS.md` §32.
- In-app notification delivery: bell/inbox UI, mark-as-read, notification list.
- Email delivery via Resend, routed through a shared `EmailService`, itself only ever called by a `NotificationService`, never directly by feature/business logic, per `docs/TAS.md` §33's layering (`SubscriptionService → NotificationService → EmailService → Resend`).
- Event-driven triggers wired up for the event sources that exist at this point in the roadmap: low-stock alerts (from Milestone 07), suspicious-activity/security alerts (basic triggers — full depth in Milestone 15), employee-change notifications (reconciling Milestone 11's invitation email into this shared path if not already), general administrative/system events.
- Notification preferences (which events a user wants delivered in-app vs. email, at a sensible default) — kept simple, not a fully granular per-event-type matrix unless a concrete need emerges.

## Out of Scope

- Subscription-expiry-specific notification content/scheduling (Milestone 13 — this milestone provides the generic delivery mechanism Milestone 13 calls into).
- Deep security-event notification logic (Milestone 15 — this milestone wires the generic trigger path; Milestone 15 adds the specific detection rules).
- Push notifications / SMS — not specified anywhere in the source documents; not built.

## Functional Requirements

- Any part of the system can trigger a notification by calling the shared `NotificationService`, which decides (based on type/user preference) whether to deliver in-app, via email, or both.
- A user sees unread notifications in an in-app inbox and can mark them read.
- Email notifications are sent via Resend, formatted consistently (a shared email template/layout, branded per organization where appropriate, reusing Milestone 04's branding mechanism for the visual layer).
- No business-logic module calls Resend's API directly — verified during implementation review, not just assumed.
- A low-stock condition (from Milestone 07) produces a real, working notification end-to-end.

## Technical Requirements

- `NotificationService` as the single call surface for producing a notification; `EmailService` as its only permitted path to Resend.
- Notification delivery failure (e.g., Resend API error) is handled gracefully — logged, retried where sensible, and never allowed to fail the triggering business operation (e.g., a failed low-stock email must not roll back the inventory adjustment that triggered it).
- No background-job/queue infrastructure introduced beyond what's genuinely needed — per `docs/TAS.md` §38, use Vercel's/Next.js's own scheduling primitives (e.g., a scheduled Route Handler triggered by a free-tier-compatible cron mechanism) rather than BullMQ/Redis for anything that can be handled that simply.

## Database Changes

- New table: `notifications` (`user_id`, `type`, `title`, `message`, `read_at`, `created_at`, optionally `metadata` for linking back to the triggering resource).
- New table/columns: notification preferences (per user, coarse-grained: in-app/email toggle per notification category).

## API / Backend Changes

- `NotificationService.notify(userId, type, payload)` (or equivalent) — the shared entry point.
- `EmailService.send(template, to, data)` — the shared Resend integration, called only by `NotificationService`.
- Server Actions/queries: list notifications, mark read, update notification preferences.
- Wiring: Milestone 07's low-stock detection calls `NotificationService`; Milestone 11's invitation flow reconciled to call it too if not already.

## Frontend Changes

- Notification bell/inbox component (likely in the Admin Dashboard shell's topbar, per Milestone 04's layout), unread-count badge, notification list, mark-as-read interaction.
- Notification preferences screen.

## Security Requirements

- Notifications are scoped to their intended recipient — a user cannot read another user's notifications (permission/RLS-checked, consistent with Milestone 03's pattern).
- Email templates never leak sensitive data (e.g., a low-stock email doesn't need to include unrelated financial figures) — reviewed per template during implementation.
- Notification content is treated as system-generated, not user-supplied, avoiding any injection risk in email rendering.

## Testing Requirements

- Unit tests: `NotificationService` correctly routes to in-app/email based on type/preference.
- Integration tests: triggering a low-stock condition (Milestone 07) produces both an in-app notification and an email (verified against a test/sandbox Resend setup or a mocked email boundary at the `EmailService` layer, with at least one true end-to-end test against Resend's actual API in a controlled test environment).
- Failure-handling tests: a simulated Resend API failure does not roll back or fail the triggering business operation.
- Authorization tests: a user cannot read another user's notifications.

## CI/CD Requirements

- Extend the pipeline with this milestone's test suite; Resend API credentials for test/sandbox use added to CI secrets (never logged).

## Observability

- Structured logging for notification delivery attempts/failures, distinct from the audit log (delivery logs are operational; audit entries are for the sensitive events that produce notifications, not the notification delivery mechanics themselves).

## Deliverables

- Working `NotificationService`/`EmailService` layering.
- In-app notification inbox.
- Working low-stock notification, end-to-end, as the first real production use of this milestone's infrastructure.
- Notification preferences.

## Acceptance Criteria

- [ ] Every notification in the system is produced via the shared `NotificationService`, with zero direct Resend calls from business logic (verified by code review/search during this milestone).
- [ ] In-app notifications display correctly, scoped to the correct user, with working mark-as-read.
- [ ] A low-stock condition from Milestone 07 produces a real in-app notification and email.
- [ ] A simulated email-delivery failure does not affect the triggering business operation.
- [ ] Notification preferences are respected.

## Definition of Done

All acceptance criteria pass, and a codebase-wide check confirms no module outside `EmailService` imports/calls Resend directly.

## Implementation Notes

- Keep notification preferences coarse (per-category, not per-individual-event-type) unless a concrete need for finer granularity emerges — matches the project's general preference for simple, maintainable configuration over speculative flexibility.
- Do not introduce a message queue (SQS/RabbitMQ/BullMQ+Redis) for notification delivery — synchronous delivery within the Server Action, with graceful failure handling, is sufficient at this scale and keeps infrastructure free.

## Risks

- If notification delivery is allowed to block or fail the triggering business transaction (e.g., a sale rollback because a receipt email failed), that's a correctness bug with real business impact — the failure-isolation requirement above is the mitigation, and must be tested explicitly, not assumed.

## Future Considerations

- If notification volume ever grows enough to need async/queued delivery, Vercel's serverless functions and a lightweight, still-free mechanism (e.g., Supabase's own scheduled functions) should be evaluated first, before introducing Redis/BullMQ, per the project's cost principle.
