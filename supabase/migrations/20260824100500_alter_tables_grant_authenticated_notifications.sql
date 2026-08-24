-- Table-level privileges for Milestone 12. RLS decides WHICH rows; these
-- grants decide whether the verb is available at all — both layers are
-- required, per the same rule stated in 20260824091200.

-- Column-restricted UPDATE: a recipient may only flip read_at. Restricting
-- to that one column (rather than granting UPDATE on the whole row) means a
-- user cannot rewrite their own notification's title or href — which
-- matters because href is a link the recipient is expected to click.
grant select, update (read_at) on public.notifications to authenticated;

-- Deliberately absent: INSERT and DELETE on notifications. Every row is
-- written by a SECURITY DEFINER notify_*() function
-- (20260824100400_create_notification_functions.sql), which bypasses this
-- grant entirely by design; adding INSERT here would only open a second,
-- unauthorized door onto a table that must have exactly one way in. There is
-- no delete policy either (20260824100100) — retention is Milestone 13's
-- scheduled sweep, not a user-initiated delete.

grant select, insert, update on public.notification_preferences to authenticated;

-- No DELETE on notification_preferences: reverting to a category's default
-- is done by writing both booleans back to true, not by removing the row —
-- see 20260824100300's closing comment.
