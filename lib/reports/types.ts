/**
 * The one shape every report — standard or custom — produces, and the one
 * shape every consumer of a report reads.
 *
 * Milestone 10's Technical Requirements ask for CSV, Excel and PDF export of
 * a report. The obvious way to build that is three functions that each
 * re-query and re-format; the failure mode is equally obvious, and it is the
 * one users actually notice: the spreadsheet disagrees with the screen. This
 * type is the structural fix. `lib/reports/queries.ts` produces a
 * `ReportResult`, and the table view, the print page, the CSV writer and the
 * Excel writer all consume that same in-memory object. There is no second
 * data path for any of them to drift down.
 *
 * `columns` travels with `rows` for the same reason: an exporter that had to
 * infer headers and number formatting from the data would guess differently
 * than the screen does. Formatting is a property of the report's definition,
 * declared once by whoever wrote the query.
 */

export type ReportCellValue = string | number | null

export type ReportColumnType = 'text' | 'number' | 'money' | 'quantity' | 'date' | 'datetime'

export interface ReportColumn {
  /** Matches the key used in each row object. */
  key: string
  header: string
  type: ReportColumnType
}

export interface ReportParameters {
  organizationId: string
  branchId: string | null
  businessUnitId: string | null
  /** ISO timestamp, inclusive. Null means unbounded. */
  from: string | null
  /** ISO timestamp, exclusive. Null means unbounded. */
  to: string | null
  groupBy?: string | null
  limit: number
}

export interface ReportResult {
  /** Stable id from the catalog (lib/reports/catalog.ts), e.g. 'sales-by-scope'. */
  id: string
  title: string
  /** ISO timestamp of when this result was computed — printed on exports so a saved file says how old it is. */
  generatedAt: string
  parameters: ReportParameters
  columns: ReportColumn[]
  rows: Record<string, ReportCellValue>[]
  /**
   * Column-key -> total, for the columns where a total is meaningful. Null
   * when the report has none (a stock listing has no meaningful "total
   * threshold"). Computed once here rather than by each consumer, so the
   * screen's footer row and the CSV's last line are the same numbers.
   */
  totals: Record<string, number> | null
  /**
   * True when the row cap was hit and the result is therefore incomplete.
   * Surfaced deliberately rather than swallowed: a silently truncated report
   * is a wrong report, and the reader has no way to tell without being told.
   */
  truncated: boolean
}
