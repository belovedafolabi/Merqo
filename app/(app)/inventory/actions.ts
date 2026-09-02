'use server'

import { toErrorMessage } from '@/lib/errors'

import { revalidatePath } from 'next/cache'

import {
  createStockAdjustment,
  initiateStockTransfer,
  updateLowStockThreshold,
} from '@/lib/inventory/mutations'
import { listBranchProductOptions, type BranchProductOption } from '@/lib/inventory/queries'
import type { StockTransferItemInput } from '@/lib/inventory/schemas'

/**
 * Server Actions for the Inventory screen — same thin FormData-parsing
 * shape as app/(app)/products/actions.ts around lib/inventory/mutations.ts.
 */
export interface InventoryActionState {
  error: string | null
}

const initialState: InventoryActionState = { error: null }

function errorMessage(error: unknown): string {
  return toErrorMessage(error)
}

function optionalStringField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  return value ? String(value) : undefined
}

export async function createStockAdjustmentAction(
  _prevState: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')

  try {
    await createStockAdjustment(organizationId, {
      branchId: String(formData.get('branchId') ?? ''),
      productId: String(formData.get('productId') ?? ''),
      variantId: optionalStringField(formData, 'variantId') ?? null,
      quantityDelta: Number(formData.get('quantityDelta') ?? 0),
      reason: String(formData.get('reason') ?? ''),
      batchNumber: optionalStringField(formData, 'batchNumber'),
      expiryDate: optionalStringField(formData, 'expiryDate'),
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/inventory')
  revalidatePath('/dashboard')
  return initialState
}

/**
 * Transfer line items are a repeating row under a single <form> — serialized
 * as a JSON string field (`items`) built client-side by
 * components/inventory/stock-transfer-dialog.tsx, the standard way to carry
 * structured, variable-length data through a plain FormData submission.
 */
export async function initiateStockTransferAction(
  _prevState: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const itemsRaw = String(formData.get('items') ?? '[]')

  let items: StockTransferItemInput[]
  try {
    items = JSON.parse(itemsRaw) as StockTransferItemInput[]
  } catch {
    return { error: 'Invalid transfer items.' }
  }

  try {
    await initiateStockTransfer(organizationId, {
      sourceBranchId: String(formData.get('sourceBranchId') ?? ''),
      destinationBranchId: String(formData.get('destinationBranchId') ?? ''),
      items,
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/inventory')
  return initialState
}

/**
 * A plain callable Server Action (not a <form action>) — components/
 * inventory/stock-transfer-dialog.tsx invokes this directly when the
 * operator changes the destination branch, so the destination product
 * picker only fetches the one branch actually selected rather than every
 * branch in the organization up front.
 */
export async function listBranchProductOptionsAction(
  branchId: string,
): Promise<BranchProductOption[]> {
  return listBranchProductOptions(branchId)
}

export async function updateLowStockThresholdAction(
  _prevState: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const branchId = String(formData.get('branchId') ?? '')
  const balanceId = String(formData.get('balanceId') ?? '')
  const rawThreshold = optionalStringField(formData, 'threshold')

  try {
    await updateLowStockThreshold(organizationId, branchId, balanceId, {
      threshold: rawThreshold ? Number(rawThreshold) : null,
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/inventory')
  revalidatePath('/dashboard')
  return initialState
}
