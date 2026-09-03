import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { SaleListEntry } from '@/lib/sales/sale-list'

/**
 * Read-side queries for this milestone's domain (docs/milestones/
 * 08-pos-transaction-engine.md). Same shape as lib/inventory/queries.ts —
 * RLS is the enforced visibility boundary; these functions exist for query
 * precision (joining child rows, computing "remaining returnable quantity")
 * rather than as a second authorization layer.
 */

export interface SaleItem {
  id: string
  productId: string
  productName: string
  variantId: string | null
  quantity: number
  unitPrice: number
  lineDiscount: number
  lineTotal: number
  /** quantity already covered by prior return_items rows against this line. */
  returnedQuantity: number
}

export interface Payment {
  id: string
  method: string
  amount: number
  reference: string | null
  createdAt: string
}

export interface Sale {
  id: string
  branchId: string
  businessUnitId: string
  subtotal: number
  discountAmount: number
  discountReason: string | null
  taxAmount: number
  serviceChargeAmount: number
  total: number
  createdAt: string
  createdBy: string | null
  /** The cashier's display name, for the receipt's optional "Served by"
   *  line (Milestone 11's receipt_show_cashier setting). Null whenever
   *  createdBy is null, or (rarely) if the user row has since been removed. */
  createdByName: string | null
  /**
   * The selling branch's name and contact details, for the receipt header
   * block under the business name (20260903090200). Address/phone are null
   * when the branch has not set its own — the renderer falls back to the
   * organization's. A separate sub-query in getSale(), same additive shape
   * as createByName above.
   */
  branchName: string | null
  branchAddressLine: string | null
  branchContactPhone: string | null
  /** The redeemed coupon's code, for the receipt's discount line. Null when no coupon. */
  couponCode: string | null
  items: SaleItem[]
  payments: Payment[]
}

interface SaleRow {
  id: string
  branch_id: string
  business_unit_id: string
  subtotal: string | number
  discount_amount: string | number
  discount_reason: string | null
  tax_amount: string | number
  service_charge_amount: string | number
  total: string | number
  created_at: string
  created_by: string | null
  coupon_id: string | null
}

interface SaleItemRow {
  id: string
  sale_id: string
  product_id: string
  variant_id: string | null
  quantity: string | number
  unit_price: string | number
  line_discount: string | number
  line_total: string | number
  products: { name: string } | null
}

interface PaymentRow {
  id: string
  sale_id: string
  method: string
  amount: string | number
  reference: string | null
  created_at: string
}

/**
 * Full sale detail — items (with returned-quantity computed against
 * return_items) and payment(s) — the shape both the receipt view and the
 * returns screen's "find original sale" step need.
 */
