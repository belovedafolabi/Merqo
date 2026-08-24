import { redirect } from 'next/navigation'
import { ScrollText } from 'lucide-react'

import { getCurrentUserContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/guard'
import { resolvePermission } from '@/lib/auth/permissions'
import { getCurrentOrganizationId } from '@/lib/auth/context'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { EmptyState } from '@/components/states/empty-state'
import { ReportCatalog } from '@/components/reports/report-catalog'
import { STANDARD_REPORTS } from '@/lib/reports/catalog'

/**
 * The report catalog (docs/milestones/10-reporting-analytics-and-accounting.md
 * Frontend Changes: "Report catalog navigation"). Reachable from the Admin
 * sidebar's "Reports" item, gated on `reports.view`.
 */
export default async function ReportsPage() {
  const organizationId = await getCurrentOrganizationId()
  if (!organizationId) redirect('/sign-in')

  // Throws AuthorizationError rather than rendering an empty catalog: a user
  // with no reporting permission should not reach this route at all, and the
  // route error boundary is the right place to say so.
  await requirePermission('reports.view', { organizationId })

  const { grants } = await getCurrentUserContext()
  const granted = [
    'reports.view',
    'reports.export',
    'reports.view_financials',
    'reports.view_all_branches',
    'reports.save',
  ].filter((key) => resolvePermission(grants, key, { organizationId }))

  const visibleCount = STANDARD_REPORTS.filter(
    (report) => !report.permission || granted.includes(report.permission),
  ).length

  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Reports" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        {visibleCount === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No reports available"
            description="Your role does not include access to any reports yet. Ask an administrator for reporting permissions."
          />
        ) : (
          <ReportCatalog grantedPermissions={granted} />
        )}
      </div>
    </div>
  )
}
