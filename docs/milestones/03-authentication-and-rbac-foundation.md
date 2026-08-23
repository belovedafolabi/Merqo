# Milestone 03 — Authentication & RBAC Foundation

## Status

Complete — merged via [PR #8](https://github.com/belovedafolabi/Merqo/pull/8) (2026-08-22)

## Objective

Wire up Supabase Auth for email/password authentication, establish authenticated session handling across the Next.js app, populate the Users/Roles/Permissions/Scope schema stubbed in Milestone 02, build the server-side authorization layer (the actual enforcement mechanism, not just frontend UI hints), author the first real RLS policies, and stand up the audit-log write path. This is the security backbone every later milestone's "Security Requirements" section builds on.

## Why This Milestone Exists

Per `docs/Auth_Users_Roles_Authorization.md` (Stage 7 — Final Decisions) and `docs/Security _Architecture_And_Authorization.md` §68, RBAC + RLS + server-side authorization are all mandatory, and "roles are configurations, not application logic" is the architectural rule that keeps this a genuinely dynamic platform. Getting authorization right before any feature screens exist means every subsequent milestone can assume a working `requirePermission()`-style guard and real RLS policies instead of retrofitting security after the fact — which the project's own security requirements explicitly forbid treating as an afterthought.

## Dependencies

- Milestone 02 (Organizations/Branches/Business Units schema, and the Users/Roles/Permissions/Audit table skeletons this milestone populates and enforces).

## Scope

- Supabase Auth integration: email/password sign-up, sign-in, sign-out, password reset, session persistence (server-side, via Supabase SSR helpers) — no MFA, no OAuth, no biometrics (excluded per `docs/Auth_Users_Roles_Authorization.md` Stage 7 table).
- `users` table linkage to Supabase Auth's identity, plus `user_organizations`/scope-assignment tables recording a user's role(s) and the branch/business-unit scope they apply to (per `docs/TAS.md` §24: "User → Role: Branch Manager → Scope: Abuja Branch").
- Default role seed data: Owner/Admin, Branch Manager, Cashier, Salesperson, Pharmacist, Waiter, Kitchen Staff (per `docs/PRD.md` §11), plus custom-role support (schema-level; the role-builder *UI* is Milestone 11's scope).
- Permission catalog seeded in `resource.action` format (per `docs/TAS.md` §25 / `docs/PRD.md` §12), e.g. `products.create`, `inventory.adjust`, `sales.create`, `reports.export`.
- Server-side authorization layer: a reusable guard (e.g., `requirePermission(resource.action, scope)`) used by every Server Action/Route Handler in every later milestone — the single place permission checks happen.
- First real RLS policies: scoping row access by organization/branch/business-unit membership, following the security-function pattern described in `docs/Supabase_RLS_and_Database_Authorization_Design.md`.
- Audit log write path: a shared `recordAuditEvent()` helper used by every mutation in every later milestone; first real events recorded here are auth-related (login, logout, failed login, employee/role changes made in this milestone's minimal admin path).
- Login throttling / basic brute-force protection.
- Frontend permission-aware primitives (a `usePermission()`/`<Can>`-style helper) — UI-level hiding is a UX nicety, never the security boundary (frontend checks are always backed by the server-side guard above).

## Out of Scope

- Custom-role builder UI, employee invite/deactivate screens (Milestone 11 — the *schema and enforcement* for custom roles exists here; the *management UI* does not).
- MFA, OAuth, biometrics — explicitly excluded from this project, not deferred.
- Subscription-expiry login lock (Milestone 13 — this milestone's login flow has a hook point for it, but subscription state doesn't exist yet).
- Any feature-domain RLS policies beyond the organizational-scope pattern itself (each later milestone authors its own table's policies using the pattern this milestone establishes).

## Functional Requirements

- A user can sign up, sign in, sign out, and reset their password via email/password only.
- On first Organization signup, an Owner/Admin user and role are created automatically with full permissions scoped to that Organization.
- A user's effective permissions are resolved from `User → Role(s) → Permissions`, with each role assignment carrying a scope (organization-wide, a specific branch, or a specific business unit).
- No authorization decision anywhere in the codebase checks a role's *name* directly (e.g., no `if (role === 'cashier')`) — only permission checks against the resolved permission set, per the "roles are configurations, not application logic" rule.
- Failed login attempts are throttled (e.g., exponential backoff or a lockout window after N failures) to mitigate brute-force attacks.
- Every sensitive action performed through this milestone's code paths (login, logout, failed login, role/permission assignment) produces an audit log entry sufch that who/what/when can be reconstructed.

## Technical Requirements

- Supabase Auth (`@supabase/ssr`) for session management across Next.js Server Components, Server Actions, and Route Handlers — cookies handled server-side, no JWT/session token ever exposed to client-side JavaScript beyond what Supabase's SSR pattern requires.
- The server-side authorization guard is implemented once, in a shared module, and imported everywhere permission checks are needed — never duplicated per-feature.
- RLS policies use a security-definer helper-function pattern (resolving the current user's organization/branch/business-unit scope from `auth.uid()`) rather than repeating inline subqueries in every policy, per `docs/Supabase_RLS_and_Database_Authorization_Design.md`.
- Defense-in-depth is explicit: Frontend (UX only) → Server Action/Route Handler authorization (mandatory) → Database RLS (mandatory second boundary) → Postgres constraints. No layer is treated as sufficient on its own.

## Database Changes

- Populate/finalize: `users`, `roles`, `permissions`, `role_permissions`, `user_roles` (scope columns: `organization_id`, `branch_id` nullable, `business_unit_id` nullable), `audit_logs` (finalize columns: `id`, `organization_id`, `user_id`, `action`, `resource_type`, `resource_id`, `metadata`, `ip_address`, `user_agent`, `created_at`, per `docs/TAS.md` §26).
- New: `login_attempts` (or equivalent) table/mechanism to support throttling.
- Seed: default role catalog and permission catalog.
- RLS enabled and policies authored on all tables from Milestone 02 plus this milestone's own new tables.

## API / Backend Changes

- Server Actions/Route Handlers: sign-up, sign-in, sign-out, password-reset request/confirm.
- Shared `requirePermission()` (or equivalent) authorization guard module.
- Shared `recordAuditEvent()` helper.
- Shared "current user context" resolver (user → organization → roles → permissions → scope) used across the app.

## Frontend Changes

- Minimal, unstyled-beyond-Milestone-01 sign-in / sign-up / forgot-password screens (visual polish arrives once Milestone 04's design system exists; functionally complete here).
- A basic authenticated shell (redirect unauthenticated users to sign-in; redirect authenticated users away from auth screens).
- `usePermission()`/`<Can>` frontend primitive for conditionally rendering UI based on the current user's resolved permissions.

## Security Requirements

- RLS is **mandatory** on every table (per `docs/Security _Architecture_And_Authorization.md` §68) — verified in this milestone by testing that a user cannot read/write rows outside their organization/branch/business-unit scope even via direct Supabase client calls that bypass application code.
- Server-side authorization is **mandatory** — every Server Action/Route Handler that mutates or reads sensitive data calls the shared guard; there is no code path where the frontend is trusted as the security boundary.
- Service-role key is never used from any client-reachable code path (only from trusted server contexts, e.g., webhook verification in later milestones) — this milestone's guard module is the reference implementation later milestones copy.
- Passwords handled entirely by Supabase Auth (never touched/stored by application code).
- Login throttling implemented to reduce brute-force risk.
- Audit log table is append-only: no `UPDATE`/`DELETE` grants on `audit_logs` for any application role, enforced at the database level.

## Testing Requirements

- Unit tests: permission-resolution logic (given roles/scopes, does the guard produce the correct allow/deny decision) — including edge cases like a user with two roles at different scopes.
- Integration tests: sign-up/sign-in/sign-out flows against a real (test) Supabase instance.
- Authorization tests: attempt cross-organization and cross-branch data access with a real authenticated session and confirm it is denied both at the Server Action layer and, independently, via RLS (a direct Supabase client query bypassing the app layer must still be denied).
- RLS tests: dedicated test suite exercising each policy authored in this milestone (own-org read allowed, other-org read denied, etc.) — this suite is the template every later milestone's own RLS tests follow.
- Security tests: login throttling triggers after the configured threshold; audit log entries are created for login/logout/failed-login and cannot be modified or deleted via the application role.

## CI/CD Requirements

- Extend the pipeline with the authorization/RLS test suite above, run against a disposable Supabase/Postgres instance seeded with test organizations/users/roles.
- Add secret checks confirming Supabase Auth environment variables are present for test runs without ever printing their values to logs.

## Observability

- Structured logging of authentication events (sign-in success/failure, sign-out) at the application layer, distinct from the audit log (audit log is the compliance record; application logs are for debugging).
- Failed-authorization attempts logged (without leaking sensitive data) to aid later security review (Milestone 15).

## Deliverables

- Working email/password authentication across the app.
- Populated Roles/Permissions schema with seed data.
- Shared, reusable server-side authorization guard and audit-log helper, documented for reuse by every later milestone.
- First working RLS policy set plus its dedicated test suite.
- Minimal but functional sign-in/sign-up/reset screens.

## Acceptance Criteria

- [ ] A new user can sign up, is assigned an Owner/Admin role scoped to a new Organization, and can sign in/out.
- [ ] Permission checks are resolved from Role → Permission → Scope, never from a hard-coded role name.
- [ ] A user cannot read or write data belonging to another organization, verified both through the app and via a direct database query under RLS.
- [ ] Every sign-in, sign-out, and failed login attempt produces an audit log entry.
- [ ] Audit log rows cannot be updated or deleted by the application's database role.
- [ ] Login throttling activates after repeated failed attempts.
- [ ] The RLS test suite and authorization test suite both pass in CI.

## Definition of Done

All acceptance criteria pass, the shared authorization guard and audit helper are documented (so later milestones use them rather than reinventing them), and a manual walk-through confirms a Cashier-scoped test user genuinely cannot perform an Owner-only action even by calling the Server Action directly.

## Implementation Notes

- Do not implement subscription-expiry locking here — stub the hook point (a place in the login flow where a future check can be inserted) but the actual check belongs to Milestone 13, since subscription state doesn't exist yet.
- Keep the permission catalog seeded with only the permissions needed through Milestone 05; each later milestone adds its own domain's permissions (e.g., `sales.create` arrives with Milestone 08) rather than pre-seeding permissions for features that don't exist yet.

## Risks

- If the authorization guard is skipped or inconsistently applied in even one later Server Action, that single omission becomes a real vulnerability — mitigate with a lint rule or code-review checklist item (reinforced again in Milestone 15's security audit) requiring every new Server Action to demonstrate a permission check or an explicit "intentionally public" comment.
- RLS policy bugs are easy to introduce and hard to notice without dedicated tests — the RLS test suite built here must be treated as load-bearing and extended by every later milestone, not left to rot.

## Future Considerations

- MFA/OAuth are explicitly excluded now but the schema (a single `users` row per Supabase Auth identity) does not preclude adding them later without a redesign, should the project owner revisit that decision.
