import { getCurrentUserContext } from '@/lib/auth/context'
import { resolvePermission } from '@/lib/auth/permissions'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Read-side queries for this milestone's domain (docs/milestones/
 * 07-inventory-and-stock-management.md). Same shape as
 * lib/products/queries.ts: RLS is the enforced visibility boundary, these
 * functions exist for query precision and for the one non-RLS-expressible
 * rule this milestone inherits from Milestone 06 — inventory valuation
 * (quantity x cost price) is redacted for any caller lacking
 * `products.view_cost_price`, the same sensitivity Milestone 06 already
 * established for cost price itself.
 */

export interface InventoryBalance {
  id: string
  branchId: string
  businessUnitId: string
  productId: string
  productName: string
  sku: string
  variantId: string | null
  variantName: string | null
  quantity: number
  reservedQuantity: number
  availableQuantity: number
  lowStockThreshold: number | null
  updatedAt: string
}

export interface InventoryMovementEntry {
  id: string
  branchId: string
  productId: string
  productName: string
  variantId: string | null
  variantName: string | null
  movementType: string
  quantityDelta: number
  quantityAfter: number
  reason: string | null
  referenceType: string | null
  referenceId: string | null
  createdAt: string
}

export interface Batch {
  id: string
  branchId: string
  productId: string
  variantId: string | null
  batchNumber: string
  expiryDate: string | null
  quantity: number
  createdAt: string
}

interface BalanceRow {
  id: string
  branch_id: string
  business_unit_id: string
  product_id: string
  variant_id: string | null
  quantity: string | number
  reserved_quantity: string | number
  available_quantity: string | number
  low_stock_threshold: string | number | null
  updated_at: string
  products: { name: string; sku: string } | null
  product_variants: { name: string } | null
}

function mapBalanceRow(row: BalanceRow): InventoryBalance {
  return {
    id: row.id,
    branchId: row.branch_id,
    businessUnitId: row.business_unit_id,
    productId: row.product_id,
    productName: row.products?.name ?? '',
    sku: row.products?.sku ?? '',
    variantId: row.variant_id,
    variantName: row.product_variants?.name ?? null,
    quantity: Number(row.quantity),
    reservedQuantity: Number(row.reserved_quantity),
    availableQuantity: Number(row.available_quantity),
    lowStockThreshold: row.low_stock_threshold === null ? null : Number(row.low_stock_threshold),
    updatedAt: row.updated_at,
  }
}

const balanceSelect =
  'id, branch_id, business_unit_id, product_id, variant_id, quantity, reserved_quantity, available_quantity, low_stock_threshold, updated_at, products(name, sku), product_variants(name)'

export async function listInventoryBalances(branchId: string): Promise<InventoryBalance[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('inventory_balances')
    .select(balanceSelect)
    .eq('branch_id', branchId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as unknown as BalanceRow[]).map(mapBalanceRow)
}

/**
 * Below its configured threshold — a null threshold means "not configured",
 * never "low".
 *
 * The predicate is `available_quantity`, not `quantity`. `reserved_quantity`
 * is stock already committed to a layaway or an open order, so it cannot be
 * sold to anyone else; a threshold measured against raw on-hand quantity
 * claims you have stock you are not actually able to move. Milestone 10's
 * report RPC already took this position
 * (supabase/migrations/20260823141000_create_report_functions.sql), and
 * Milestone 12 made it the single rule everywhere — this query, the inventory
 * view's badge, and public.notify_low_stock() all read the same way.
 */
export async function listLowStockBalances(branchId: string): Promise<InventoryBalance[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('inventory_balances')
    .select(balanceSelect)
    .eq('branch_id', branchId)
    .not('low_stock_threshold', 'is', null)
    .order('available_quantity', { ascending: true })

  if (error) throw error
  return ((data ?? []) as unknown as BalanceRow[])
    .filter((row) => Number(row.available_quantity) <= Number(row.low_stock_threshold))
    .map(mapBalanceRow)
}

interface MovementHistoryRow {
  id: string
  branch_id: string
  product_id: string
  variant_id: string | null
  movement_type: string
  quantity_delta: string | number
  quantity_after: string | number
  reason: string | null
  reference_type: string | null
  reference_id: string | null
  created_at: string
  products: { name: string } | null
  product_variants: { name: string } | null
}

