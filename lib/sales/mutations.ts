import { requirePermission } from '@/lib/auth/guard'
import { recordAuditEvent } from '@/lib/auth/audit'
import { logger } from '@/lib/logger'
import { notifyLowStock } from '@/lib/notifications/low-stock'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { consumeRateLimit, RateLimitError } from '@/lib/rate-limit/limiter'
import { resolveEffectivePrice, resolveVariantPrice } from '@/lib/products/pricing'
import {
  getBusinessUnitPosConfig,
  listBusinessUnitCapabilities,
} from '@/lib/business-structure/queries'
import { calculateSaleTotals, type SaleLineItemCalcInput } from '@/lib/sales/calculations'
import { findRedeemableCoupon } from '@/lib/coupons/queries'
import { InsufficientStockError } from '@/lib/errors'
import type { SupabaseClient } from '@supabase/supabase-js'
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

/**
 * recordAuditEvent() throws on failure (a plain PostgrestError object) — the
 * right behaviour for a pre-commit caller, but wrong here: every audit call
 * in this file runs AFTER its RPC has already committed the sale / return /
 * refund. A thrown audit error would make a completed sale report as failed,
 * the cart never clears, and the cashier retries — creating a duplicate.
 *
 * So the post-commit audit write is best-effort, logged at error and
 * swallowed, exactly like notifyLowStock()'s "never throws" contract
 * (lib/notifications/low-stock.ts) and for the same reason.
 */
