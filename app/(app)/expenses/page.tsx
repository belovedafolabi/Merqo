import { redirect } from 'next/navigation'
import { Receipt } from 'lucide-react'

import { getCurrentUserContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/guard'
import { resolvePermission } from '@/lib/auth/permissions'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { listExpenses } from '@/lib/expenses/queries'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { EmptyState } from '@/components/states/empty-state'
import { ExpensesView } from '@/components/expenses/expenses-view'

/**
 * Business expenses (docs/Financial_Architecture_Accounting_Reconciliation.md
 * §26–27). Reachable from the Admin sidebar's "Expenses" item, gated on
 * `expense.view`.
 *
 * Expenses exist in this milestone because net profit needs them: Milestone
 * 10's acceptance criteria require correct net profit, and net profit is gross
 * profit minus expenses. §28's configurable approval *thresholds* are
 * deliberately out of scope — §28 itself says they should be configuration,
 * which places them with Milestone 11's administration work.
 */
export default async function ExpensesPage() {
  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  await requirePermission('expense.view', { organizationId })

  const branch = onboardingState.branch
  if (!branch) {
    return (
      <div className="flex flex-1 flex-col">
        <AdminTopbar title="Expenses" />
        <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
          <EmptyState
            icon={Receipt}
            title="No branch yet"
            description="Set up a branch in Business Structure before recording expenses."
          />
        </div>
      </div>
    )
  }

  const [{ grants }, expenses] = await Promise.all([
    getCurrentUserContext(),
    // Voided expenses are included so the record stays visible — they are
    // withdrawn from profit, not erased, and hiding them would make the list
    // disagree with the audit log.
    listExpenses(organizationId, { includeVoided: true }),
  ])

  const scope = { organizationId, branchId: branch.id }

  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Expenses" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <ExpensesView
          organizationId={organizationId}
          branchId={branch.id}
          businessUnitId={onboardingState.businessUnit?.id ?? null}
          expenses={expenses}
          canCreate={resolvePermission(grants, 'expense.create', scope)}
          canApprove={resolvePermission(grants, 'expense.approve', scope)}
          canVoid={resolvePermission(grants, 'expense.delete', scope)}
        />
      </div>
    </div>
  )
}
