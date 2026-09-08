'use server'

import { revalidatePath } from 'next/cache'

import { approveRefund } from '@/lib/sales/mutations'
import { toErrorMessage } from '@/lib/errors'

/**
 * Server Action for the Admin Approvals screen. Same thin FormData shape as
 * app/(app)/expenses/actions.ts's decideExpenseAction — deliberately NOT the
 * positional, startTransition-driven app/(pos)/pos/returns/actions.ts version,
 * because the Admin shell is `useActionState` + `<form action>` throughout.
 * The real authorization and the self-approval rule live in
 * lib/sales/mutations.ts's approveRefund() / decide_refund().
 */
export interface ApprovalsActionState {
  error: string | null
}

const initialState: ApprovalsActionState = { error: null }

export async function decideRefundAction(
  _prevState: ApprovalsActionState,
  formData: FormData,
): Promise<ApprovalsActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const branchId = String(formData.get('branchId') ?? '')

  try {
    await approveRefund(organizationId, branchId, {
      refundId: String(formData.get('refundId') ?? ''),
      approved: formData.get('approved') === 'true',
    })
  } catch (error) {
    return { error: toErrorMessage(error) }
  }

  // The Sales list reflects a refunded sale, and /reports/accounting nets
  // refunds out of revenue — keep both from serving a stale figure.
  revalidatePath('/approvals')
  revalidatePath('/sales')
  revalidatePath('/reports/accounting')
  return initialState
}
