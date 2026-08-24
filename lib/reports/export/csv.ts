import type { ReportCellValue, ReportColumn, ReportResult } from '@/lib/reports/types'

/**
 * CSV export, hand-written.
 *
 * No dependency, deliberately. RFC 4180 is about thirty lines of rules, all of
 * them implemented below, and the two things a library would add — a parser we
 * do not need, and a configuration surface we do not want — are not worth a
 * package on the critical path of a data-export feature.
 *
 * Two details that a naive implementation gets wrong, both of which produce
 * files that look fine until someone opens them:
 *
 *   THE BOM. Excel on Windows decodes a CSV as the system codepage unless the
 *   file starts with a UTF-8 byte-order mark. Without it, every ₦ in a
 *   Nigerian POS export renders as mojibake — which is most of the columns.
 *
 *   FORMULA INJECTION. A cell whose text begins with =, +, -, @, tab or CR is
 *   interpreted by Excel and Google Sheets as a formula, not as text. A
 *   customer named `=cmd|'/c calc'!A1`, or a discount reason typed by an
 *   attacker, becomes executable content in the reader's spreadsheet — the
 *   classic CSV injection. Every such cell is prefixed with an apostrophe,
 *   which spreadsheets strip on display and treat as "this is text".
 *   Milestone 10 makes export a separately-permissioned, higher-risk surface;
 *   this is part of why.
 */

const BOM = '﻿'
/** RFC 4180 specifies CRLF, and Excel is stricter about it than most readers. */
const LINE_BREAK = '\r\n'
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r']

function neutralizeFormula(value: string): string {
  return FORMULA_TRIGGERS.some((trigger) => value.startsWith(trigger)) ? `'${value}` : value
}

function escapeCell(value: ReportCellValue, column: ReportColumn): string {
  if (value === null || value === undefined) return ''

  // Numbers are written bare so the spreadsheet reads them as numbers. They
  // cannot trigger the formula rule (a leading '-' on a negative number is
  // arithmetic, which is what we want), and quoting them would turn every
  // figure into text and break every downstream SUM.
  if (typeof value === 'number') {
    return column.type === 'money' ? value.toFixed(2) : String(value)
  }

  const text = neutralizeFormula(String(value))

  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/**
 * Renders a `ReportResult` — the same object the screen renders — as CSV text.
 * Reading from the shared result rather than re-querying is what guarantees the
 * file and the screen agree; see lib/reports/types.ts.
 */
export function toCsv(result: ReportResult): string {
  const lines: string[] = []

  lines.push(result.columns.map((column) => escapeCell(column.header, column)).join(','))

  for (const row of result.rows) {
    lines.push(
      result.columns.map((column) => escapeCell(row[column.key] ?? null, column)).join(','),
    )
  }

  if (result.totals) {
    lines.push(
      result.columns
        .map((column, index) => {
          if (index === 0) return escapeCell('Total', column)
          const total = result.totals?.[column.key]
          // Columns without a declared total leave the cell empty rather than
          // printing 0 — a blank says "not applicable", a zero says "the sum
          // is zero", and they are different claims.
          return total === undefined ? '' : escapeCell(total, column)
        })
        .join(','),
    )
  }

  return BOM + lines.join(LINE_BREAK) + LINE_BREAK
}
