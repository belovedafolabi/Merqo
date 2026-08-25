-- Discharges 20260824100000's own deferral: "No retention index is created
-- here, because nothing sweeps yet and an index nothing uses is cost without
-- benefit." run_subscription_daily_sweep() (20260825100700) now sweeps read
-- notifications older than 90 days daily — this index serves that DELETE's
-- WHERE clause.
create index notifications_read_retention_idx
  on public.notifications (created_at)
  where read_at is not null;
