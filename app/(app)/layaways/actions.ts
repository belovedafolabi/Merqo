'use server'

import { revalidatePath } from 'next/cache'

import { cancelLayaway, createLayaway, recordLayawayPayment } from '@/lib/customers/mutations'
import { getLayaway, type LayawayDetail } from '@/lib/customers/queries'
import type { LayawayLineItemInput } from '@/lib/customers/schemas'

/**
 * Server Actions for the Layaways screen — same thin FormData-parsing shape
 * as app/(app)/inventory/actions.ts. Layaway line items are variable-length
 * structured data carried as a JSON string field, the same precedent
 * inventory's stock-transfer line items and the POS cart already set.
 */
export interface LayawayActionState {
  error: string | null
}

const initialState: LayawayActionState = { error: null }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

export async function createLayawayAction(
  _prevState: LayawayActionState,
  formData: FormData,
): Promise<LayawayActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const itemsRaw = String(formData.get('items') ?? '[]')

  let items: LayawayLineItemInput[]
  try {
    items = JSON.parse(itemsRaw) as LayawayLineItemInput[]
  } catch {
    return { error: 'Invalid layaway items.' }
  }

  try {
    await createLayaway(organizationId, {
      customerId: String(formData.get('customerId') ?? ''),
      branchId: String(formData.get('branchId') ?? ''),
      businessUnitId: String(formData.get('businessUnitId') ?? ''),
      items,
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/layaways')
  revalidatePath('/inventory')
  return initialState
}

export async function recordLayawayPaymentAction(
  _prevState: LayawayActionState,
  formData: FormData,
): Promise<LayawayActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const branchId = String(formData.get('branchId') ?? '')
  const reference = formData.get('reference')

  try {
    await recordLayawayPayment(organizationId, branchId, {
      layawayId: String(formData.get('layawayId') ?? ''),
      amount: Number(formData.get('amount') ?? 0),
      method: String(formData.get('method') ?? 'cash') as 'cash' | 'card' | 'transfer',
      reference: reference ? String(reference) : undefined,
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  // A final installment completes the layaway, which releases its
  // reservation and deducts real stock — so inventory is revalidated too.
  revalidatePath('/layaways')
  revalidatePath('/inventory')
  return initialState
}

export async function cancelLayawayAction(
  _prevState: LayawayActionState,
  formData: FormData,
): Promise<LayawayActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const branchId = String(formData.get('branchId') ?? '')

  try {
    await cancelLayaway(organizationId, branchId, {
      layawayId: String(formData.get('layawayId') ?? ''),
      reason: String(formData.get('reason') ?? ''),
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/layaways')
  revalidatePath('/inventory')
  return initialState
}

/** Loads a layaway's items and installment history on demand for the detail sheet. */
export async function getLayawayAction(layawayId: string): Promise<LayawayDetail | null> {
  return getLayaway(layawayId)
}
