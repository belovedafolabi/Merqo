-- Supabase's platform bootstrap grants TRUNCATE, REFERENCES, and TRIGGER to
-- `anon` and `authenticated` on every table in `public`, via a default ACL
-- set for the `postgres` role in this schema (see `pg_default_acl`) — every
-- table this project's migrations create inherits these three privileges
-- regardless of the narrower `grant select [...]` statements in this
-- project's own alter_tables_grant_authenticated_*.sql migrations.
--
-- REFERENCES and TRIGGER are inert here — PostgREST never issues DDL, so
-- `authenticated`/`anon` have no path to add a foreign key or a trigger
-- through the application. TRUNCATE is the one that matters: unlike DELETE
-- (which every RLS policy in this schema scopes to a caller's own
-- organization/branch), TRUNCATE is not filtered by RLS at all — Postgres
-- checks only the table-level privilege before wiping every row, in every
-- tenant, in one statement. It happens to be unreachable today (PostgREST
-- exposes no verb that maps to TRUNCATE, and `anon`/`authenticated` are
-- only reachable via PostgREST), but that safety is incidental to
-- PostgREST's API surface, not to anything actually withheld at the
-- database level — exactly the gap this project's append-only tables
-- (`sales`, `payments`, `refunds`, `inventory_movements`, `audit_logs`,
-- `store_credit_ledger`, `store_credit_accounts`, `layaway_payments`, and
-- others) already rely on withheld grants — not RLS — to close.
--
-- Revoked schema-wide rather than table-by-table: every table in `public`
-- is reachable only through PostgREST, so none of them has a legitimate
-- reason for `anon`/`authenticated` to hold TRUNCATE, REFERENCES, or
-- TRIGGER. Narrowing only the append-only tables would leave the same gap
-- open on `products`, `customers`, `branches`, and every other mutable
-- table — where an RLS-unfiltered TRUNCATE is, if anything, more damaging,
-- since it erases every other tenant's rows too, not just the caller's own.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Tables created by later migrations inherit the same three privileges
-- from the same default ACL (every table in this project is owned by the
-- `postgres` role — see pg_tables.tableowner) unless it is corrected here
-- too; without this, the very next `create table` migration would
-- silently re-open the exact gap this migration just closed.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
