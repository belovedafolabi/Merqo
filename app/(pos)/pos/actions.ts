'use server'

import { toErrorMessage } from '@/lib/errors'

import { revalidatePath } from 'next/cache'

import {
  createSale,
  holdSale,
  resumeHeldSale,
  discardHeldSale,
  type ResumedCartLine,
} from '@/lib/sales/mutations'
import { lookupProductByBarcode } from '@/lib/products/queries'
import { getPosProductShortcuts, type PosProductShortcuts } from '@/lib/pos/catalog'
import { getSale, listHeldSales, type Sale, type HeldSale } from '@/lib/sales/queries'
import type { SaleLineItemInput } from '@/lib/sales/schemas'
import { getStoreCreditBalance, searchCustomers, type Customer } from '@/lib/customers/queries'
import { createCustomer } from '@/lib/customers/mutations'
import type { CustomerInput } from '@/lib/customers/schemas'
import { getOrganizationBranding, type OrganizationBranding } from '@/lib/branding/queries'
import { getReceiptSettings, type ReceiptSettings } from '@/lib/receipts/settings'

export async function getSaleAction(saleId: string): Promise<Sale | null> {
  return getSale(saleId)
}

/**
 * Milestone 11: the branding + receipt-settings ReceiptView needs to render
 * via ReceiptDocument. A Server Action, not a prop threaded down from a
 * Server Component ancestor, because checkout-drawer.tsx (and everything
 * above it in the POS tree — PosSessionProvider, CartProvider) is
 * 'use client': getOrganizationBranding()/getReceiptSettings() reach
 * next/headers and cannot run there directly.
 */
export async function getReceiptContextAction(): Promise<{
  branding: OrganizationBranding | null
  settings: ReceiptSettings
}> {
  const [branding, settings] = await Promise.all([getOrganizationBranding(), getReceiptSettings()])
  return { branding, settings }
}

export async function listHeldSalesAction(branchId: string): Promise<HeldSale[]> {
  return listHeldSales(branchId)
}

// searchProductsAction was removed in the POS-fast-search change: the search
// box now calls the abortable GET handler at app/api/pos/products/search
// instead of a Server Action, because React serializes actions and cannot
// cancel a stale in-flight one. lib/products/queries.ts's searchProducts()
// stays for the Admin catalog side.

/**
 * The recently-sold / most-sold strips' data. A Server Action rather than a
 * server-rendered prop because ProductGrid must mount immediately — it
 * registers the document-level barcode scanner on mount, and putting the
 * grid behind a <Suspense> that waits on this query meant the scanner
 * listener was torn down and rebuilt when the real grid replaced the
 * fallback, dropping any scan in flight during that swap.
 */
export async function getPosShortcutsAction(
  branchId: string,
  businessUnitId: string,
): Promise<PosProductShortcuts> {
  return getPosProductShortcuts(branchId, businessUnitId)
}

export async function lookupBarcodeAction(
  businessUnitId: string,
  barcode: string,
): Promise<{ id: string; name: string; basePrice: number } | null> {
  return lookupProductByBarcode(businessUnitId, barcode)
}

/**
 * Milestone 09's three checkout-side customer actions. Attaching a customer
 * is what makes a sale eligible to be paid with store credit at all
 * (create_sale() rejects a store-credit sale with no customer), and what
 * puts the sale into that customer's transaction history.
 *
 * The balance shown at the till is advisory: it lets the cashier see the
 * sale can't be covered before submitting, but create_sale() re-validates
 * under a row lock regardless — a client-side number is always potentially
 * stale by the time the form posts.
 */
export async function searchCustomersAction(
  organizationId: string,
  term: string,
): Promise<Customer[]> {
  if (!term.trim()) return []
  return searchCustomers(organizationId, term)
}

export async function getStoreCreditBalanceAction(customerId: string): Promise<number> {
  return getStoreCreditBalance(customerId)
}

export async function quickAddCustomerAction(
  organizationId: string,
  input: CustomerInput,
): Promise<{ customer: Customer | null; error: string | null }> {
  try {
    const customer = await createCustomer(organizationId, input)
    return { customer, error: null }
  } catch (error) {
    return { customer: null, error: errorMessage(error) }
  }
}

/**
 * Server Actions for the POS checkout screen — same thin
 * FormData/JSON-parsing shape as app/(app)/inventory/actions.ts around
 * lib/sales/mutations.ts. Cart line items are variable-length structured
 * data carried as a JSON string field, same precedent as inventory's own
 * stock-transfer line items (app/(app)/inventory/actions.ts's own comment).
 */
export interface PosActionState {
  error: string | null
  saleId?: string
  total?: number
}

const initialState: PosActionState = { error: null }

function errorMessage(error: unknown): string {
  return toErrorMessage(error)
}

export async function checkoutAction(
  _prevState: PosActionState,
  formData: FormData,
): Promise<PosActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const itemsRaw = String(formData.get('items') ?? '[]')

  let items: SaleLineItemInput[]
  try {
    items = JSON.parse(itemsRaw) as SaleLineItemInput[]
  } catch {
    return { error: 'Invalid cart contents.' }
  }

  const discountPercentageRaw = formData.get('discountPercentage')
  const discountAmountRaw = formData.get('discountAmount')

  try {
    const customerId = formData.get('customerId')

    const sale = await createSale(organizationId, {
      branchId: String(formData.get('branchId') ?? ''),
      businessUnitId: String(formData.get('businessUnitId') ?? ''),
      customerId: customerId ? String(customerId) : undefined,
      idempotencyKey: String(formData.get('idempotencyKey') ?? ''),
      items,
      discountPercentage: discountPercentageRaw ? Number(discountPercentageRaw) : undefined,
      discountAmount: discountAmountRaw ? Number(discountAmountRaw) : undefined,
      discountReason: formData.get('discountReason')
        ? String(formData.get('discountReason'))
        : undefined,
      paymentMethod: String(formData.get('paymentMethod') ?? 'cash') as
        'cash' | 'card' | 'transfer' | 'store_credit',
      paymentReference: formData.get('paymentReference')
        ? String(formData.get('paymentReference'))
        : undefined,
    })

    revalidatePath('/pos')
    return { error: null, saleId: sale.id, total: sale.total }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}

export async function holdSaleAction(
  organizationId: string,
  branchId: string,
  businessUnitId: string,
  items: SaleLineItemInput[],
  label?: string,
): Promise<PosActionState> {
  try {
    await holdSale(organizationId, { branchId, businessUnitId, items, label })
    revalidatePath('/pos')
    return initialState
  } catch (error) {
    return { error: errorMessage(error) }
  }
}

export async function resumeHeldSaleAction(
  organizationId: string,
  branchId: string,
  heldSaleId: string,
): Promise<ResumedCartLine[]> {
  const items = await resumeHeldSale(organizationId, branchId, heldSaleId)
  revalidatePath('/pos')
  return items
}

export async function discardHeldSaleAction(
  organizationId: string,
  branchId: string,
  heldSaleId: string,
): Promise<PosActionState> {
  try {
    await discardHeldSale(organizationId, branchId, heldSaleId)
    revalidatePath('/pos')
    return initialState
  } catch (error) {
    return { error: errorMessage(error) }
  }
}
