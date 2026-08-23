import type { ReportColumnType, ReportResult } from '@/lib/reports/types'

/**
 * Excel export.
 *
 * `exceljs` is imported dynamically, inside the function, rather than at module
 * scope. That is not a performance tweak — it is what keeps a ~1MB
 * spreadsheet-writing library out of any client bundle that happens to import
 * something else from this directory. A static import here would be pulled in
 * by Next's bundler wherever the module graph reaches it, and the failure would
 * be invisible: a working feature with a much heavier page.
 *
 * Formats are derived from `ReportColumn.type`, the same field that drives the
 * on-screen table, so a money column is a money column in both places. Writing
 * pre-formatted *strings* into the cells instead would be the easy path and the
 * wrong one: the recipient could not sum a column, which is most of the reason
 * someone asks for Excel rather than a PDF in the first place.
 */

/** Nigerian Naira, thousands-separated, negatives in parentheses. */
const MONEY_FORMAT = '#,##0.00;(#,##0.00)'
const QUANTITY_FORMAT = '#,##0.###'
const NUMBER_FORMAT = '#,##0'
const DATE_FORMAT = 'yyyy-mm-dd'
const DATETIME_FORMAT = 'yyyy-mm-dd hh:mm'

function numberFormatFor(type: ReportColumnType): string | undefined {
  switch (type) {
    case 'money':
      return MONEY_FORMAT
    case 'quantity':
      return QUANTITY_FORMAT
    case 'number':
      return NUMBER_FORMAT
    case 'date':
      return DATE_FORMAT
    case 'datetime':
      return DATETIME_FORMAT
    default:
      return undefined
  }
}

/**
 * Date columns arrive as ISO strings from PostgREST. Converted to real Date
 * objects so Excel stores them as dates — an ISO string in a date-formatted
 * cell displays as left-aligned text and sorts alphabetically, which puts
 * 2026-1-9 after 2026-10-1.
 */
function cellValue(value: unknown, type: ReportColumnType): unknown {
  if (value === null || value === undefined) return null

  if ((type === 'date' || type === 'datetime') && typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? value : parsed
  }

  return value
}

export async function toWorkbookBuffer(result: ReportResult): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Merqo'
  workbook.created = new Date(result.generatedAt)

  // Excel rejects sheet names over 31 characters and those containing
  // : \ / ? * [ ], and a custom report's title is user-typed.
  const sheet = workbook.addWorksheet(
    result.title.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Report',
  )

  sheet.columns = result.columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: Math.max(12, Math.min(40, column.header.length + 6)),
    style: { numFmt: numberFormatFor(column.type) },
  }))

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  // Frozen so the headers stay visible while scrolling a long report — the
  // single thing that makes a 1,000-row export readable.
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  for (const row of result.rows) {
    sheet.addRow(
      Object.fromEntries(
        result.columns.map((column) => [column.key, cellValue(row[column.key], column.type)]),
      ),
    )
  }

  if (result.totals) {
    const totalsRow = sheet.addRow(
      Object.fromEntries(
        result.columns.map((column, index) => [
          column.key,
          index === 0 ? 'Total' : (result.totals?.[column.key] ?? null),
        ]),
      ),
    )
    totalsRow.font = { bold: true }
    totalsRow.border = { top: { style: 'thin' } }
  }

  // exceljs returns its own ArrayBuffer-ish type; Buffer.from normalises it to
  // what a Next Route Handler's Response can take directly.
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
