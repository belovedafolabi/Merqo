import { createServerSupabaseClient } from '@/lib/supabase/server'

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
      'id, branch_id, business_unit_id, subtotal, discount_amount, discount_reason, tax_amount, service_charge_amount, total, created_at, created_by',
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

  return {
    id: saleRow.id,
    branchId: saleRow.branch_id,
    businessUnitId: saleRow.business_unit_id,
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
