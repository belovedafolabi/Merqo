'use server'

import { toErrorMessage } from '@/lib/errors'

import { revalidatePath } from 'next/cache'

import { createReturn, requestRefund, approveRefund } from '@/lib/sales/mutations'
import { getSale, listPendingRefunds, type Sale, type PendingRefund } from '@/lib/sales/queries'
import type { ReturnLineItemInput } from '@/lib/sales/schemas'

export interface ReturnsActionState {
  error: string | null
  returnId?: string
  refundId?: string
}

const initialState: ReturnsActionState = { error: null }

function errorMessage(error: unknown): string {
  return toErrorMessage(error)
}

export async function findSaleAction(saleId: string): Promise<Sale | null> {
  return getSale(saleId)
}

export async function listPendingRefundsAction(branchId: string): Promise<PendingRefund[]> {
  return listPendingRefunds(branchId)
}

export async function createReturnAction(
  organizationId: string,
  branchId: string,
  saleId: string,
  reason: string,
  items: ReturnLineItemInput[],
): Promise<ReturnsActionState> {
  try {
    const result = await createReturn(organizationId, branchId, { saleId, reason, items })
    revalidatePath('/pos/returns')
    return { error: null, returnId: result.id }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}

export async function requestRefundAction(
  organizationId: string,
  branchId: string,
  saleId: string,
  returnId: string | null,
  amount: number,
  method: 'cash' | 'card' | 'transfer' | 'store_credit',
  reason: string,
): Promise<ReturnsActionState> {
  try {
    const result = await requestRefund(organizationId, branchId, {
      saleId,
      returnId,
      amount,
      method,
      reason,
    })
    revalidatePath('/pos/returns')
    return { error: null, refundId: result.id }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}

export async function decideRefundAction(
  organizationId: string,
  branchId: string,
  refundId: string,
  approved: boolean,
): Promise<ReturnsActionState> {
  try {
    await approveRefund(organizationId, branchId, { refundId, approved })
    revalidatePath('/pos/returns')
    return initialState
  } catch (error) {
    return { error: errorMessage(error) }
  }
}
