# Milestone 16 — Production Readiness & Launch

## Status

Planned

## Objective

Finalize performance and database optimization, monitoring/backup/disaster-recovery, per-client deployment automation (given the "independent deployment per client" model), and a launch checklist — the last milestone before a real client's production instance goes live.

## Why This Milestone Exists

`docs/TAS.md` Phase 12 and `docs/TAS.md` §49 both flag production hardening and the independent-per-client deployment challenge ("how do we update 20 independently deployed client instances?") as distinct, deliberate concerns that shouldn't be solved ad hoc at the moment of the first real client launch. This milestone exists to answer that question concretely, on top of a system that Milestone 15 has already hardened and verified.

## Dependencies

- Milestone 15 (security/QA hardening complete on the assembled system).

## Scope

- Performance review and optimization: database query performance under realistic data volume (building on Milestone 10's report-performance groundwork), Next.js build/runtime performance, identifying and fixing any remaining slow paths.
- Database optimization: index review across the full schema, `EXPLAIN ANALYZE` review of the highest-traffic queries (product search, barcode lookup, sale creation, reporting).
- Monitoring and backup, using free/native mechanisms per the project's cost constraint (per `docs/PRD.md` §45): Supabase's built-in database monitoring and point-in-time-recovery/backup features, Vercel's built-in deployment/runtime monitoring, uptime monitoring via a free tier service (e.g., a free uptime-ping service) — no paid APM/observability platform required for MVP.
- Backup/recovery plan: documented, tested restore procedure using Supabase's backup capabilities.
- Per-client deployment automation: a documented, repeatable process (and, where feasible, scripted/templated) for provisioning a new client's independent Supabase project + Vercel deployment + environment configuration, given the codebase stays identical across clients and only configuration/environment differs (per `docs/TAS.md` §44).
- Database migration rollout process for independently deployed clients: confirming migrations can be applied repeatably and safely across multiple independent client databases (per `docs/TAS.md` §48–49).
- Launch checklist: a concrete, checkable document covering everything that must be true before a real client goes live.

## Out of Scope

- Building a full multi-client fleet-management dashboard (that would only be in scope if `DECISIONS_AND_CONFLICTS.md` §5's multi-tenant Super Admin question is resolved toward "yes, we need a real cross-client console," which is explicitly not assumed here).
- Any new feature work — this milestone is entirely about operational readiness of what already exists.

## Functional Requirements

- The highest-traffic queries (barcode lookup, sale creation, product search, standard reports) perform acceptably against a realistic data volume, verified with actual query analysis, not assumption.
- A documented, tested process exists for provisioning a new independent client deployment (new Supabase project, new Vercel deployment, environment variables set, migrations applied, seed data loaded) that another engineer (or the same one, six months later) could follow without guessing.
- A database backup exists and a restore has been tested at least once against a non-production copy, proving the recovery procedure actually works.
- Uptime/error monitoring is in place and would surface a production outage promptly.
- A launch checklist exists and every item is checked before the first real client goes live.

## Technical Requirements

- Query optimization work is evidence-based: use `EXPLAIN ANALYZE` (or Supabase's query performance tooling) to identify real bottlenecks rather than optimizing speculatively.
- Deployment automation is scripted where it reduces real risk of manual error (e.g., a setup script that runs migrations and seeds against a newly created Supabase project) but does not over-engineer a full self-service provisioning platform for a small number of clients — match the automation investment to actual expected client volume.
- Monitoring stays within the $0–$10/month budget: Supabase's and Vercel's own built-in dashboards are the primary tools; a free-tier uptime checker is acceptable; no paid APM (Datadog, New Relic, Sentry's paid tiers, etc.) is required for MVP — if error tracking beyond console/Vercel logs is judged necessary, evaluate a tool with a genuinely free tier sufficient for this scale before defaulting to a paid one.

## Database Changes

None expected as new domain tables — this milestone is optimization (indexes, query tuning) and operational tooling (backup/restore, per-client provisioning), not new schema.

## API / Backend Changes

None expected beyond any optimization refactors surfaced by the performance review (e.g., an N+1 query fixed, a missing index added) — no new business functionality.

## Frontend Changes

None expected beyond any performance-driven refactor (e.g., code-splitting, lazy-loading a heavy report view) surfaced by the performance review.

## Security Requirements

- Backup/restore procedure itself does not introduce a new security gap (e.g., a backup file containing production secrets/PII stored insecurely) — reviewed explicitly.
- Per-client deployment provisioning process does not reuse secrets/keys across clients — every independent deployment gets its own, freshly generated credentials, consistent with the "independent deployment per client" isolation model.

## Testing Requirements

- Performance regression tests: the CI performance benchmark introduced in Milestone 10/14 is extended/confirmed to catch regressions at this stage's realistic data volume.
- Backup/restore test: an actual restore is performed against a test/staging environment and verified to produce a correct, working database.
- Deployment-process test: the documented per-client provisioning process is executed at least once, end-to-end, against a genuinely new Supabase project/Vercel deployment (not just read through), to prove it actually works as documented.

## CI/CD Requirements

- Confirm the full pipeline (from Milestone 01 through Milestone 15's additions) runs reliably and within a reasonable time budget; trim/parallelize if it has become a bottleneck.
- Add a deployment-verification step (smoke test against the deployed environment post-deploy) if not already present.

## Observability

- Final observability setup: Supabase dashboard + Vercel dashboard + free-tier uptime monitoring, documented in `README.md` (or an ops doc) so anyone operating the system in production knows where to look when something goes wrong.
- Confirm structured logging established across every earlier milestone is consistent and actually useful for diagnosing a real production incident (spot-checked, not just assumed).

## Deliverables

- Performance/database optimization completed and verified against realistic data volume.
- Working, tested backup/restore procedure.
- Documented (and where sensible, scripted) per-client deployment provisioning process.
- Free-tier monitoring/uptime setup.
- Launch checklist, fully checked, for the first real client deployment.

## Acceptance Criteria

- [ ] Highest-traffic queries perform acceptably under realistic data volume, verified with query analysis.
- [ ] A backup has been taken and a restore has been successfully tested against a non-production environment.
- [ ] A new independent client deployment can be provisioned by following the documented process, verified by actually doing it once.
- [ ] Free-tier monitoring/uptime checking is live and would surface a real outage.
- [ ] The launch checklist is complete with no open items.
- [ ] Total recurring infrastructure cost for a single client deployment is confirmed to be within the $0–$10/month target.

## Definition of Done

All acceptance criteria pass, the first real (or realistic staging) client deployment has been provisioned end-to-end using the documented process, and the launch checklist is fully signed off.

## Implementation Notes

- Keep per-client provisioning automation proportional to actual near-term client count — a handful of documented, semi-scripted steps is appropriate; a full self-service provisioning platform is not justified until client volume actually demands it (consistent with the project's anti-over-engineering principle throughout).
- Revisit `docs/TAS.md` §45's free-tier limits explicitly at this stage (serverless function duration/concurrency limits, Supabase connection/row limits) since this is the point where those limits stop being theoretical and start being operationally relevant.

## Risks

- Untested backup/restore procedures are a common latent risk — the requirement above (actually perform a restore, not just configure backups) exists specifically to catch this before it matters in a real incident.
- Free-tier limits (Vercel function duration, Supabase connection pooling) could become a real constraint under genuine production load — this milestone's performance review is the place to surface that risk concretely, with a documented fallback plan (e.g., which specific paid upgrade, if any, would be needed and at what usage threshold) even if no paid upgrade is made yet.

## Future Considerations

- If/when client volume grows enough to make per-client manual provisioning genuinely burdensome, revisit deployment automation investment then — not preemptively now.
- If `DECISIONS_AND_CONFLICTS.md` §5 is resolved toward a genuine multi-tenant Super Admin console, that becomes a new, separate roadmap addition built on top of a proven, individually-solid per-client deployment model established here.
