import { describe, expect, it } from 'vitest'

import { toCsv } from '@/lib/reports/export/csv'
import { reportFilename } from '@/lib/reports/export/filename'
import { toWorkbookBuffer } from '@/lib/reports/export/xlsx'
import type { ReportResult } from '@/lib/reports/types'

/**
 * Milestone 10's Testing Requirements: "generated CSV/Excel/PDF files contain
 * the expected data for a known report configuration".
 *
 * The Excel case is a genuine round trip — build the workbook, read it back
 * with the same library, assert the values. Asserting on the buffer's length
 * or that it starts with 'PK' would pass for any zip file at all.
 *
 * PDF has no test here because there is no PDF *generation* code to test: the
 * print route renders HTML and the browser produces the PDF, which is the
 * decision recorded in this milestone's plan. tests/e2e/reports.spec.ts covers
 * that the print view renders.
 */

function result(overrides: Partial<ReportResult> = {}): ReportResult {
  return {
    id: 'sales-summary',
    title: 'Sales summary',
    generatedAt: '2026-08-24T10:30:00.000Z',
    parameters: {
      organizationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      branchId: null,
      businessUnitId: null,
      from: null,
      to: null,
      limit: 100,
    },
    columns: [
      { key: 'group_label', header: 'Group', type: 'text' },
      { key: 'sale_count', header: 'Sales', type: 'number' },
      { key: 'net_sales', header: 'Net sales', type: 'money' },
    ],
    rows: [
      { group_label: '2026-08-01', sale_count: 3, net_sales: 12_500.5 },
      { group_label: '2026-08-02', sale_count: 1, net_sales: 4_000 },
    ],
    totals: { sale_count: 4, net_sales: 16_500.5 },
    truncated: false,
    ...overrides,
  }
}

