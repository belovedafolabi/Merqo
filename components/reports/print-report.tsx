'use client'

import { useEffect } from 'react'

import { ReportTable } from '@/components/reports/report-table'
import { formatDateTime } from '@/lib/utils'
import type { ReportResult } from '@/lib/reports/types'

/**
 * The printable report view — and, by way of the browser's own "Save as PDF",
 * this milestone's PDF export.
 *
 * Milestone 10 asks for PDF "via a server-side rendering approach consistent
 * with the receipt-rendering pattern already established in Milestone 08". That
 * pattern turned out to be plain rendered HTML — components/pos/receipt-view.tsx
 * has no PDF generation in it at all — so this route establishes the print
 * pattern rather than reusing one. The result is no PDF library, no headless
 * Chrome to run or pay for, and one rendering path: what prints is the same
 * `ReportResult` the screen showed, so the PDF cannot disagree with it.
 *
 * The presentation — a brand-coloured rule under the header, the org logo where
 * one is set, zebra rows, a table header that repeats on every printed page, a
 * running footer — is all print CSS scoped to `.merqo-report`; nothing here
 * changes the numbers.
 */
export function PrintReport({
  result,
  organizationName,
  logoUrl,
  brandColor,
  autoPrint,
}: {
  result: ReportResult
  organizationName: string
  logoUrl?: string | null
  brandColor?: string | null
  autoPrint: boolean
}) {
  useEffect(() => {
    if (!autoPrint) return

    // A short delay so fonts and layout settle first; printing mid-layout
    // produces a first page with the wrong column widths.
    const timer = setTimeout(() => window.print(), 300)
    return () => clearTimeout(timer)
  }, [autoPrint])

  const range =
    result.parameters.from && result.parameters.to
      ? `${formatDateTime(result.parameters.from)} — ${formatDateTime(result.parameters.to)}`
      : 'All time'

  const accent = brandColor || 'oklch(0.6 0.15 155)'

  return (
    <div
      className="merqo-report mx-auto flex max-w-4xl flex-col gap-6 p-8 print:p-0"
      style={{ ['--report-accent' as string]: accent }}
    >
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          /* Repeat the column headers at the top of every printed page. */
          .merqo-report thead { display: table-header-group; }
          .merqo-report tfoot { display: table-footer-group; }
          /* Never split a row across a page break. */
          .merqo-report tr { break-inside: avoid; }
          /* Zebra striping survives to paper. */
          .merqo-report tbody tr:nth-child(even) { background: #f3f4f6 !important; }
          .merqo-report .report-foot { position: fixed; bottom: 0; left: 0; right: 0; }
        }
        .merqo-report .report-accent-rule {
          border-bottom: 3px solid var(--report-accent);
        }
        .merqo-report tbody tr:nth-child(even) { background: color-mix(in oklch, currentColor 4%, transparent); }
      `}</style>

      <header className="report-accent-rule flex items-start justify-between gap-4 pb-4">
        <div className="flex flex-col gap-1">
          <p className="text-body-sm font-medium text-muted-foreground">{organizationName}</p>
          <h1 className="text-h2 font-semibold">{result.title}</h1>
          <p className="text-body-sm text-muted-foreground">{range}</p>
          <p className="text-caption text-muted-foreground">
            Generated {formatDateTime(result.generatedAt)}
          </p>
        </div>
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-12 w-auto object-contain" />
        )}
      </header>

      <ReportTable result={result} />

      <p className="report-foot text-caption text-muted-foreground">
        {organizationName} · {result.title} · {result.rows.length} row
        {result.rows.length === 1 ? '' : 's'}
        {result.truncated ? ' (truncated)' : ''} · Generated {formatDateTime(result.generatedAt)}
      </p>
    </div>
  )
}
