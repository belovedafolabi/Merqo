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
 *
 * PRESENTATION. The data sheet still starts at row 1 (headers) so it stays a
 * clean rectangle a pivot table or `xlsx.load` can read without offset maths.
 * The styling — a filled header band, an autofilter, zebra rows, right-aligned
 * figures, data-fitted column widths, a ruled totals row — is all cosmetic on
 * top of that. The report's title, date range and generation time live on a
 * separate "Report info" sheet so they never push the table down.
 */

/** Nigerian Naira, thousands-separated, negatives in parentheses. */
const MONEY_FORMAT = '"₦"#,##0.00;("₦"#,##0.00)'
const QUANTITY_FORMAT = '#,##0.###'
const NUMBER_FORMAT = '#,##0'
const DATE_FORMAT = 'yyyy-mm-dd'
const DATETIME_FORMAT = 'yyyy-mm-dd hh:mm'

const HEADER_FILL = 'FF1F2937' // slate-800 — neutral, prints legibly
const ZEBRA_FILL = 'FFF3F4F6' // gray-100
const TOTALS_FILL = 'FFE5E7EB' // gray-200

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

function alignmentFor(type: ReportColumnType): 'left' | 'right' | 'center' {
  if (type === 'money' || type === 'quantity' || type === 'number') return 'right'
  if (type === 'date' || type === 'datetime') return 'center'
  return 'left'
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

/** Column width from the widest of the header and the rendered cells, clamped. */
function widthFor(header: string, values: unknown[]): number {
  const longest = values.reduce<number>((max, value) => {
    if (value === null || value === undefined) return max
    const text = value instanceof Date ? value.toISOString().slice(0, 16) : String(value)
    return Math.max(max, text.length)
  }, header.length)
  return Math.max(12, Math.min(48, longest + 4))
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
    { views: [{ state: 'frozen', ySplit: 1 }] },
  )

  sheet.columns = result.columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: widthFor(
      column.header,
      result.rows.map((row) => cellValue(row[column.key], column.type)),
    ),
    style: {
      numFmt: numberFormatFor(column.type),
      alignment: { horizontal: alignmentFor(column.type), vertical: 'middle' },
    },
  }))

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' }
  headerRow.height = 20

  for (const [index, row] of result.rows.entries()) {
    const added = sheet.addRow(
      Object.fromEntries(
        result.columns.map((column) => [column.key, cellValue(row[column.key], column.type)]),
      ),
    )
    // Zebra striping — every other data row gets a faint fill so a wide table
    // stays readable across the page.
    if (index % 2 === 1) {
      added.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_FILL } }
    }
  }

  // A filter on every column — the first thing anyone does with an exported
  // report is sort or filter it.
  const lastColumn = sheet.getColumn(result.columns.length).letter
  sheet.autoFilter = { from: 'A1', to: `${lastColumn}1` }

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
    totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTALS_FILL } }
    totalsRow.eachCell((cell) => {
      cell.border = { top: { style: 'thin' }, bottom: { style: 'double' } }
    })
  }

  // Metadata on its own sheet so it never shifts the data grid. Deliberately
  // second, so the report opens on the data.
  const info = workbook.addWorksheet('Report info')
  info.columns = [{ width: 20 }, { width: 60 }]
  const infoRows: [string, string][] = [
    ['Report', result.title],
    [
      'Date range',
      result.parameters.from || result.parameters.to
        ? `${(result.parameters.from ?? '—').slice(0, 10)} to ${(result.parameters.to ?? '—').slice(0, 10)}`
        : 'All time',
    ],
    ['Generated', new Date(result.generatedAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'],
    ['Rows', String(result.rows.length)],
    ...(result.truncated ? ([['Note', 'Row limit reached — this export is truncated.']] as [string, string][]) : []),
  ]
  for (const [label, value] of infoRows) {
    const r = info.addRow([label, value])
    r.getCell(1).font = { bold: true }
  }

  // exceljs returns its own ArrayBuffer-ish type; Buffer.from normalises it to
  // what a Next Route Handler's Response can take directly.
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