export async function listMovementHistory(
  branchId: string,
  filters: { productId?: string; limit?: number } = {},
): Promise<InventoryMovementEntry[]> {
  const supabase = await createServerSupabaseClient()
  let query = supabase
    .from('inventory_movements')
    .select(
      'id, branch_id, product_id, variant_id, movement_type, quantity_delta, quantity_after, reason, reference_type, reference_id, created_at, products(name), product_variants(name)',
    )
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 100)

  if (filters.productId) {
    query = query.eq('product_id', filters.productId)
  }

  const { data, error } = await query
  if (error) throw error

  return ((data ?? []) as unknown as MovementHistoryRow[]).map((row) => ({
    id: row.id,
    branchId: row.branch_id,
    productId: row.product_id,
    productName: row.products?.name ?? '',
    variantId: row.variant_id,
    variantName: row.product_variants?.name ?? null,
    movementType: row.movement_type,
    quantityDelta: Number(row.quantity_delta),
    quantityAfter: Number(row.quantity_after),
    reason: row.reason,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    createdAt: row.created_at,
  }))
}

export async function listBatches(branchId: string, productId: string): Promise<Batch[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('batches')
    .select(
      'id, branch_id, product_id, variant_id, batch_number, expiry_date, quantity, created_at',
    )
    .eq('branch_id', branchId)
    .eq('product_id', productId)
    .order('expiry_date', { ascending: true, nullsFirst: false })

  if (error) throw error
  return (
    (data ?? []) as Array<{
      id: string
      branch_id: string
      product_id: string
      variant_id: string | null
      batch_number: string
      expiry_date: string | null
      quantity: string | number
      created_at: string
    }>
  ).map((row) => ({
    id: row.id,
    branchId: row.branch_id,
    productId: row.product_id,
    variantId: row.variant_id,
    batchNumber: row.batch_number,
    expiryDate: row.expiry_date,
    quantity: Number(row.quantity),
    createdAt: row.created_at,
  }))
}

export interface BranchProductOption {
  id: string
  businessUnitId: string
  name: string
  sku: string
}

/**
 * Every non-archived product belonging to any Business Unit at `branchId` —
 * the destination-side picker in components/inventory/stock-transfer-
 * dialog.tsx (this milestone's key structural decision: a transfer credits
 * a *different* product row at the destination branch, see this
 * milestone's plan doc / supabase/migrations/20260823110200_create_stock_
 * transfers.sql). No cost price here — the picker only needs identity, and
 * cost price's own view-permission gating (lib/products/queries.ts's
 * canViewCostPrice()) isn't relevant to choosing which product to credit.
 */
export async function listBranchProductOptions(branchId: string): Promise<BranchProductOption[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('products')
    .select('id, name, sku, business_unit_id, business_units!inner(branch_id)')
    .eq('business_units.branch_id', branchId)
    .is('archived_at', null)
    .order('name')

  if (error) throw error
  return (
    (data ?? []) as unknown as Array<{
      id: string
      name: string
      sku: string
      business_unit_id: string
    }>
  ).map((row) => ({
    id: row.id,
    businessUnitId: row.business_unit_id,
    name: row.name,
    sku: row.sku,
  }))
}

/**
 * Quantity x cost price, summed across a branch's balances (this
 * milestone's Scope: "Inventory valuation basics"). Cost price is read
 * directly off `products`/`product_variants` — not
 * lib/products/pricing.ts's resolveEffectivePrice(), which resolves *sale*
 * price via branch overrides, a different value than cost. Returns null for
 * any caller lacking `products.view_cost_price`, the same redaction
 * lib/products/queries.ts's canViewCostPrice() already applies to cost
 * price itself.
 */
export async function getInventoryValuation(
  organizationId: string,
  businessUnitId: string,
  branchId: string,
): Promise<number | null> {
  const { grants } = await getCurrentUserContext()
  const canView = resolvePermission(grants, 'products.view_cost_price', {
    organizationId,
    businessUnitId,
  })
  if (!canView) return null

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('inventory_balances')
    .select('quantity, products(cost_price), product_variants(cost_price)')
    .eq('branch_id', branchId)

  if (error) throw error

  return (
    (data ?? []) as unknown as Array<{
      quantity: string | number
      products: { cost_price: string | number } | null
      product_variants: { cost_price: string | number | null } | null
    }>
  ).reduce((total, row) => {
    const unitCost = row.product_variants?.cost_price ?? row.products?.cost_price ?? 0
    return total + Number(row.quantity) * Number(unitCost)
  }, 0)
}
