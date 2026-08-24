import { redirect } from 'next/navigation'

import { getOnboardingState } from '@/lib/business-structure/queries'
import { getReportAccess } from '@/lib/reports/access'
import { parseReportParams, type ReportSearchParams } from '@/lib/reports/params'
import { getAccountingSummary } from '@/lib/reports/queries'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { AccountingSummaryView } from '@/components/reports/accounting-summary-view'

/**
 * The accounting summary dashboard (docs/milestones/
 * 10-reporting-analytics-and-accounting.md Frontend Changes: "Accounting
 * summary dashboard (revenue/COGS/profit at a glance)").
 *
 * getAccountingSummary() requires `reports.view_financials` and throws
 * otherwise — this page puts cost of goods and profit on one screen, which is
 * exactly the information that permission exists to gate.
 */
export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearchParams>
}) {
  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  const access = await getReportAccess(organizationId, onboardingState.branch?.id ?? null)
  const parameters = parseReportParams(organizationId, null, await searchParams)

  const scopedParameters =
    access.canViewAllBranches || parameters.branchId
      ? parameters
      : { ...parameters, branchId: onboardingState.branch?.id ?? null }

  const summary = await getAccountingSummary(scopedParameters)

  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Accounting" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <AccountingSummaryView
          summary={summary}
          parameters={scopedParameters}
          branches={access.branches}
          canViewAllBranches={access.canViewAllBranches}
        />
      </div>
    </div>
  )
}