async function recordAuditEventPostCommit(
  ...args: Parameters<typeof recordAuditEvent>
): Promise<void> {
  try {
    await recordAuditEvent(...args)
  } catch (error) {
    logger.error('audit.write_failed_post_commit', {
      action: args[0]?.action,
      resourceId: args[0]?.resourceId ?? null,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

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

interface StockCheckItem {
  productId: string
  variantId?: string | null
  quantity: number
}

/**
 * Advisory pre-check so an insufficient-stock rejection can name the
 * products. Sums the requested quantity per (product, variant), compares it
 * to inventory_balances.available_quantity, and throws
 * InsufficientStockError listing every line that comes up short. A missing
 * balance row counts as zero available.
 *
 * Milestone 17 Part B: a product with `track_inventory = false` (a service
 * line item) is dropped from the check entirely — it has no stock, and
 * create_sale() skips its deduction for the same reason.
 */
async function assertStockAvailable(
  supabase: SupabaseClient,
  branchId: string,
  items: StockCheckItem[],
): Promise<void> {
  const productIds = [...new Set(items.map((item) => item.productId))]

  const { data: trackRows, error: trackError } = await supabase
    .from('products')
    .select('id, track_inventory')
    .in('id', productIds)
  if (trackError) throw trackError

  const nonTracked = new Set(
    ((trackRows ?? []) as Array<{ id: string; track_inventory: boolean }>)
      .filter((row) => row.track_inventory === false)
      .map((row) => row.id),
  )

  const requested = new Map<string, { productId: string; variantId: string | null; qty: number }>()
  for (const item of items) {
    if (nonTracked.has(item.productId)) continue
    const variantId = item.variantId ?? null
    const key = `${item.productId}:${variantId}`
    const existing = requested.get(key)
    if (existing) existing.qty += item.quantity
    else requested.set(key, { productId: item.productId, variantId, qty: item.quantity })
  }

  if (requested.size === 0) return

  const { data, error } = await supabase
    .from('inventory_balances')
    .select('product_id, variant_id, available_quantity, products(name)')
    .eq('branch_id', branchId)
    .in('product_id', [...new Set(items.map((item) => item.productId))])
  if (error) throw error

  const available = new Map<string, { name: string; qty: number }>()
  for (const row of (data ?? []) as unknown as Array<{
    product_id: string
    variant_id: string | null
    available_quantity: string | number
    products: { name: string } | null
  }>) {
    available.set(`${row.product_id}:${row.variant_id ?? null}`, {
      name: row.products?.name ?? 'this product',
      qty: Number(row.available_quantity),
    })
  }

  const short: { productId: string; name: string; available: number; requested: number }[] = []
  for (const [key, want] of requested) {
    const have = available.get(key)
    if (!have || have.qty < want.qty) {
      short.push({
        productId: want.productId,
        name: have?.name ?? '',
        available: have?.qty ?? 0,
        requested: want.qty,
      })
    }
  }
  if (short.length === 0) return

  // Fill in names for products with no balance row at all.
  const unnamed = short.filter((s) => !s.name).map((s) => s.productId)
  if (unnamed.length > 0) {
    const { data: names } = await supabase
      .from('products')
      .select('id, name')
      .in('id', [...new Set(unnamed)])
    const byId = new Map((names ?? []).map((row) => [row.id as string, row.name as string]))
    for (const s of short) if (!s.name) s.name = byId.get(s.productId) ?? 'this product'
  }

  throw new InsufficientStockError(
    short.map((s) => ({ name: s.name, available: s.available, requested: s.requested })),
  )
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

  // Milestone 15 Acceptance Criteria: "Rate limiting is in place on login,
  // webhook, and checkout endpoints."
  //
  // Keyed on the cashier's user id, and that choice matters more here than
  // the number does. A busy supermarket runs many tills behind ONE NAT'd
  // public IP, so an IP key would let one fast lane throttle the whole
  // store; an organization key would be worse still. Per-cashier, the limit
  // (120/minute — see lib/rate-limit/config.ts) is roughly two sales per
  // second sustained: unreachable by a human scanning and taking payment,
  // trivially reached by a runaway client loop or a replayed token.
  //
  // Deliberately AFTER requirePermission(), so unauthenticated or
  // unauthorized traffic never consumes a slot from a legitimate cashier's
  // bucket.
  const supabase = await createServerSupabaseClient()
  if (!(await consumeRateLimit(supabase, 'checkout', user.id))) {
    throw new RateLimitError('checkout')
  }

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

  // Name the products that are short BEFORE calling create_sale(): its P0001
  // is quantity-only and aborts on the first failing line, so the cashier
  // never learns which items to pull. This read is advisory — create_sale()
  // still does the authoritative, row-locked deduction — so a race that slips
  // between here and there just falls back to the generic P0001 message.
  await assertStockAvailable(supabase, parsed.branchId, parsed.items)

  // The MANUAL (till) discount gates on discount.apply / discount.override and
  // the reason requirement. A redeemed coupon is separate: it is
  // pre-authorized by whoever created it (coupons.manage), so it needs no
  // discount permission and no reason, and is exempt from the policy-limit
  // override check below.
  const discountRequested = (parsed.discountAmount ?? 0) > 0 || (parsed.discountPercentage ?? 0) > 0
  if (discountRequested) {
    await requirePermission('discount.apply', { organizationId, branchId: parsed.branchId })

    if (posConfig.discountReasonRequired && !parsed.discountReason) {
      throw new Error('A reason is required to apply a discount.')
    }
  }

  const manualOnly = calculateSaleTotals(
    priced,
    { amount: parsed.discountAmount, percentage: parsed.discountPercentage },
    posConfig,
  )

  // Resolve the coupon against the pre-discount subtotal. Re-checked (and its
  // redemption counted) under a row lock inside create_sale() — this is the
  // friendly early failure and the amount source.
  let couponId: string | null = null
  let couponAmount = 0
  if (parsed.couponCode) {
    const result = await findRedeemableCoupon(
      organizationId,
      parsed.couponCode,
      manualOnly.subtotal,
    )
    if (!result.ok) throw new Error(result.reason)
    couponId = result.coupon.id
    couponAmount = result.discountAmount
  }

  const totals = calculateSaleTotals(
    priced,
    { amount: parsed.discountAmount, percentage: parsed.discountPercentage, couponAmount },
    posConfig,
  )

  const manualDiscountAmount = manualOnly.discountAmount
  const exceedsPolicy =
    manualDiscountAmount > 0 &&
    (posConfig.discountRequiresAuthorization ||
      (manualOnly.subtotal > 0 &&
        manualDiscountAmount / manualOnly.subtotal > posConfig.discountMaxPercentage / 100) ||
      (posConfig.discountMaxAmount !== null && manualDiscountAmount > posConfig.discountMaxAmount))

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
    p_coupon_id: couponId,
  })
  if (error) {
    // Milestone 16 observability spot-check: the single most important
    // operation in the product emitted nothing on failure — a create_sale()
    // rejection (insufficient stock P0001, product/BU mismatch P0002, bad
    // quantity P0004) surfaced only as a thrown error with no log line. The
    // Postgres errcode is enough to triage from Vercel logs; cart contents
    // and customer identity are deliberately not logged.
    logger.warn('sale.rejected', {
      branchId: parsed.branchId,
      businessUnitId: parsed.businessUnitId,
      itemCount: parsed.items.length,
      errcode: (error as { code?: string }).code ?? null,
    })
    throw error
  }
  const sale = data as { id: string; total: string | number }

  logger.info('sale.created', {
    saleId: sale.id,
    branchId: parsed.branchId,
    businessUnitId: parsed.businessUnitId,
    itemCount: parsed.items.length,
    total: Number(sale.total),
  })

  await recordAuditEventPostCommit(
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
        couponId,
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

  await recordAuditEventPostCommit(
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

  await recordAuditEventPostCommit(
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

  await recordAuditEventPostCommit(
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
