import { cache } from 'react'

import { getCurrentUserContext } from '@/lib/auth/context'
import { resolvePermission } from '@/lib/auth/permissions'
import { logger } from '@/lib/logger'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Read-side queries for this milestone's domain (docs/milestones/
 * 06-product-catalog-and-pricing.md). Same shape as
 * lib/business-structure/queries.ts: RLS is the enforced visibility
 * boundary, these functions exist for query precision and for the
 * *additional*, non-RLS-expressible rule this milestone's Security
 * Requirements call for — cost price is redacted here, in the query layer,
 * for any caller lacking `products.view_cost_price`, so the value never
 * reaches a client component's props (the `<Can>`-gated UI is a second,
 * belt-and-suspenders layer on top of this, not the only one).
 */

export interface Category {
  id: string
  businessUnitId: string
  name: string
  description: string | null
  archivedAt: string | null
}

export interface Product {
  id: string
  businessUnitId: string
  categoryId: string | null
  categoryName: string | null
  name: string
  description: string | null
  sku: string
  barcode: string | null
  unitOfMeasurement: string
  /** null when the caller lacks `products.view_cost_price`. */
  costPrice: number | null
  basePrice: number
  archivedAt: string | null
}

export interface ProductVariant {
  id: string
  productId: string
  name: string
  sku: string | null
  barcode: string | null
  costPrice: number | null
  basePrice: number | null
  archivedAt: string | null
}

export interface BranchPriceOverride {
  id: string
  productId: string
  branchId: string
  branchName: string
  price: number
}

export interface PriceHistoryEntry {
  id: string
  productId: string
  branchId: string | null
  branchName: string | null
  price: number
  changedAt: string
}

async function canViewCostPrice(organizationId: string, businessUnitId: string): Promise<boolean> {
  const { grants } = await getCurrentUserContext()
  return resolvePermission(grants, 'products.view_cost_price', { organizationId, businessUnitId })
}

/**
 * The single branch a Business Unit's products belong to (Decision #3: a
 * product belongs to exactly one Business Unit, which belongs to exactly
 * one Branch) — what the product detail page needs to manage that
 * product's own branch_price_overrides row per this milestone's Scope.
 */
export async function getBusinessUnitBranch(
  businessUnitId: string,
): Promise<{ id: string; name: string } | null> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('business_units')
    .select('branches(id, name)')
    .eq('id', businessUnitId)
    .maybeSingle<{ branches: { id: string; name: string } | null }>()

  if (error) throw error
  return data?.branches ?? null
}

/**
 * Suggested starter category names for a Business Type
 * (business_type_category_suggestions, seeded reference data). Ordered by
 * `sort_order`. cache()-wrapped like the other reference-data reads — the
 * list is identical for every request with the same type id.
 *
 * The category manager filters these against the categories that already
 * exist and renders the remainder as one-tap "add" chips.
 */
export const listCategorySuggestions = cache(async (businessTypeId: string): Promise<string[]> => {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('business_type_category_suggestions')
    .select('name')
    .eq('business_type_id', businessTypeId)
    .order('sort_order')
    .order('name')

  if (error) throw error
  return (data ?? []).map((row) => row.name as string)
})

export async function listCategories(businessUnitId: string): Promise<Category[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('categories')
    .select('id, business_unit_id, name, description, archived_at')
    .eq('business_unit_id', businessUnitId)
    .order('archived_at', { ascending: true, nullsFirst: true })
    .order('name')

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    businessUnitId: row.business_unit_id,
    name: row.name,
    description: row.description,
    archivedAt: row.archived_at,
  }))
}

interface ProductRow {
  id: string
  business_unit_id: string
  category_id: string | null
  name: string
  description: string | null
  sku: string
  barcode: string | null
  unit_of_measurement: string
  cost_price: string | number
  base_price: string | number
  archived_at: string | null
  categories: { name: string } | null
}

function mapProductRow(row: ProductRow, includeCostPrice: boolean): Product {
  return {
    id: row.id,
    businessUnitId: row.business_unit_id,
    categoryId: row.category_id,
    categoryName: row.categories?.name ?? null,
    name: row.name,
    description: row.description,
    sku: row.sku,
    barcode: row.barcode,
    unitOfMeasurement: row.unit_of_measurement,
    costPrice: includeCostPrice ? Number(row.cost_price) : null,
    basePrice: Number(row.base_price),
    archivedAt: row.archived_at,
  }
}

export async function listProducts(
  organizationId: string,
  businessUnitId: string,
): Promise<Product[]> {
  const supabase = await createServerSupabaseClient()
  const includeCostPrice = await canViewCostPrice(organizationId, businessUnitId)

  const { data, error } = await supabase
    .from('products')
    .select(
      'id, business_unit_id, category_id, name, description, sku, barcode, unit_of_measurement, cost_price, base_price, archived_at, categories(name)',
    )
    .eq('business_unit_id', businessUnitId)
    .order('archived_at', { ascending: true, nullsFirst: true })
    .order('name')

  if (error) throw error
  return ((data ?? []) as unknown as ProductRow[]).map((row) =>
    mapProductRow(row, includeCostPrice),
  )
}

export interface RecentProduct {
  id: string
  name: string
  sku: string
  basePrice: number
  createdAt: string
}

