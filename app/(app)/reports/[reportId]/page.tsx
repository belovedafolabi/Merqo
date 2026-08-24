import { notFound, redirect } from 'next/navigation'

import { getOnboardingState } from '@/lib/business-structure/queries'
import { findStandardReport } from '@/lib/reports/catalog'
import { getReportAccess } from '@/lib/reports/access'
import { parseReportParams, type ReportSearchParams } from '@/lib/reports/params'
import { runStandardReport } from '@/lib/reports/queries'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { ReportRunnerView } from '@/components/reports/report-runner-view'

/**
 * Runs and renders any report in the catalog.
 *
 * One route for all fourteen, driven by lib/reports/catalog.ts — adding a
 * report is an entry in that table plus a SQL function, never a new page.
 *
 * Filters arrive as search params rather than component state (see
 * lib/reports/params.ts), which is what makes a filtered report bookmarkable
 * and lets the export and print links carry the reader's exact view.
 */
export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ reportId: string }>
  searchParams: Promise<ReportSearchParams>
}) {
  const { reportId } = await params
  const report = findStandardReport(reportId)
  if (!report) notFound()

  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  const access = await getReportAccess(organizationId, onboardingState.branch?.id ?? null)

  const resolvedSearchParams = await searchParams
  const parameters = parseReportParams(organizationId, report, resolvedSearchParams)

  // A user without cross-branch reporting gets pinned to their own branch even
  // if the URL asks for everything. RLS already limits the *rows*; this stops
  // the screen presenting itself as an organization-wide view when it is not.
  const scopedParameters =
    access.canViewAllBranches || parameters.branchId
      ? parameters
      : { ...parameters, branchId: onboardingState.branch?.id ?? null }

  // requirePermission() inside runStandardReport() is the gate — including
  // report.permission for the cost-bearing financial reports. It throws, and
  // app/(app)/error.tsx renders the refusal.
  const result = await runStandardReport(report.id, scopedParameters)

  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title={report.title} />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <ReportRunnerView
          report={report}
          result={result}
          branches={access.branches}
          canExport={access.canExport}
          canViewAllBranches={access.canViewAllBranches}
        />
      </div>
    </div>
  )
}
