# Milestone 11 — Administration, Employees & Branding

## Status

Planned

## Objective

Build the operational administration layer: employee directory with invite/deactivate, the custom-role builder UI (on top of Milestone 03's RBAC schema/enforcement), branding asset management (on top of Milestone 04's branding mechanism), and receipt template customization.

## Why This Milestone Exists

Milestones 02–03 built the RBAC *schema and enforcement engine*, and Milestone 04 built the *branding rendering mechanism* — but no screens exist yet for an Owner/Admin to actually manage employees, design a custom role, or edit their branding/receipt appearance. This milestone delivers that day-to-day operational tooling, deliberately sequenced after the core transactional milestones (05–09) so it manages a business that already has real structure, products, and sales to administer.

## Dependencies

- Milestone 03 (RBAC schema/enforcement, permission catalog).
- Milestone 05 (Business Unit/Branch structure to scope employee assignments against).
- Milestone 04 (branding rendering mechanism, to attach an editing UI to).

## Scope

- Employee directory: list, invite (email-based invitation flow, using Resend), deactivate/reactivate, view an employee's assigned role(s) and scope(s).
- Custom-role builder UI: create a new role, name it, assign a set of permissions from the existing permission catalog, per `docs/Auth_Users_Roles_Authorization.md`'s "roles are configurations, not application logic" rule — the builder only ever composes existing, whitelisted permissions, it never generates new code paths.
- Role assignment UI: assign a role + scope (organization/branch/business-unit) to an employee.
- Branding management screen: edit brand name, primary/secondary color (with the Milestone 04 contrast-check utility surfacing warnings), logo upload.
- Receipt template customization: select/configure a receipt template, incorporating branding (logo, name, colors), business information, and the standard transaction fields defined in Milestone 08 (tax, service charge, discount, payment info) per `docs/PRD.md` §30.
- Business configuration screens beyond what Milestone 05 covered at onboarding time (ongoing edits to organization-level settings not already covered elsewhere).

## Out of Scope

- The underlying RBAC/permission-check engine itself (Milestone 03 — this milestone only adds a UI on top of it).
- The branding CSS-variable rendering mechanism (Milestone 04 — this milestone only adds an editing UI).
- Subscription/billing administration (Milestone 13).
- Notification preferences UI (Milestone 12).

## Functional Requirements

- An Owner/Admin (or permitted user) can invite a new employee by email; the invitee receives an email (via Resend) with a way to set up their account and is assigned an initial role/scope.
- An employee can be deactivated, immediately revoking their access (verified against Milestone 03's authorization layer — a deactivated user's existing session is also invalidated, not just blocked from future logins).
- A custom role can be created by selecting from the existing permission catalog; once created, it behaves identically to a built-in role everywhere in the system (proving the "roles are configuration" rule holds).
- Branding changes (color, logo, name) are reflected immediately across the Admin Dashboard and POS shells, with unsafe color combinations flagged per Milestone 04's contrast utility.
- Receipt templates render correctly with the organization's branding and a real transaction's data.

## Technical Requirements

- Employee invitation implemented as a token-based invite flow (signed, time-limited invite link) sent via Resend, consistent with the email-sending pattern established for other notifications (coordinate with Milestone 12 so there is one `EmailService`, not two).
- Custom-role creation writes only to the existing `roles`/`role_permissions` tables from Milestone 03 — no new authorization mechanism is introduced.
- Receipt template rendering reuses Milestone 08's receipt data model, only adding presentation/template selection on top.

## Database Changes

- New tables/columns: `employee_invitations` (token, email, invited role/scope, status, expiry); receipt template selection/configuration storage (e.g., `receipt_templates` or configuration columns on `organizations`).
- No changes to the core RBAC tables from Milestone 03 beyond normal row inserts (new roles, new role-permission assignments) — the schema itself does not change.

## API / Backend Changes

