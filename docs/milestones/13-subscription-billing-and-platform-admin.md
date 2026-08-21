# Milestone 13 — Subscription, Billing & Platform Administration

## Status

Planned

## Objective

Build organization-level subscription management: Super Admin-configured pricing across four durations, Paystack checkout with mandatory backend-verified webhook confirmation, expiry warnings (via Milestone 12's notification infrastructure), and the subscription-lock middleware that disables login for an expired client while exempting the Super Admin.

## Why This Milestone Exists

Subscription is the platform's own monetization mechanism and the one place Paystack is used at all (per `docs/PRD.md` §17 — exclusively for software subscription billing, never POS customer payments). It's sequenced late because it depends on Notifications (Milestone 12, for expiry warnings) and benefits from Administration (Milestone 11) already existing for the Super Admin/Owner administrative context — but it must land before Production Readiness (Milestone 16) since a client deployment isn't commercially complete without working billing enforcement.

## Dependencies

- Milestone 03 (Super Admin's untethered role, RBAC).
- Milestone 11 (administrative screens/patterns this milestone's Super Admin pricing config and Owner subscription screens build on).
- Milestone 12 (notification delivery for expiry warnings).

## Scope

- Subscription model: organization-level (not per-branch/per-business-unit), plan, billing period (monthly/quarterly/semi-annual/annual), price, start/end date, status (`ACTIVE`/`EXPIRING`/`EXPIRED`), per `docs/TAS.md` §29.
- Super Admin pricing configuration: pricing per duration is configurable, not hardcoded (per `docs/PRD.md` §37 / Stage 30 §30.33) — scoped, per `DECISIONS_AND_CONFLICTS.md` §5, as the Super Admin's untethered configuration of *this* single-tenant deployment's own pricing, not a cross-client pricing console.
- Owner subscription flow: select duration → review price → Paystack checkout → payment verification → extend subscription → audit → notification, per `docs/TAS.md` §30.
- Paystack integration: checkout initiation, webhook handler with signature verification, and mandatory backend-side payment verification — the subscription is never activated based solely on the frontend's Paystack response (per `docs/TAS.md` §30).
- Expiry warning: 7 days before expiry, dashboard banner + email (via Milestone 12's `NotificationService`), per `docs/PRD.md` §38.
- Subscription lock: on expiry, active sessions terminate, login is disabled for the organization's users, application locked — except the Super Admin, who remains unrestricted, per `docs/PRD.md` §38 / `docs/TAS.md` §31.
- Idempotency on webhook processing (a duplicate/retried webhook delivery must not double-extend a subscription), consistent with Milestone 08's idempotency pattern.

## Out of Scope

- Any actual POS customer payment processing through Paystack — explicitly and permanently out of scope for the whole project (`docs/PRD.md` §17).
- A cross-client, multi-tenant Super Admin console spanning multiple independent deployments — flagged as an open assumption in `DECISIONS_AND_CONFLICTS.md` §5; if the project owner confirms a genuine multi-tenant meta-console is needed, that is materially different, additional scope requiring its own milestone, not an extension of this one.
- General platform configuration beyond pricing/subscription (Milestone 11 already covers organization/branding/business configuration).

## Functional Requirements

- The Super Admin can configure subscription pricing for each of the four durations.
- An Owner can select a duration, see the correct price, complete payment via Paystack, and have their organization's subscription correctly extended only after backend-verified payment confirmation.
- 7 days before expiry, affected users see a dashboard banner and receive an email warning.
- On expiry, all non-Super-Admin sessions for the organization are terminated and login is blocked, with a clear message directing the Owner to renew.
- The Super Admin can always log in and access the system regardless of the organization's subscription status.
- A duplicate webhook delivery for the same payment does not extend the subscription twice.

## Technical Requirements

- Paystack webhook signature verification implemented and enforced — a webhook payload that fails signature verification is rejected outright, never trusted.
- Payment verification calls Paystack's server-side verification API before extending a subscription — the webhook alone (even if signature-valid) triggers a verification call rather than being blindly trusted for the payment amount/status.
- Subscription-lock check integrated into the authentication/session layer built in Milestone 03 (the hook point stubbed there is now implemented) — evaluated on login and, for already-active sessions, via a mechanism that invalidates them promptly on expiry (e.g., a short-lived session/claim check, or a server-side session revocation call).
- Webhook idempotency implemented via Paystack's event/transaction reference, stored and checked before processing.

## Database Changes

- New tables: `subscriptions` (organization-level: plan, billing period, price, start/end date, status), `subscription_payments` (payment records, Paystack reference, verification status), `subscription_pricing` (Super Admin-configurable price per duration).
- `webhook_events` (or equivalent) table recording processed Paystack event IDs for idempotency.

## API / Backend Changes

- Server Actions: Super Admin pricing configuration CRUD; Owner subscription-checkout initiation.
- Route Handler: Paystack webhook receiver (signature verification, idempotency check, server-side payment verification, subscription extension, audit event, notification trigger via Milestone 12).
- Subscription-lock middleware/check, integrated into the auth/session layer.

## Frontend Changes

- Super Admin pricing configuration screen.
- Owner subscription screen: current status, duration selection, price display, "Renew Subscription" flow initiating Paystack checkout.
- Expiry warning banner ("Subscription expires in X days" + "Renew Subscription", per `docs/PRD.md` §38).
- Expired/locked-out screen shown to non-Super-Admin users of an expired organization.

## Security Requirements

- Webhook endpoint verifies Paystack's signature on every request; requests failing verification are rejected and logged as a potential security event (feeding Milestone 15's security monitoring).
- Subscription activation/extension never trusts client-side state — always re-verified server-side against Paystack directly, per `docs/TAS.md` §30's explicit warning.
- Paystack secret keys stored only in server-side environment variables (Vercel's encrypted secret store), never exposed to client code, consistent with Milestone 01's secret-management convention.
- Subscription-lock bypass is exclusively for the Super Admin role — tested explicitly to confirm no other role can bypass it under any configuration.

## Testing Requirements

- Unit tests: subscription status transitions (`ACTIVE` → `EXPIRING` → `EXPIRED`) and the pricing-resolution logic.
- Integration tests: full checkout-to-verified-extension flow against Paystack's test/sandbox environment.
- Webhook tests: an invalid-signature webhook is rejected; a duplicate valid webhook does not double-extend a subscription (idempotency).
- Lock tests: an expired organization's non-Super-Admin users cannot log in or continue an existing session; the Super Admin can, unconditionally.
- Notification tests: the 7-day expiry warning triggers correctly (integrated with Milestone 12's suite).

## CI/CD Requirements

- Extend the pipeline with this milestone's test suites, using Paystack's sandbox/test-mode credentials stored as CI secrets.
- Add a scheduled CI/CD job (or Vercel-compatible scheduled function) that evaluates approaching/passed expiry dates daily, triggering warning notifications and lock transitions — implemented per Milestone 12's "no heavy queue infrastructure" guidance (a simple scheduled Route Handler is sufficient).

## Observability

- Audit log entries for every subscription state change, pricing configuration change, and payment verification (success and failure).
- Structured logging on webhook processing (received, verified, rejected, processed) to support billing-related support/debugging without a paid observability tool.

## Deliverables

- Working Super Admin pricing configuration.
- Working Owner subscription/renewal flow with real, backend-verified Paystack payment.
- Working expiry warning and subscription-lock enforcement.
- Idempotent, signature-verified webhook handling.

## Acceptance Criteria

- [ ] Super Admin can configure pricing for all four durations.
- [ ] An Owner can renew a subscription and the extension only takes effect after backend-verified payment.
- [ ] A tampered or unsigned webhook payload is rejected.
- [ ] A duplicate webhook does not double-extend a subscription.
- [ ] 7-day expiry warning is delivered via dashboard banner and email.
- [ ] On expiry, non-Super-Admin login and active sessions are blocked; Super Admin access is unaffected.
- [ ] All subscription/payment events are audited.

## Definition of Done

All acceptance criteria pass against Paystack's sandbox environment, and a manual test confirms the full lifecycle (subscribe → warning → expire → lock → renew → unlock) behaves correctly end-to-end.

## Implementation Notes

- Treat `DECISIONS_AND_CONFLICTS.md` §5's Super Admin scope as a live open question — if implementation reveals the project owner actually wants cross-client management, raise it before building further Super Admin features on the single-tenant assumption.
- Reuse Milestone 08's idempotency pattern (idempotency key checked before processing) for webhook handling rather than inventing a second idempotency mechanism.

## Risks

- Payment/webhook handling is a common source of subtle bugs (double-processing, trusting unverified client state) — this milestone's testing requirements are non-negotiable and should be reviewed with the same rigor as Milestone 08's transaction engine.
- Session invalidation on expiry (as opposed to just blocking new logins) can be technically tricky depending on the session mechanism chosen in Milestone 03 — confirm during implementation that Supabase's session model supports prompt server-side revocation, and design around its actual capabilities rather than assuming instant invalidation is free.

## Future Considerations

- If a genuine multi-tenant Super Admin console is confirmed as a real requirement later, it is a materially separate system (likely its own small application/dashboard querying multiple clients' Supabase projects) and should be scoped as new, explicit milestones — not silently folded into this one.
