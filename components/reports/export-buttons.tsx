'use client'

import { FileSpreadsheet, FileText, Printer } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { notify } from '@/lib/toast'

/**
 * Export controls.
 *
 * CSV and Excel are `fetch` + blob downloads rather than plain `<a download>`
 * links (Milestone 17 Part D). The link form had no progress feedback and,
 * worse, no error surface at all: a 403 or 500 from the route came back as a
 * JSON body the browser simply rendered nowhere, so a failed export looked
 * identical to a slow one. Going through `fetch` lets `notify` show a
 * "preparing" toast and turn a non-OK response into a visible error.
 *
 * The file still comes from the same `GET` to app/(app)/reports/export/route.ts,
 * which re-checks `reports.export` server-side and carries the same query
 * string the screen is showing — so the downloaded file is by construction the
 * report the reader is looking at.
 *
 * Print / PDF stays a plain link: it opens the print *view* in a new tab (the
 * browser's own "Save as PDF" makes the file), which a blob download cannot do.
 */

async function downloadExport(url: string, fallbackName: string): Promise<void> {
  const response = await fetch(url)

  if (!response.ok) {
    let message = "Couldn't prepare the export — try again."
    try {
      const body = (await response.json()) as { error?: unknown }
      if (typeof body.error === 'string') message = body.error
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new Error(message)
  }

  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName

  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

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

  function runExport(format: 'csv' | 'xlsx'): void {
    void notify(
      downloadExport(
        `/reports/export?report=${reportId}&format=${format}${suffix}`,
        `${reportId}.${format}`,
      ),
      {
        loading: format === 'csv' ? 'Preparing CSV…' : 'Preparing Excel file…',
        success: format === 'csv' ? 'CSV ready' : 'Excel file ready',
        error: (error) =>
          error instanceof Error ? error.message : "Couldn't prepare the export — try again.",
      },
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => runExport('csv')}>
        <FileText /> CSV
      </Button>
      <Button variant="outline" size="sm" onClick={() => runExport('xlsx')}>
        <FileSpreadsheet /> Excel
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
