import { requirePermission } from '@/lib/auth/guard'
import { recordAuditEvent } from '@/lib/auth/audit'
import { notifyLowStock } from '@/lib/notifications/low-stock'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { resolveEffectivePrice, resolveVariantPrice } from '@/lib/products/pricing'
import {
  getBusinessUnitPosConfig,
  listBusinessUnitCapabilities,
} from '@/lib/business-structure/queries'
import { calculateSaleTotals, type SaleLineItemCalcInput } from '@/lib/sales/calculations'
import {
  createSaleInputSchema,
  holdSaleInputSchema,
  createReturnInputSchema,
  requestRefundInputSchema,
  decideRefundInputSchema,
  type CreateSaleInput,
  type HoldSaleInput,
  type CreateReturnInput,
  type RequestRefundInput,
  type DecideRefundInput,
} from '@/lib/sales/schemas'
import { getHeldSaleItems } from '@/lib/sales/queries'

/**
 * The atomic sale/return/refund mutations behind this milestone's Server
 * Actions — same `requirePermission() -> resolve/calculate -> rpc ->
 * recordAuditEvent()` shape as lib/inventory/mutations.ts. The real
 * atomicity/concurrency/idempotency guarantees live in Postgres
 * (create_sale()/create_return()/request_refund()/decide_refund() in
 * supabase/migrations/20260823120800_create_sales_functions.sql) — these
 * are permission-checked, price-resolving, total-calculating wrappers
 * around those RPCs, never a re-implementation of what they guarantee.
 */

async function resolveLinePrice(
  productId: string,
  variantId: string | null | undefined,
  branchId: string,
): Promise<number> {
  const parentPrice = await resolveEffectivePrice(productId, branchId)
  if (!variantId) return parentPrice

  const supabase = await createServerSupabaseClient()
  const { data: variant, error } = await supabase
    .from('product_variants')
    .select('base_price')
    .eq('id', variantId)
    .maybeSingle<{ base_price: string | number | null }>()
  if (error) throw error

  const variantBasePrice =
    variant?.base_price === null || variant?.base_price === undefined
      ? null
      : Number(variant.base_price)
  return resolveVariantPrice(variantBasePrice, parentPrice)
}

export interface CompletedSale {
  id: string
  total: number
}

