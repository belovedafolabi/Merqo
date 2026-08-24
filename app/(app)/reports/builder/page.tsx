import { redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth/guard'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { getReportAccess } from '@/lib/reports/access'
import { parseReportParams, type ReportSearchParams } from '@/lib/reports/params'
import { getSavedReport, listSavedReports } from '@/lib/reports/saved'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { CustomReportBuilder } from '@/components/reports/custom-report-builder'
import { SavedReportsList } from '@/components/reports/saved-reports-list'

/**
 * The custom report builder (docs/PRD.md §29).
 *
 * Note the route shape: `builder` is a static sibling of `[reportId]`, so
 * Next's App Router matches it before the dynamic segment. That is intended —
 * there is deliberately no standard report with the id "builder".
 */
export default async function ReportBuilderPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearchParams>
}) {
  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  await requirePermission('reports.view', { organizationId })

  const resolvedSearchParams = await searchParams
  const savedId =
    typeof resolvedSearchParams.saved === 'string' ? resolvedSearchParams.saved : undefined

  const [access, savedReports, saved] = await Promise.all([
    getReportAccess(organizationId, onboardingState.branch?.id ?? null),
    listSavedReports(organizationId),
    savedId ? getSavedReport(savedId) : Promise.resolve(null),
  ])

  const parameters = parseReportParams(organizationId, null, resolvedSearchParams)
  const scopedParameters =
    access.canViewAllBranches || parameters.branchId
      ? parameters
      : { ...parameters, branchId: onboardingState.branch?.id ?? null }

  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Report builder" />
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <CustomReportBuilder
          organizationId={organizationId}
          parameters={scopedParameters}
          branches={access.branches}
          canSave={access.granted.includes('reports.save')}
          grantedPermissions={access.granted}
          initialConfig={saved?.config}
          initialSavedReportId={saved?.id}
          initialName={saved?.name}
        />

        {access.granted.includes('reports.save') && (
          <SavedReportsList organizationId={organizationId} reports={savedReports} />
        )}
      </div>
    </div>
  )
}
