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
 * The page opens the print dialog on mount only when `autoPrint` is set, which
 * the Print button does via `?print=1`. Navigating here directly — from a
 * bookmark, a shared link, or a test — renders the report and waits. Printing
 * unconditionally would ambush anyone who arrived any other way, and the print
 * dialog is modal: it blocks the renderer until dismissed, which makes an
 * always-printing page impossible to load programmatically at all.
 */
export function PrintReport({
  result,
  organizationName,
  autoPrint,
}: {
  result: ReportResult
  organizationName: string
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

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-8 print:p-0">
      {/* `print:hidden` on the chrome, so the printed sheet carries the report
          and its provenance and nothing else — no sidebar, no buttons. */}
      <style>{`
        @media print {
          @page { margin: 16mm; }
          body { background: white; }
        }
      `}</style>

      <header className="flex flex-col gap-1 border-b pb-4">
        <p className="text-body-sm text-muted-foreground">{organizationName}</p>
        <h1 className="text-h2 font-semibold">{result.title}</h1>
        <p className="text-body-sm text-muted-foreground">{range}</p>
        {/* Generation time on the page itself: a printed report with no date
            on it is indistinguishable from one printed last quarter. */}
        <p className="text-caption text-muted-foreground">
          Generated {formatDateTime(result.generatedAt)}
        </p>
      </header>

      <ReportTable result={result} />

      <p className="text-caption text-muted-foreground print:fixed print:bottom-0">
        Merqo · {result.rows.length} row{result.rows.length === 1 ? '' : 's'}
        {result.truncated ? ' (truncated)' : ''}
      </p>
    </div>
  )
}