- Server Actions: invite employee, resend invitation, accept invitation, deactivate/reactivate employee, create/edit custom role, assign role+scope to employee, update branding, update receipt template configuration.
- Reuses: Milestone 03's `EmailService`-equivalent hook point (coordinated with Milestone 12's shared email/notification service, per `docs/TAS.md` §33's `SubscriptionService → NotificationService → EmailService → Resend` layering — business logic never calls Resend directly).

## Frontend Changes

- Employee directory screen (list, invite form, deactivate action, role/scope display).
- Custom-role builder screen (permission checklist grouped by resource, role naming).
- Role assignment screen/flow.
- Branding editor screen (color pickers with contrast warning, logo upload).
- Receipt template editor/preview screen.

## Security Requirements

- Employee management and role-builder actions are themselves permission-checked (`employees.invite`, `employees.deactivate`, `roles.create`, `roles.assign`) — a non-Owner/Admin role cannot grant itself or others elevated permissions unless explicitly permitted by policy (self-elevation is explicitly disallowed by default).
- Deactivating an employee immediately invalidates their active session(s), not just future logins — verified with an explicit test.
- Invitation tokens are single-use, time-limited, and unguessable (cryptographically random).
- Logo/branding asset uploads validated (file type/size) and stored with organization-scoped access.
- Every employee/role/branding change is audited.

## Testing Requirements

- Integration tests: full invite → accept → login flow; deactivation immediately blocks further access including any existing session.
- Authorization tests: a role without `roles.create`/`roles.assign` permission cannot create or assign roles; a user cannot self-elevate their own permissions.
- Custom-role tests: a newly created custom role, once assigned, correctly grants exactly the selected permissions — no more, no less — verified against Milestone 03's permission-resolution logic.
- Branding/receipt tests: contrast-check warnings trigger correctly; receipt template renders correctly with a real (test) transaction and organization branding.

## CI/CD Requirements

- Extend the pipeline with this milestone's test suites; no new infrastructure required (reuses Resend integration test patterns established alongside Milestone 12, sequenced/coordinated as needed).

## Observability

- Audit log entries for every employee/role/branding/receipt-template change.
- Structured logging for invitation email send failures (so a failed invite is noticeable, not silent).

## Deliverables

- Working employee directory and invite/deactivate flow.
- Working custom-role builder and role-assignment UI.
- Working branding and receipt template editors.

## Acceptance Criteria

- [ ] An employee can be invited, accept the invitation, and log in with the assigned role/scope.
- [ ] Deactivating an employee immediately revokes access, including any active session.
- [ ] A custom role, once created and assigned, grants exactly its selected permissions and behaves identically to a built-in role.
- [ ] Self-elevation of permissions is not possible by default.
- [ ] Branding changes render correctly and unsafe color combinations are flagged.
- [ ] Receipt templates render correctly with branding and real transaction data.
- [ ] All administrative actions in this milestone are permission-checked and audited.

## Definition of Done

All acceptance criteria pass, and a manual test proves the "roles are configuration, not code" rule end-to-end: a brand-new custom role with a hand-picked permission set, created entirely through this milestone's UI, correctly gates access with zero application-code changes.

## Implementation Notes

- Coordinate the email-sending path with Milestone 12 so there is exactly one shared `EmailService`/`NotificationService` layer (per `docs/TAS.md` §33) — do not build a second, invitation-specific email integration.
- Keep the custom-role builder's permission checklist grouped and readable (by resource, e.g., "Products," "Inventory," "Sales") rather than a flat, unstructured list of 50+ checkboxes.

## Risks

- Self-elevation and privilege-escalation bugs are the primary risk in a custom-role builder — this milestone's authorization tests must explicitly attempt escalation paths (a low-privilege user trying to grant themselves `roles.assign` or similar) and confirm they fail.

## Future Considerations

- Branch-specific branding is out of MVP scope (Stage 24) — the branding editor here operates at the organization level only, consistent with Milestone 04's mechanism.
