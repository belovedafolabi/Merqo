import { NextResponse, type NextRequest } from 'next/server'

import { AuthorizationError } from '@/lib/auth/guard'
import { getCurrentOrganizationId } from '@/lib/auth/context'
import { logger } from '@/lib/logger'
import { findStandardReport } from '@/lib/reports/catalog'
import { recordReportExport } from '@/lib/reports/mutations'
import { parseReportParams } from '@/lib/reports/params'
import { runStandardReport } from '@/lib/reports/queries'
import { toCsv } from '@/lib/reports/export/csv'
import { reportFilename } from '@/lib/reports/export/filename'
import { toWorkbookBuffer } from '@/lib/reports/export/xlsx'

/**
 * Report download endpoint — `GET /reports/export?report=…&format=csv|xlsx`.
 *
 * A Route Handler rather than a Server Action because the result is a *file*:
 * a GET with `Content-Disposition: attachment` is what makes the browser save
 * it, and it lets the export controls be plain links carrying the same query
 * string the screen is showing (see components/reports/export-buttons.tsx).
 *
 * The permission story here is the important part. `recordReportExport()`
 * calls requirePermission('reports.export'), so the check happens on the
 * server on every request — the hidden buttons in the UI are an affordance,
 * and this is the control. Export is separately permissioned from viewing
 * because Milestone 10's Security Requirements name it "a higher-risk
 * data-exfiltration surface", and it is separately audited for the same
 * reason: an exfiltration path with no trail is not much of a control.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const organizationId = await getCurrentOrganizationId()
  if (!organizationId) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const reportId = searchParams.get('report') ?? ''
  const format = searchParams.get('format') ?? 'csv'

  const report = findStandardReport(reportId)
  if (!report) {
    return NextResponse.json({ error: 'Unknown report.' }, { status: 404 })
  }
  if (format !== 'csv' && format !== 'xlsx') {
    return NextResponse.json({ error: 'Unsupported format.' }, { status: 400 })
  }

  try {
    const parameters = parseReportParams(
      organizationId,
      report,
      Object.fromEntries(searchParams.entries()),
    )

    // The same function the screen uses, so the file and the screen cannot
    // diverge — and it applies `reports.view` plus the report's own
    // permission before any data is read.
    const result = await runStandardReport(report.id, parameters)

    await recordReportExport(organizationId, report.id, format, result.rows.length)

    const filename = reportFilename(result, format)

    if (format === 'csv') {
      return new NextResponse(toCsv(result), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          // Reports change as sales come in; a cached export would hand back
          // yesterday's numbers under today's filename.
          'Cache-Control': 'no-store',
        },
      })
    }

    const workbook = await toWorkbookBuffer(result)
    return new NextResponse(new Uint8Array(workbook), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    // Serialized rather than String()'d: a PostgREST failure is a plain
    // object, and `String(error)` renders it as "[object Object]" — a log line
    // that says something broke and nothing about what.
    logger.error('report.export_failed', {
      reportId: report.id,
      format,
      error:
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null
            ? JSON.stringify(error)
            : String(error),
    })
    return NextResponse.json({ error: 'Could not generate the export.' }, { status: 500 })
  }
}
