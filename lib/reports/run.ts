import { logger } from '@/lib/logger'
import type { ReportColumnDef } from '@/lib/reports/catalog'
import type {
  ReportCellValue,
  ReportColumn,
  ReportParameters,
  ReportResult,
} from '@/lib/reports/types'

/**
 * Assembly and instrumentation for every report result — the step between "the
 * database returned rows" and "a ReportResult exists".
 *
 * It exists so that column filtering, total computation, truncation detection
 * and timing happen once rather than in each of the fourteen query functions,
 * where they would be fourteen chances to forget one. Forgetting the
 * truncation flag in particular would be silent: the report would simply be
 * incomplete, and look exactly like a complete one.
 */

/** Milestone 10's Observability requirement — see `finishReport`. */
const SLOW_REPORT_MS = 1_000

/**
 * Drops columns the caller lacks the permission for, *and* the values under
 * them. Filtering only the column list would leave the numbers sitting in each
 * row object, serialised into the payload sent to the browser — visible to
 * anyone who opens the network tab. The row rebuild is the actual control.
 */
function applyColumnPermissions(
  columns: readonly ReportColumnDef[],
  rows: readonly Record<string, ReportCellValue>[],
  grantedPermissions: readonly string[],
): { columns: ReportColumn[]; rows: Record<string, ReportCellValue>[] } {
  const visible = columns.filter(
    (column) => !column.permission || grantedPermissions.includes(column.permission),
  )

  return {
    columns: visible.map(({ key, header, type }) => ({ key, header, type })),
    rows: rows.map((row) => {
      const filtered: Record<string, ReportCellValue> = {}
      for (const column of visible) filtered[column.key] = row[column.key] ?? null
      return filtered
    }),
  }
}

/**
 * Column totals, for the columns whose definition asks for one. Non-numeric
 * values contribute nothing rather than coercing to NaN and poisoning the
 * whole total — one null date in a column must not turn a valid sum into
 * "NaN" in an exported spreadsheet.
 */
function computeTotals(
  columns: readonly ReportColumnDef[],
  rows: readonly Record<string, ReportCellValue>[],
  visibleKeys: ReadonlySet<string>,
): Record<string, number> | null {
  const totalled = columns.filter((column) => column.total && visibleKeys.has(column.key))
  if (totalled.length === 0) return null

  const totals: Record<string, number> = {}
  for (const column of totalled) {
    const sum = rows.reduce((accumulator, row) => {
      const value = row[column.key]
      return accumulator + (typeof value === 'number' && Number.isFinite(value) ? value : 0)
    }, 0)
    totals[column.key] = Math.round((sum + Number.EPSILON) * 100) / 100
  }

  return totals
}

export interface FinishReportInput {
  id: string
  title: string
  columns: readonly ReportColumnDef[]
  rows: readonly Record<string, ReportCellValue>[]
  parameters: ReportParameters
  grantedPermissions: readonly string[]
  startedAt: number
}

/**
 * Turns raw rows into a `ReportResult` and records how long it took.
 *
 * The timing log is Milestone 10's Observability requirement — "structured
 * logging on report/export execution time, to catch slow queries early rather
 * than discovering them under real production data volume". It logs every run
 * at info and escalates past a second to warn, so a query that degrades as a
 * client's data grows shows up in Vercel's log filter as a warning rather than
 * having to be noticed among thousands of ordinary lines.
 */
export function finishReport(input: FinishReportInput): ReportResult {
  const { columns, rows } = applyColumnPermissions(
    input.columns,
    input.rows,
    input.grantedPermissions,
  )

  const durationMs = Math.round(performance.now() - input.startedAt)
  const truncated = input.rows.length >= input.parameters.limit

  const context = {
    reportId: input.id,
    durationMs,
    rowCount: input.rows.length,
    branchId: input.parameters.branchId,
    businessUnitId: input.parameters.businessUnitId,
    groupBy: input.parameters.groupBy ?? null,
    truncated,
  }

  if (durationMs >= SLOW_REPORT_MS) {
    logger.warn('report.executed.slow', context)
  } else {
    logger.info('report.executed', context)
  }

  return {
    id: input.id,
    title: input.title,
    generatedAt: new Date().toISOString(),
    parameters: input.parameters,
    columns,
    rows,
    totals: computeTotals(input.columns, rows, new Set(columns.map((column) => column.key))),
    // A result that exactly fills its limit is *probably* truncated and might
    // merely be an exact fit. Reporting the ambiguous case as truncated is the
    // safe direction to be wrong in: an unnecessary "showing the first N rows"
    // notice costs a reader nothing, while a missing one costs them the belief
    // that they saw everything.
    truncated,
  }
}

/**
 * Numeric coercion for values arriving from PostgREST, which returns Postgres
 * `numeric` as a string to avoid the precision loss a JS number would incur.
 * Every query function funnels through this rather than sprinkling `Number()`,
 * so a null stays null instead of silently becoming 0 — the difference between
 * "no threshold set" and "threshold of zero".
 */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function toText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}
