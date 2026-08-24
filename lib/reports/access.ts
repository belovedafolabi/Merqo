import { getCurrentUserContext } from '@/lib/auth/context'
import { resolvePermission } from '@/lib/auth/permissions'
import { listBranches } from '@/lib/business-structure/queries'
import type { BranchOption } from '@/components/reports/report-filter-bar'

/**
 * What the current user is allowed to see on a reporting screen, resolved
 * once per page render.
 *
 * Every reporting page needs the same three answers — may they export, may
 * they see cost-bearing figures, may they look across branches — and the
 * branch list they are offered depends on the third. Computing it in one place
 * keeps four pages from each deriving it slightly differently, which is how a
 * branch selector ends up offering "All branches" on one screen and not
 * another.
 *
 * None of this is a security boundary. RLS scopes the rows and
 * requirePermission() gates the actions; this decides what the UI *offers*.
 */
export interface ReportAccess {
  granted: string[]
  canExport: boolean
  canViewFinancials: boolean
  canViewAllBranches: boolean
  branches: BranchOption[]
}

const CONTEXTUAL_PERMISSIONS = [
  'reports.view',
  'reports.export',
  'reports.view_financials',
  'reports.view_all_branches',
  'reports.save',
] as const

export async function getReportAccess(
  organizationId: string,
  currentBranchId: string | null,
): Promise<ReportAccess> {
  const { grants } = await getCurrentUserContext()

  const granted = CONTEXTUAL_PERMISSIONS.filter((key) =>
    resolvePermission(grants, key, { organizationId }),
  )
  const canViewAllBranches = granted.includes('reports.view_all_branches')

  const allBranches = await listBranches(organizationId)
  const active = allBranches.filter((branch) => branch.archivedAt === null)

  // Without the cross-branch permission the selector offers only the branch
  // the user is currently working in, so the default view is their own branch
  // rather than a silent organization-wide roll-up. RLS would return the same
  // rows either way for a branch-scoped role — this matters for a user whose
  // role assignment is org-wide but who was not granted cross-branch
  // *reporting* (docs/Business_Structure_Branche.md §24.42).
  const branches = canViewAllBranches
    ? active
    : active.filter((branch) => branch.id === currentBranchId)

  return {
    granted: [...granted],
    canExport: granted.includes('reports.export'),
    canViewFinancials: granted.includes('reports.view_financials'),
    canViewAllBranches,
    branches: branches.map((branch) => ({ id: branch.id, name: branch.name })),
  }
}
