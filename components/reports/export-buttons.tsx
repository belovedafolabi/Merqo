import { FileSpreadsheet, FileText, Printer } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Export controls.
 *
 * All three are plain links, not buttons with click handlers, and that is the
 * point. Each carries the same query string the screen is currently showing,
 * so the file that downloads is by construction the report the reader is
 * looking at — there is no second code path that could compute a different
 * result. The download itself is a `GET` to
 * app/(app)/reports/export/route.ts, which re-checks `reports.export` server
 * side; hiding these controls is the affordance, not the control.
 *
 * PDF is the print link. Milestone 10 asks for PDF export "via a server-side
 * rendering approach consistent with the receipt-rendering pattern already
 * established in Milestone 08" — and that pattern turned out to be plain
 * rendered HTML (components/pos/receipt-view.tsx has no PDF path at all). So
 * the print route renders the report with print styles and the browser's own
 * "Save as PDF" produces the file: no PDF library, no headless browser, and
 * one rendering stack rather than two that could disagree.
 */
export function ExportButtons({
  reportId,
  queryString,
  canExport,
}: {
  reportId: string
  queryString: string
  canExport: boolean
}) {
  if (!canExport) return null

  const suffix = queryString ? `&${queryString}` : ''

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm">
        <a href={`/reports/export?report=${reportId}&format=csv${suffix}`} download>
          <FileText /> CSV
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={`/reports/export?report=${reportId}&format=xlsx${suffix}`} download>
          <FileSpreadsheet /> Excel
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a
          // `print=1` is what opts the print view into opening the browser's
          // print dialog on load — see components/reports/print-report.tsx.
          href={`/reports/${reportId}/print?print=1${queryString ? `&${queryString}` : ''}`}
          target="_blank"
          rel="noreferrer"
        >
          <Printer /> Print / PDF
        </a>
      </Button>
    </div>
  )
}
