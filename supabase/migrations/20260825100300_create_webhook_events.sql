-- Paystack webhook delivery ledger, for idempotency
-- (docs/milestones/13-subscription-billing-and-platform-admin.md Database
-- Changes: "webhook_events (or equivalent) table recording processed
-- Paystack event IDs for idempotency"; Scope: "a duplicate/retried webhook
-- delivery must not double-extend a subscription").
--
-- Paystack does not send a stable per-DELIVERY identifier — `data.id` is the
-- underlying transaction id and repeats across every event Paystack ever
-- fires for that transaction. `event_id` here is therefore composed by the
-- caller (app/api/webhooks/paystack/route.ts) as
-- `event_type || ':' || coalesce(data.id::text, sha256(raw_body))`, giving a
-- stable key per (event type, transaction) pair, with a body-hash fallback
-- for the rare payload that carries neither.
--
-- This table is the CHEAP, second idempotency guard. The load-bearing one is
-- the PENDING -> SUCCESS conditional UPDATE on subscription_payments
-- (20260825100200) — see that file's comment. This one exists so a
-- known-duplicate delivery short-circuits before even reaching settlement
-- logic, and so Observability ("structured logging on webhook processing")
-- has a queryable record independent of the payment row.
--
-- Only RECEIVED is non-terminal and re-claimable. A webhook that fails
-- between "signature verified" and "settlement decided" (e.g. a transient
-- network error calling Paystack's verify API) must be retried by Paystack's
-- own redelivery, not permanently treated as already-seen — see
-- app/api/webhooks/paystack/route.ts's 500-vs-200 response-code split.
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paystack',
  event_id text not null,
  event_type text not null,
  reference text,
  status text not null default 'RECEIVED'
    check (status in ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED')),
  attempts integer not null default 1,
  payload jsonb not null,
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,

  unique (provider, event_id)
);

comment on table public.webhook_events is
  'The cheap, second idempotency guard for Paystack webhook delivery. The '
  'load-bearing guard is the conditional UPDATE on subscription_payments — '
  'see that table''s comment. Written only by service_role: no insert '
  'policy, no insert grant to authenticated/anon (this table has no user '
  'session behind it at all).';

create index webhook_events_status_idx
  on public.webhook_events (status, received_at desc);

alter table public.webhook_events enable row level security;