export async function createSale(
  organizationId: string,
  input: CreateSaleInput,
): Promise<CompletedSale> {
  const parsed = createSaleInputSchema.parse(input)
  const user = await requirePermission('sales.create', {
    organizationId,
    branchId: parsed.branchId,
  })

  const posConfig = await getBusinessUnitPosConfig(parsed.businessUnitId)
  if (!posConfig) {
    throw new Error('This business unit has no POS configuration yet.')
  }

  // Never trust a client-supplied unit price — every line is re-priced here
  // from Milestone 06's resolveEffectivePrice()/resolveVariantPrice(), per
  // this milestone's Security Requirements.
  const priced: SaleLineItemCalcInput[] = await Promise.all(
    parsed.items.map(async (item) => ({
      quantity: item.quantity,
      unitPrice: await resolveLinePrice(item.productId, item.variantId, parsed.branchId),
    })),
  )

  const discountRequested = (parsed.discountAmount ?? 0) > 0 || (parsed.discountPercentage ?? 0) > 0
  if (discountRequested) {
    await requirePermission('discount.apply', { organizationId, branchId: parsed.branchId })

    if (posConfig.discountReasonRequired && !parsed.discountReason) {
      throw new Error('A reason is required to apply a discount.')
    }
  }

  const totals = calculateSaleTotals(
    priced,
    { amount: parsed.discountAmount, percentage: parsed.discountPercentage },
    posConfig,
  )

  const exceedsPolicy =
    totals.discountAmount > 0 &&
    (posConfig.discountRequiresAuthorization ||
      (totals.subtotal > 0 &&
        totals.discountAmount / totals.subtotal > posConfig.discountMaxPercentage / 100) ||
      (posConfig.discountMaxAmount !== null && totals.discountAmount > posConfig.discountMaxAmount))

  if (exceedsPolicy) {
    await requirePermission('discount.override', { organizationId, branchId: parsed.branchId })
  }

  // The capability gate only answers "does this Business Unit offer store
  // credit at all". Whether *this customer* can actually cover the total is
  // decided inside create_sale() -> record_store_credit_entry(), under a row
  // lock, in the same transaction as the sale — see
  // supabase/migrations/20260823130800_alter_sales_functions_add_customer_
  // and_store_credit.sql. Milestone 09 replaced this milestone's original
  // balance-blind stub; there is deliberately no balance check here, because
  // a check outside that lock could only ever be stale.
  if (parsed.paymentMethod === 'store_credit') {
    const capabilities = await listBusinessUnitCapabilities(parsed.businessUnitId)
    const storeCreditEnabled = capabilities.some((c) => c.key === 'store_credit' && c.enabled)
    if (!storeCreditEnabled) {
      throw new Error('Store credit is not enabled for this business unit.')
    }
  }

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('create_sale', {
    p_organization_id: organizationId,
    p_branch_id: parsed.branchId,
    p_business_unit_id: parsed.businessUnitId,
    p_idempotency_key: parsed.idempotencyKey,
    p_items: totals.lineItems.map((line, index) => ({
      product_id: parsed.items[index]!.productId,
      variant_id: parsed.items[index]!.variantId ?? null,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      line_discount: line.lineDiscount,
      line_total: line.lineTotal,
    })),
    p_subtotal: totals.subtotal,
    p_discount_amount: totals.discountAmount,
    p_discount_reason: parsed.discountReason ?? null,
    p_tax_amount: totals.taxAmount,
    p_service_charge_amount: totals.serviceChargeAmount,
    p_total: totals.total,
    p_payment_method: parsed.paymentMethod,
    p_payment_amount: totals.total,
    p_payment_reference: parsed.paymentReference ?? null,
    p_customer_id: parsed.customerId ?? null,
  })
  if (error) throw error
  const sale = data as { id: string; total: string | number }

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'sales.sale_created',
      resourceType: 'sale',
      resourceId: sale.id,
      metadata: {
        branchId: parsed.branchId,
        businessUnitId: parsed.businessUnitId,
        itemCount: parsed.items.length,
        total: Number(sale.total),
        paymentMethod: parsed.paymentMethod,
        discountAmount: totals.discountAmount,
        customerId: parsed.customerId ?? null,
      },
    },
    supabase,
  )

  // Post-commit, after create_sale() has already succeeded — the highest-
  // volume low-stock producer in the app, and the reason notify_low_stock()
  // guards on branch access rather than inventory.adjust: a cashier
  // completing a sale holds sales.create, not inventory.adjust, and must
  // still be able to trigger this. Never throws, so checkout cannot fail
  // because of it.
  await notifyLowStock({
    organizationId,
    branchId: parsed.branchId,
    productIds: parsed.items.map((item) => item.productId),
  })

  return { id: sale.id, total: Number(sale.total) }
}

