import { redirect } from 'next/navigation'
import { BadgeCheck } from 'lucide-react'

import { getCurrentUserContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/guard'
import { resolvePermission } from '@/lib/auth/permissions'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { listExpenses } from '@/lib/expenses/queries'
import { listPendingRefunds } from '@/lib/sales/queries'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { EmptyState } from '@/components/states/empty-state'
import { ApprovalsView } from '@/components/approvals/approvals-view'

/**
 * Milestone 17 Part E item 4 — manager approvals reachable from the Admin
 * shell. Branch Manager already holds refund.approve / expense.approve; the
 * only place to act on a pending refund used to be the POS returns screen.
 * This page surfaces the same pending-refund queue there, plus a pointer to
 * the pending-expense tab on /expenses. Nothing new is granted.
 */
export default async function ApprovalsPage() {
  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  await requirePermission('refund.approve', { organizationId })

  const branch = onboardingState.branch
  if (!branch) {
    return (
      <div className="flex flex-1 flex-col">
        <AdminTopbar title="Approvals" />
        <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
          <EmptyState
            icon={BadgeCheck}
            title="No branch yet"
            description="Set up a branch in Business Structure before anything needs approving."
          />
        </div>
      </div>
    )
  }

  const scope = { organizationId, branchId: branch.id }
  const { grants } = await getCurrentUserContext()
  const canApproveExpenses = resolvePermission(grants, 'expense.approve', scope)

  const [pendingRefunds, pendingExpenses] = await Promise.all([
    listPendingRefunds(branch.id),
    canApproveExpenses ? listExpenses(organizationId, { status: 'pending' }) : Promise.resolve([]),
  ])

  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Approvals" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <ApprovalsView
          organizationId={organizationId}
          branchId={branch.id}
          pendingRefunds={pendingRefunds}
          pendingExpenseCount={pendingExpenses.length}
          canApproveExpenses={canApproveExpenses}
        />
      </div>
    </div>
  )
}