export async function getSale(saleId: string): Promise<Sale | null> {
  const supabase = await createServerSupabaseClient()

  const { data: saleRow, error: saleError } = await supabase
    .from('sales')
    .select(
      'id, branch_id, business_unit_id, subtotal, discount_amount, discount_reason, tax_amount, service_charge_amount, total, created_at, created_by, coupon_id',
    )
    .eq('id', saleId)
    .maybeSingle<SaleRow>()
  if (saleError) throw saleError
  if (!saleRow) return null

  const { data: itemRows, error: itemsError } = await supabase
    .from('sale_items')
    .select(
      'id, sale_id, product_id, variant_id, quantity, unit_price, line_discount, line_total, products(name)',
    )
    .eq('sale_id', saleId)
  if (itemsError) throw itemsError

  const { data: returnItemRows, error: returnItemsError } = await supabase
    .from('return_items')
    .select('sale_item_id, quantity')
    .in(
      'sale_item_id',
      (itemRows ?? []).map((row) => row.id),
    )
  if (returnItemsError) throw returnItemsError

  const returnedBySaleItem = new Map<string, number>()
  for (const row of (returnItemRows ?? []) as Array<{
    sale_item_id: string
    quantity: string | number
  }>) {
    returnedBySaleItem.set(
      row.sale_item_id,
      (returnedBySaleItem.get(row.sale_item_id) ?? 0) + Number(row.quantity),
    )
  }

  const { data: paymentRows, error: paymentsError } = await supabase
    .from('payments')
    .select('id, sale_id, method, amount, reference, created_at')
    .eq('sale_id', saleId)
  if (paymentsError) throw paymentsError

  // A separate query, not an embed on the `sales` select above: `sales` has
  // no foreign-key hint disambiguation issue here (only one `created_by`),
  // but keeping this additive rather than touching the existing select
  // string is what keeps this a pure extension of Milestone 08's query, per
  // this milestone's Technical Requirements ("reuses Milestone 08's receipt
  // data model, only adding presentation/template selection on top").
  let createdByName: string | null = null
  if (saleRow.created_by) {
    const { data: creator } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', saleRow.created_by)
      .maybeSingle<{ full_name: string }>()
    createdByName = creator?.full_name ?? null
  }

  // Additive, like createdByName: keeps getSale a pure extension rather than
  // reworking the sales select. RLS already scoped saleRow to a branch the
  // caller can see, so this row is always readable.
  const { data: branchRow } = await supabase
    .from('branches')
    .select('name, address_line, contact_phone')
    .eq('id', saleRow.branch_id)
    .maybeSingle<{ name: string; address_line: string | null; contact_phone: string | null }>()

  let couponCode: string | null = null
  if (saleRow.coupon_id) {
    const { data: couponRow } = await supabase
      .from('coupons')
      .select('code')
      .eq('id', saleRow.coupon_id)
      .maybeSingle<{ code: string }>()
    couponCode = couponRow?.code ?? null
  }

  return {
    id: saleRow.id,
    branchId: saleRow.branch_id,
    businessUnitId: saleRow.business_unit_id,
    branchName: branchRow?.name ?? null,
    branchAddressLine: branchRow?.address_line ?? null,
    branchContactPhone: branchRow?.contact_phone ?? null,
    couponCode,
    subtotal: Number(saleRow.subtotal),
    discountAmount: Number(saleRow.discount_amount),
    discountReason: saleRow.discount_reason,
    taxAmount: Number(saleRow.tax_amount),
    serviceChargeAmount: Number(saleRow.service_charge_amount),
    total: Number(saleRow.total),
    createdAt: saleRow.created_at,
    createdBy: saleRow.created_by,
    createdByName,
    items: ((itemRows ?? []) as unknown as SaleItemRow[]).map((row) => ({
      id: row.id,
      productId: row.product_id,
      productName: row.products?.name ?? 'Unknown product',
      variantId: row.variant_id,
      quantity: Number(row.quantity),
      unitPrice: Number(row.unit_price),
      lineDiscount: Number(row.line_discount),
      lineTotal: Number(row.line_total),
      returnedQuantity: returnedBySaleItem.get(row.id) ?? 0,
    })),
    payments: ((paymentRows ?? []) as PaymentRow[]).map((row) => ({
      id: row.id,
      method: row.method,
      amount: Number(row.amount),
      reference: row.reference,
      createdAt: row.created_at,
    })),
  }
}

/**
 * Find one sale for the returns screen from whatever the cashier has on the
 * receipt: either the full sale UUID or the 8-char "Receipt #" that
 * `shortSaleRef()` prints (the leading hex of the UUID — there is no separate
 * receipt-number column). A bare prefix is not a valid `uuid`, so
 * `getSale()`'s `.eq('id', ...)` throws Postgres `22P02` on it; this resolves
 * the prefix to a real id first, scoped to the caller's branch so two
 * branches' receipts can't collide on the same 8 characters.
 *
 * Returns null for "no match" and for an ambiguous prefix (2+ sales share it)
 * — the caller shows the same "Sale not found" state for both.
 */
export async function findSaleByRef(ref: string, branchId: string): Promise<Sale | null> {
  const trimmed = ref.trim()
  if (!trimmed) return null

  // A full UUID (32 hex digits once separators are stripped) — look it up directly.
  if (trimmed.replace(/[^0-9a-fA-F]/g, '').length === 32) {
    return getSale(trimmed)
  }

  const range = uuidPrefixRange(trimmed)
  if (!range) return null

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('sales')
    .select('id')
    .eq('branch_id', branchId)
    .gte('id', range.lo)
    .lt('id', range.hi)
    .limit(2)
  if (error) throw error

  const matches = (data ?? []) as Array<{ id: string }>
  if (matches.length !== 1) return null
  return getSale(matches[0]!.id)
}