export async function holdSale(
  organizationId: string,
  input: HoldSaleInput,
): Promise<{ id: string }> {
  const parsed = holdSaleInputSchema.parse(input)
  const user = await requirePermission('sales.create', {
    organizationId,
    branchId: parsed.branchId,
  })

  const supabase = await createServerSupabaseClient()
  const { data: heldSale, error } = await supabase
    .from('held_sales')
    .insert({
      organization_id: organizationId,
      branch_id: parsed.branchId,
      business_unit_id: parsed.businessUnitId,
      label: parsed.label ?? null,
      created_by: user.id,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw error

  const { error: itemsError } = await supabase.from('held_sale_items').insert(
    parsed.items.map((item) => ({
      held_sale_id: heldSale.id,
      product_id: item.productId,
      variant_id: item.variantId ?? null,
      quantity: item.quantity,
    })),
  )
  if (itemsError) throw itemsError

  return { id: heldSale.id }
}

export interface ResumedCartLine {
  productId: string
  variantId: string | null
  name: string
  unitPrice: number
  quantity: number
}

/**
 * Loads a held sale's items back into cart-ready shape (name + a freshly
 * re-resolved current price — never the price that happened to be current
 * when the sale was held) and discards the hold. Resolving price again
 * here, rather than snapshotting one at hold time, matches this milestone's
 * own price-snapshot boundary: a snapshot is only taken at the moment a
 * sale actually completes (create_sale()), never for a still-in-progress
 * draft.
 */
export async function resumeHeldSale(
  organizationId: string,
  branchId: string,
  heldSaleId: string,
): Promise<ResumedCartLine[]> {
  await requirePermission('sales.create', { organizationId, branchId })

  const items = await getHeldSaleItems(heldSaleId)

  const supabase = await createServerSupabaseClient()
  const productIds = items.map((item) => item.productId)
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name')
    .in('id', productIds)
  if (productsError) throw productsError
  const nameById = new Map((products ?? []).map((p) => [p.id as string, p.name as string]))

  const resolved = await Promise.all(
    items.map(async (item) => ({
      productId: item.productId,
      variantId: item.variantId,
      name: nameById.get(item.productId) ?? 'Unknown product',
      unitPrice: await resolveLinePrice(item.productId, item.variantId, branchId),
      quantity: item.quantity,
    })),
  )

  const { error } = await supabase.from('held_sales').delete().eq('id', heldSaleId)
  if (error) throw error

  return resolved
}

export async function discardHeldSale(
  organizationId: string,
  branchId: string,
  heldSaleId: string,
): Promise<void> {
  await requirePermission('sales.cancel', { organizationId, branchId })

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('held_sales').delete().eq('id', heldSaleId)
  if (error) throw error
}

export async function createReturn(
  organizationId: string,
  branchId: string,
  input: CreateReturnInput,
): Promise<{ id: string }> {
  const parsed = createReturnInputSchema.parse(input)
  const user = await requirePermission('returns.create', { organizationId, branchId })

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('create_return', {
    p_sale_id: parsed.saleId,
    p_reason: parsed.reason,
    p_items: parsed.items.map((item) => ({
      sale_item_id: item.saleItemId,
      quantity: item.quantity,
      reason: item.reason ?? null,
    })),
  })
  if (error) throw error
  const returnRecord = data as { id: string }

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'sales.return_created',
      resourceType: 'return',
      resourceId: returnRecord.id,
      metadata: { saleId: parsed.saleId, itemCount: parsed.items.length, reason: parsed.reason },
    },
    supabase,
  )

  return { id: returnRecord.id }
}

export async function requestRefund(
  organizationId: string,
  branchId: string,
  input: RequestRefundInput,
): Promise<{ id: string }> {
  const parsed = requestRefundInputSchema.parse(input)
  const user = await requirePermission('refund.initiate', { organizationId, branchId })

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('request_refund', {
    p_sale_id: parsed.saleId,
    p_return_id: parsed.returnId ?? null,
    p_amount: parsed.amount,
    p_method: parsed.method,
    p_reason: parsed.reason,
  })
  if (error) throw error
  const refund = data as { id: string }

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'sales.refund_requested',
      resourceType: 'refund',
      resourceId: refund.id,
      metadata: { saleId: parsed.saleId, amount: parsed.amount, method: parsed.method },
    },
    supabase,
  )

  return { id: refund.id }
}

export async function approveRefund(
  organizationId: string,
  branchId: string,
  input: DecideRefundInput,
): Promise<void> {
  const parsed = decideRefundInputSchema.parse(input)
  const user = await requirePermission('refund.approve', { organizationId, branchId })

  const supabase = await createServerSupabaseClient()

  // Belt-and-suspenders: even though only refund.approve holders reach this
  // line, don't let a request initiated by the *same* user auto-approve
  // unless their own role also grants refund.initiate at the same scope —
  // i.e. self-approval is only possible for a role whose permission grants
  // already make that "policy allows it" (this milestone's plan doc).
  const { data: refundRow, error: refundLookupError } = await supabase
    .from('refunds')
    .select('initiated_by')
    .eq('id', parsed.refundId)
    .maybeSingle<{ initiated_by: string | null }>()
  if (refundLookupError) throw refundLookupError
  if (refundRow?.initiated_by === user.id) {
    await requirePermission('refund.initiate', { organizationId, branchId })
  }

  const { data, error } = await supabase.rpc('decide_refund', {
    p_refund_id: parsed.refundId,
    p_approved: parsed.approved,
  })
  if (error) throw error
  const refund = data as { id: string; status: string; amount: string | number }

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: parsed.approved ? 'sales.refund_approved' : 'sales.refund_rejected',
      resourceType: 'refund',
      resourceId: refund.id,
      metadata: { status: refund.status, amount: Number(refund.amount) },
    },
    supabase,
  )
}