/**
 * The most recently added products in a business unit — the dashboard's
 * "Recent products" widget. A dedicated slim query, not listProducts()
 * sliced: listProducts() has no created_at in its select or ordering and
 * carries cost price (which this never shows), so widening it for one widget
 * would be the wrong trade.
 */
export async function listRecentProducts(
  businessUnitId: string,
  limit = 5,
): Promise<RecentProduct[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('products')
    .select('id, name, sku, base_price, created_at')
    .eq('business_unit_id', businessUnitId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (
    (data ?? []) as Array<{
      id: string
      name: string
      sku: string
      base_price: string | number
      created_at: string
    }>
  ).map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    basePrice: Number(row.base_price),
    createdAt: row.created_at,
  }))
}

export async function getProduct(
  organizationId: string,
  productId: string,
): Promise<Product | null> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('products')
    .select(
      'id, business_unit_id, category_id, name, description, sku, barcode, unit_of_measurement, cost_price, base_price, archived_at, categories(name)',
    )
    .eq('id', productId)
    .maybeSingle<ProductRow>()

  if (error) throw error
  if (!data) return null

  const includeCostPrice = await canViewCostPrice(organizationId, data.business_unit_id)
  return mapProductRow(data, includeCostPrice)
}

/**
 * Exact-match barcode lookup — the fast path this milestone's Functional
 * Requirements call for ("Barcode lookup returns a match... fast enough to
 * support POS scanning speed requirements"), served by the B-tree unique
 * index on (business_unit_id, barcode)
 * (supabase/migrations/20260823100100_create_products.sql), not a full
 * table scan. Logs a structured miss per this milestone's Observability
 * requirement, without introducing an analytics service.
 */
export async function lookupProductByBarcode(
  businessUnitId: string,
  barcode: string,
): Promise<{ id: string; name: string; basePrice: number } | null> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('products')
    .select('id, name, base_price')
    .eq('business_unit_id', businessUnitId)
    .eq('barcode', barcode)
    .is('archived_at', null)
    .maybeSingle<{ id: string; name: string; base_price: string | number }>()

  if (error) throw error
  if (!data) {
    logger.info('products.barcode_lookup_miss', { businessUnitId, barcode })
    return null
  }

  return { id: data.id, name: data.name, basePrice: Number(data.base_price) }
}

/**
 * General product search — pg_trgm-backed `ilike` on name, plus a direct
 * SKU/barcode substring match, per this milestone's Technical Requirements
 * ("plain PostgreSQL indexes... no Elasticsearch/Algolia").
 */
export async function searchProducts(
  organizationId: string,
  businessUnitId: string,
  term: string,
): Promise<Product[]> {
  const supabase = await createServerSupabaseClient()
  const includeCostPrice = await canViewCostPrice(organizationId, businessUnitId)
  const like = `%${term}%`

  const { data, error } = await supabase
    .from('products')
    .select(
      'id, business_unit_id, category_id, name, description, sku, barcode, unit_of_measurement, cost_price, base_price, archived_at, categories(name)',
    )
    .eq('business_unit_id', businessUnitId)
    .is('archived_at', null)
    .or(`name.ilike.${like},sku.ilike.${like},barcode.ilike.${like}`)
    .order('name')
    .limit(50)

  if (error) throw error
  return ((data ?? []) as unknown as ProductRow[]).map((row) =>
    mapProductRow(row, includeCostPrice),
  )
}

export async function listProductVariants(productId: string): Promise<ProductVariant[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('product_variants')
    .select('id, product_id, name, sku, barcode, cost_price, base_price, archived_at')
    .eq('product_id', productId)
    .order('archived_at', { ascending: true, nullsFirst: true })
    .order('name')

  if (error) throw error
  return (
    (data ?? []) as Array<{
      id: string
      product_id: string
      name: string
      sku: string | null
      barcode: string | null
      cost_price: string | number | null
      base_price: string | number | null
      archived_at: string | null
    }>
  ).map((row) => ({
    id: row.id,
    productId: row.product_id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    costPrice: row.cost_price === null ? null : Number(row.cost_price),
    basePrice: row.base_price === null ? null : Number(row.base_price),
    archivedAt: row.archived_at,
  }))
}

export async function listBranchPriceOverrides(productId: string): Promise<BranchPriceOverride[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('branch_price_overrides')
    .select('id, product_id, branch_id, price, branches(name)')
    .eq('product_id', productId)

  if (error) throw error
  return (
    (data ?? []) as unknown as Array<{
      id: string
      product_id: string
      branch_id: string
      price: string | number
      branches: { name: string } | null
    }>
  ).map((row) => ({
    id: row.id,
    productId: row.product_id,
    branchId: row.branch_id,
    branchName: row.branches?.name ?? '',
    price: Number(row.price),
  }))
}

export async function listPriceHistory(productId: string): Promise<PriceHistoryEntry[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('product_prices')
    .select('id, product_id, branch_id, price, changed_at, branches(name)')
    .eq('product_id', productId)
    .order('changed_at', { ascending: false })

  if (error) throw error
  return (
    (data ?? []) as unknown as Array<{
      id: string
      product_id: string
      branch_id: string | null
      price: string | number
      changed_at: string
      branches: { name: string } | null
    }>
  ).map((row) => ({
    id: row.id,
    productId: row.product_id,
    branchId: row.branch_id,
    branchName: row.branches?.name ?? null,
    price: Number(row.price),
    changedAt: row.changed_at,
  }))
}
