import { DEFAULT_ROW_LIMIT } from '@/lib/reports/registry'
import type { StandardReportDef } from '@/lib/reports/catalog'
import type { ReportParameters } from '@/lib/reports/types'

/**
 * Report filters live in the URL, not in component state.
 *
 * That is a deliberate UX decision, not an implementation convenience: a
 * report someone has narrowed to one branch and one month is exactly the kind
 * of thing they want to bookmark, send to a colleague, or get back to with the
 * back button. State held in `useState` supports none of that, and a report
 * screen that forgets its filters on every navigation is the specific
 * complaint this avoids.
 *
 * It also means the export route and the print view can be plain links: they
 * receive the same query string the screen is showing, so what gets downloaded
 * or printed is by construction what the reader was looking at.
 */

export type ReportSearchParams = Record<string, string | string[] | undefined>

function firstValue(params: ReportSearchParams, key: string): string | undefined {
  const value = params[key]
  return Array.isArray(value) ? value[0] : value
}

/** The default window — a month back, which is what almost every report wants. */
export function defaultRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to.getTime() - 30 * 86_400_000)
  return { from: from.toISOString(), to: to.toISOString() }
}

/**
 * Builds report parameters from a URL query string.
 *
 * Note what this does NOT do: validate. `reportParametersSchema` is applied
 * inside lib/reports/queries.ts, on the server, against whatever this
 * produces — so a hand-edited URL is rejected there rather than trusted here.
 * This function's job is defaults and shape, and treating its output as
 * already-safe would put the only validation in the layer a caller controls.
 */
export function parseReportParams(
  organizationId: string,
  report: StandardReportDef | null,
  searchParams: ReportSearchParams,
): ReportParameters {
  const fallback = defaultRange()

  // A snapshot report (current stock, expiry) has no time axis, so a date
  // range would be a control that silently does nothing.
  const dateRanged = report?.dateRanged ?? true

  const rawLimit = Number(firstValue(searchParams, 'limit'))

  return {
    organizationId,
    branchId: firstValue(searchParams, 'branch') ?? null,
    businessUnitId: firstValue(searchParams, 'unit') ?? null,
    from: dateRanged ? (firstValue(searchParams, 'from') ?? fallback.from) : null,
    to: dateRanged ? (firstValue(searchParams, 'to') ?? fallback.to) : null,
    groupBy: firstValue(searchParams, 'group') ?? report?.groupings[0]?.value ?? null,
    limit: Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_ROW_LIMIT,
  }
}

/**
 * The inverse — parameters back to a query string, used to build the export
 * and print links from whatever the screen is currently showing.
 */
export function toQueryString(parameters: ReportParameters): string {
  const query = new URLSearchParams()

  if (parameters.branchId) query.set('branch', parameters.branchId)
  if (parameters.businessUnitId) query.set('unit', parameters.businessUnitId)
  if (parameters.from) query.set('from', parameters.from)
  if (parameters.to) query.set('to', parameters.to)
  if (parameters.groupBy) query.set('group', parameters.groupBy)
  if (parameters.limit !== DEFAULT_ROW_LIMIT) query.set('limit', String(parameters.limit))

  return query.toString()
}

/** `2026-08-24`, the value an `<input type="date">` expects. */
export function toDateInputValue(isoTimestamp: string | null): string {
  return isoTimestamp ? isoTimestamp.slice(0, 10) : ''
}

/**
 * A date input gives back a bare day. Converted to an instant at the *start*
 * of that day for `from`, and the start of the *following* day for `to` — the
 * report functions use a half-open `[from, to)` range, so an inclusive end
 * date has to become the following midnight or the last day's sales vanish.
 */
export function fromDateInputValue(value: string, edge: 'start' | 'end'): string | null {
  if (!value) return null

  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  if (edge === 'end') date.setDate(date.getDate() + 1)

  return date.toISOString()
}
