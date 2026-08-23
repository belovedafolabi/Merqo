-- Nullable completion flag, not a step tracker: which step an incomplete
-- onboarding is on is derived at read time from whether a Branch/Business
-- Unit/POS config already exist for the Organization (docs/milestones/
-- 05-business-structure-and-onboarding.md Implementation Notes: "keep the
-- onboarding wizard resumable... avoids a frustrating first-run experience
-- without requiring a complex saga/workflow engine"). This column only
-- answers "is onboarding done at all", which is what gates the
-- app/(app) <-> app/(onboarding) redirect (lib/business-structure/queries.ts).
alter table public.organizations
  add column onboarding_completed_at timestamptz;