/**
 * A hex prefix of a UUID (4–32 chars, non-hex stripped — so "7EE1A301" or
 * "7ee1-a301" both work) → the half-open [lo, hi) id range that prefix
 * covers. Returns null for a prefix too short to be a useful filter.
 *
 * `hi` is `lo` with its last supplied nibble incremented, carrying through
 * `f`; a prefix of all `f`s has no upper bound, so `hi` is the max uuid.
 */
function uuidPrefixRange(input: string): { lo: string; hi: string } | null {
  const hex = input.replace(/[^0-9a-fA-F]/g, '').toLowerCase()
  if (hex.length < 4 || hex.length > 32) return null

  const asUuid = (h: string) => {
    const padded = h.padEnd(32, '0')
    return `${padded.slice(0, 8)}-${padded.slice(8, 12)}-${padded.slice(12, 16)}-${padded.slice(16, 20)}-${padded.slice(20)}`
  }

  const chars = hex.split('')
  let i = chars.length - 1
  while (i >= 0 && chars[i] === 'f') {
    chars[i] = '0'
    i -= 1
  }
  const lo = asUuid(hex)
  const hi =
    i < 0
      ? 'ffffffff-ffff-ffff-ffff-ffffffffffff'
      : asUuid(chars.map((c, idx) => (idx === i ? (parseInt(c, 16) + 1).toString(16) : c)).join(''))
  return { lo, hi }
}

/** Filters the /sales list applies. All optional; an unset field is "no filter". */
export interface SalesFilter {
  /** Matches the receipt ref (a UUID prefix, case-insensitive) or the cashier name. */
  search?: string
  /** Inclusive lower bound on the sale date (an ISO date, local midnight). */
  from?: string
  /** Exclusive upper bound (the day AFTER the user's "to" date). */
  to?: string
  /** One of cash | card | transfer | store_credit. */
  paymentMethod?: string
}

/**
 * Completed sales for a branch, newest first — backs the /sales list screen.
 * Keeps to the same "separate queries, no fragile embed disambiguation"
 * shape as getSale(): the list is fetched with cheap aggregate embeds
 * (`sale_items(count)`, `payments(method)`, `returns(id)`), then cashier
 * display names are resolved in one batched `users` lookup.
 *
 * `before` is a simple keyset cursor (pass the last row's `createdAt`) for a
 * "Load more" button — DataTable has no built-in pagination. Filters compose
 * with the cursor: "Load more" carries the same filter forward.
 */
