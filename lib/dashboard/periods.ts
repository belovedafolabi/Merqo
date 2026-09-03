/**
 * Calendar windows for the dashboard's sales figures.
 *
 * WHY THIS EXISTS. The Overview's summary card was hard-wired to the trailing
 * 14 days (app/(app)/dashboard/page.tsx) while its label read "Sales today" —
 * so the headline number was never today's. And `dashboard_sales_series` day
 * buckets on the server session's clock (UTC), which draws a Lagos shop's
 * "Monday" as ~01:00 Mon → ~01:00 Tue. Both come down to: dashboard "days"
 * must be the business's local calendar days, not the server's.
 *
 * WHY A FIXED ZONE. This platform ships one deployment per client and there is
 * no organization timezone column; every locale string in the app is already
 * `en-NG`. Africa/Lagos is UTC+01:00 permanently — no DST, no historical
 * changes — so a local calendar day starts exactly one hour before UTC
 * midnight and we can compute the boundary instants with plain arithmetic
 * rather than pulling in a timezone library. If a client outside WAT is ever
 * onboarded, this constant (and a real per-org setting) is the single place to
 * revisit.
 */
export const DASHBOARD_TIME_ZONE = 'Africa/Lagos'

/** Africa/Lagos is a fixed UTC+01:00 with no daylight saving, ever. */
const LAGOS_OFFSET_MINUTES = 60

export type DashboardPeriod = 'today' | 'month' | 'year' | 'all'

export interface DashboardWindow {
  from: Date
  to: Date
}

/** The Y/M/D of an instant as seen on the Lagos wall clock. */
function lagosYmd(at: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DASHBOARD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

/** The UTC instant of local midnight on a given Lagos calendar date. */
function lagosMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - LAGOS_OFFSET_MINUTES * 60_000)
}

/**
 * The [from, to) window for a named period, `to` being "now". `all` starts far
 * enough back to predate any real sale (the platform's first migration is
 * dated 2026); the SQL functions clamp the series length regardless.
 */
export function dashboardWindow(period: DashboardPeriod, now: Date = new Date()): DashboardWindow {
  const { year, month, day } = lagosYmd(now)
  switch (period) {
    case 'today':
      return { from: lagosMidnight(year, month, day), to: now }
    case 'month':
      return { from: lagosMidnight(year, month, 1), to: now }
    case 'year':
      return { from: lagosMidnight(year, 1, 1), to: now }
    case 'all':
      return { from: new Date('2000-01-01T00:00:00Z'), to: now }
  }
}

/** Trailing N local days ending now — the Overview trend chart's range. */
export function trailingDays(days: number, now: Date = new Date()): DashboardWindow {
  const { year, month, day } = lagosYmd(now)
  const startOfToday = lagosMidnight(year, month, day)
  return { from: new Date(startOfToday.getTime() - (days - 1) * 86_400_000), to: now }
}