describe('CSV', () => {
  it('writes a header row, the data, and a totals row', () => {
    const lines = toCsv(result()).split('\r\n')

    expect(lines[0]).toBe('﻿Group,Sales,Net sales')
    expect(lines[1]).toBe('2026-08-01,3,12500.50')
    expect(lines[2]).toBe('2026-08-02,1,4000.00')
    expect(lines[3]).toBe('Total,4,16500.50')
  })

  it('starts with a UTF-8 BOM so Excel renders ₦ correctly', () => {
    // Without this, every currency symbol in a Nigerian POS export becomes
    // mojibake when the file is double-clicked on Windows.
    expect(toCsv(result()).codePointAt(0)).toBe(0xfeff)
  })

  it('uses CRLF line endings, per RFC 4180', () => {
    const csv = toCsv(result())
    expect(csv).toContain('\r\n')
    expect(csv.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('quotes cells containing commas, quotes or newlines', () => {
    const csv = toCsv(
      result({
        rows: [
          { group_label: 'Lagos, Ikeja', sale_count: 1, net_sales: 100 },
          { group_label: 'He said "hi"', sale_count: 1, net_sales: 100 },
          { group_label: 'Line one\nLine two', sale_count: 1, net_sales: 100 },
        ],
      }),
    )

    expect(csv).toContain('"Lagos, Ikeja"')
    expect(csv).toContain('"He said ""hi"""')
    expect(csv).toContain('"Line one\nLine two"')
  })

  it('neutralises formula injection', () => {
    // The reason export is a separately-permissioned surface. A cell beginning
    // =, +, -, @ or a control character is executed by Excel and Google Sheets.
    const csv = toCsv(
      result({
        rows: [
          { group_label: "=cmd|'/c calc'!A1", sale_count: 1, net_sales: 1 },
          { group_label: '@SUM(A1:A9)', sale_count: 1, net_sales: 1 },
          { group_label: '+1+1', sale_count: 1, net_sales: 1 },
          { group_label: '-2+3', sale_count: 1, net_sales: 1 },
        ],
      }),
    )

    // Not quoted — none of these contain a comma, a double quote or a newline,
    // so RFC 4180 quoting does not apply. The apostrophe prefix is the guard.
    expect(csv).toContain(`'=cmd|'/c calc'!A1`)
    expect(csv).toContain(`'@SUM(A1:A9)`)
    expect(csv).toContain(`'+1+1`)
    expect(csv).toContain(`'-2+3`)
  })

  it('leaves negative numbers as arithmetic, not as text', () => {
    // The formula guard must not fire on a number: prefixing -500 with an
    // apostrophe would make every negative figure unsummable.
    const csv = toCsv(
      result({
        columns: [{ key: 'delta', header: 'Change', type: 'money' }],
        rows: [{ delta: -500 }],
        totals: null,
      }),
    )

    expect(csv).toContain('-500.00')
    expect(csv).not.toContain("'-500")
  })

  it('writes an empty cell for null, not the word null', () => {
    const csv = toCsv(
      result({
        rows: [{ group_label: null, sale_count: 1, net_sales: 100 }],
        totals: null,
      }),
    )

    expect(csv.split('\r\n')[1]).toBe(',1,100.00')
  })

  it('omits the totals row when the report has no totals', () => {
    const lines = toCsv(result({ totals: null }))
      .trimEnd()
      .split('\r\n')
    expect(lines).toHaveLength(3)
  })
})

describe('Excel', () => {
  it('round-trips headers, values and the totals row', async () => {
    const ExcelJS = (await import('exceljs')).default
    const buffer = await toWorkbookBuffer(result())

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
    const sheet = workbook.worksheets[0]!

    // exceljs returns a 1-indexed sparse array; slot 0 is a placeholder whose
    // representation is not part of the contract, so it is sliced off rather
    // than asserted on.
    const cells = (rowNumber: number) => (sheet.getRow(rowNumber).values as unknown[]).slice(1)

    expect(cells(1)).toEqual(['Group', 'Sales', 'Net sales'])
    expect(cells(2)).toEqual(['2026-08-01', 3, 12_500.5])
    expect(cells(3)).toEqual(['2026-08-02', 1, 4_000])
    expect(cells(4)).toEqual(['Total', 4, 16_500.5])
  })

  it('writes numbers as numbers, so the recipient can sum a column', async () => {
    const ExcelJS = (await import('exceljs')).default
    const buffer = await toWorkbookBuffer(result())

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
    const sheet = workbook.worksheets[0]!

    // Columns are 1-indexed: 1 = Group (text), 2 = Sales, 3 = Net sales.
    expect(typeof sheet.getRow(2).getCell(2).value).toBe('number')
    expect(typeof sheet.getRow(2).getCell(3).value).toBe('number')
  })

  it('applies a money number format to money columns', async () => {
    const ExcelJS = (await import('exceljs')).default
    const buffer = await toWorkbookBuffer(result())

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
    const sheet = workbook.worksheets[0]!

    expect(sheet.getRow(2).getCell(3).numFmt).toBe('#,##0.00;(#,##0.00)')
  })

  it('converts ISO date strings into real dates', async () => {
    const ExcelJS = (await import('exceljs')).default
    const buffer = await toWorkbookBuffer(
      result({
        columns: [{ key: 'occurred_at', header: 'When', type: 'datetime' }],
        rows: [{ occurred_at: '2026-08-24T09:15:00.000Z' }],
        totals: null,
      }),
    )

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
    const sheet = workbook.worksheets[0]!

    expect(sheet.getRow(2).getCell(1).value).toBeInstanceOf(Date)
  })

  it('sanitises a sheet name Excel would reject', async () => {
    const ExcelJS = (await import('exceljs')).default
    // A saved custom report's title is user-typed, and Excel rejects
    // : \ / ? * [ ] and names over 31 characters.
    const buffer = await toWorkbookBuffer(
      result({ title: 'Sales: [Q3] / everything, absolutely all of it' }),
    )

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer)

    const name = workbook.worksheets[0]!.name
    expect(name.length).toBeLessThanOrEqual(31)
    expect(name).not.toMatch(/[:\\/?*[\]]/)
  })
})

describe('filenames', () => {
  it('slugs the title and stamps the generation date', () => {
    expect(reportFilename(result(), 'csv')).toBe('sales-summary-2026-08-24.csv')
  })

  it('strips characters that would break a Content-Disposition header', () => {
    const name = reportFilename(result({ title: 'Sales / "Q3"\r\nreport' }), 'xlsx')
    expect(name).not.toMatch(/["\r\n/\\]/)
  })

  it('falls back to a usable name when the title slugs to nothing', () => {
    expect(reportFilename(result({ title: '???' }), 'csv')).toBe('report-2026-08-24.csv')
  })
})
