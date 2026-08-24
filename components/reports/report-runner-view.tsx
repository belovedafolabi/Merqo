import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ExportButtons } from '@/components/reports/export-buttons'
import { ReportChart } from '@/components/reports/report-chart'
import { ReportFilterBar, type BranchOption } from '@/components/reports/report-filter-bar'
import { ReportTable } from '@/components/reports/report-table'
import { toQueryString } from '@/lib/reports/params'
import type { StandardReportDef } from '@/lib/reports/catalog'
import type { ReportResult } from '@/lib/reports/types'

/**
 * One screen for every standard report — filter bar, chart, table, exports.
 * A Server Component: the result is computed above it and passed straight in,
 * so there is no loading state to manage and no client-side fetch of report
 * data at all.
 */
export function ReportRunnerView({
  report,
  result,
  branches,
  canExport,
  canViewAllBranches,
}: {
  report: StandardReportDef
  result: ReportResult
  branches: BranchOption[]
  canExport: boolean
  canViewAllBranches: boolean
}) {
  const queryString = toQueryString(result.parameters)

  return (
    <div className="flex flex-1 flex-col gap-4">
      <ReportFilterBar
        parameters={result.parameters}
        branches={branches}
        groupings={report.groupings}
        dateRanged={report.dateRanged}
        canViewAllBranches={canViewAllBranches}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body-sm text-muted-foreground">{report.description}</p>
        <ExportButtons reportId={report.id} queryString={queryString} canExport={canExport} />
      </div>

      {/* The chart renders only when the result has something plottable —
          a label column and a numeric one. A chart of a single text column
          would be decoration, and ReportChart returns null rather than
          drawing an empty axis frame. */}
      <ReportChart result={result} />

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>{report.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportTable result={result} />
        </CardContent>
      </Card>
    </div>
  )
}