export async function listSales(
  branchId: string,
  options: { limit?: number; before?: string; filter?: SalesFilter } = {},
): Promise<SaleListEntry[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const filter = options.filter ?? {}
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('sales')
    .select('id, total, created_at, created_by, sale_items(count), payments(method), returns(id)')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (options.before) query = query.lt('created_at', options.before)
  if (filter.from) query = query.gte('created_at', filter.from)
  if (filter.to) query = query.lt('created_at', filter.to)

  // A payment-method filter needs the embed to be an inner join so a sale
  // with no matching payment row drops out entirely.
  if (filter.paymentMethod) {
    query = supabase
      .from('sales')
      .select(
        'id, total, created_at, created_by, sale_items(count), payments!inner(method), returns(id)',
      )
      .eq('branch_id', branchId)
      .eq('payments.method', filter.paymentMethod)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (options.before) query = query.lt('created_at', options.before)
    if (filter.from) query = query.gte('created_at', filter.from)
    if (filter.to) query = query.lt('created_at', filter.to)
  }

  // The search term matches the receipt ref (the UUID's leading hex, which is
  // what shortSaleRef() prints) OR a cashier name. A uuid column has no
  // `ilike`, so a hex prefix becomes a [lo, hi) range on `id`; the cashier
  // half resolves matching user ids first, so both are one filter on `sales`
  // rather than a join.
  const term = filter.search?.trim()
  if (term) {
    const { data: matchingUsers } = await supabase
      .from('users')
      .select('id')
      .ilike('full_name', `%${term}%`)
    const userIds = ((matchingUsers ?? []) as Array<{ id: string }>).map((u) => u.id)

    const range = uuidPrefixRange(term)
    const ors: string[] = []
    if (range) ors.push(`and(id.gte.${range.lo},id.lt.${range.hi})`)
    if (userIds.length > 0) ors.push(`created_by.in.(${userIds.join(',')})`)
    // Nothing could match — short-circuit rather than send an empty `or()`.
    if (ors.length === 0) return []
    query = query.or(ors.join(','))
  }

  const { data, error } = await query
  if (error) throw error

  const rows = (data ?? []) as unknown as Array<{
    id: string
    total: string | number
    created_at: string
    created_by: string | null
    sale_items: Array<{ count: number }>
    payments: Array<{ method: string }>
    returns: Array<{ id: string }> | null
  }>

  const creatorIds = [
    ...new Set(
      rows.map((row) => row.created_by).filter((value): value is string => Boolean(value)),
    ),
  ]
  const nameById = new Map<string, string>()
  if (creatorIds.length > 0) {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', creatorIds)
    if (usersError) throw usersError
    for (const user of (users ?? []) as Array<{ id: string; full_name: string | null }>) {
      if (user.full_name) nameById.set(user.id, user.full_name)
    }
  }

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    itemCount: row.sale_items?.[0]?.count ?? 0,
    total: Number(row.total),
    paymentMethods: [...new Set((row.payments ?? []).map((payment) => payment.method))],
    cashierName: row.created_by ? (nameById.get(row.created_by) ?? null) : null,
    returnCount: (row.returns ?? []).length,
  }))
}

export interface HeldSale {
  id: string
  branchId: string
  businessUnitId: string
  label: string | null
  createdAt: string
  itemCount: number
}

export async function listHeldSales(branchId: string): Promise<HeldSale[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('held_sales')
    .select('id, branch_id, business_unit_id, label, created_at, held_sale_items(count)')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (
    (data ?? []) as unknown as Array<{
      id: string
      branch_id: string
      business_unit_id: string
      label: string | null
      created_at: string
      held_sale_items: Array<{ count: number }>
    }>
  ).map((row) => ({
    id: row.id,
    branchId: row.branch_id,
    businessUnitId: row.business_unit_id,
    label: row.label,
    createdAt: row.created_at,
    itemCount: row.held_sale_items?.[0]?.count ?? 0,
  }))
}

export interface HeldSaleItem {
  productId: string
  variantId: string | null
  quantity: number
}

export async function getHeldSaleItems(heldSaleId: string): Promise<HeldSaleItem[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('held_sale_items')
    .select('product_id, variant_id, quantity')
    .eq('held_sale_id', heldSaleId)

  if (error) throw error
  return (
    (data ?? []) as Array<{
      product_id: string
      variant_id: string | null
      quantity: string | number
    }>
  ).map((row) => ({
    productId: row.product_id,
    variantId: row.variant_id,
    quantity: Number(row.quantity),
  }))
}

export interface PendingRefund {
  id: string
  saleId: string
  returnId: string | null
  amount: number
  method: string
  reason: string
  initiatedBy: string | null
  createdAt: string
}

export async function listPendingRefunds(branchId: string): Promise<PendingRefund[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('refunds')
    .select('id, sale_id, return_id, amount, method, reason, initiated_by, created_at')
    .eq('branch_id', branchId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) throw error
  return (
    (data ?? []) as Array<{
      id: string
      sale_id: string
      return_id: string | null
      amount: string | number
      method: string
      reason: string
      initiated_by: string | null
      created_at: string
    }>
  ).map((row) => ({
    id: row.id,
    saleId: row.sale_id,
    returnId: row.return_id,
    amount: Number(row.amount),
    method: row.method,
    reason: row.reason,
    initiatedBy: row.initiated_by,
    createdAt: row.created_at,
  }))
}
