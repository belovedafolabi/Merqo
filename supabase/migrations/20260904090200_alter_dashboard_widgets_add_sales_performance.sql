-- Add the 'sales_performance' widget to the per-user dashboard whitelist.
--
-- 20260903090400 states the widget-id list twice on purpose — once in
-- lib/dashboard/widgets.ts, once as this CHECK — and tests/unit/dashboard/
-- widgets.test.ts fails the build if they drift. The new "Sales performance"
-- card (day / month-to-date / year-to-date / all-time figures on one card,
-- period switched client-side) needs its id allowed here too.
--
-- Drop-and-re-add rather than a second CHECK: one constraint of this name,
-- so a fresh `supabase db reset` and a migrated deployment converge on the
-- identical definition. No data migration — a user who had never added this
-- widget has no row for it, and "no row" already means "registry default"
-- (which is defaultEnabled: false).

alter table public.dashboard_widgets
  drop constraint dashboard_widgets_widget_id_check,
  add constraint dashboard_widgets_widget_id_check check (
    widget_id in (
      'sales_summary',
      'sales_overview',
      'sales_performance',
      'low_stock',
      'recent_products',
      'recent_sales',
      'top_products'
    )
  );
