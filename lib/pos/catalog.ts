import { cache } from 'react'

import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * The POS terminal's own catalog reads — search-as-you-type and the two
 * fast-access strips under the search box.
 *
 * Deliberately NOT in lib/products/queries.ts. Every function there resolves
 * `products.view_cost_price` and threads a redacted-or-not cost price through
 * its result, because that file backs the Admin catalog screens where cost
 * price matters. The till never shows cost price, so paying that
 * getCurrentUserContext() round trip on every keystroke bought nothing —
 * measured at ~40% of the felt search latency in Milestone 16's profiling.
 * These reads go through RPCs whose return types simply have no cost column,
 * so the question cannot arise.
 */

export interface PosProduct {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  basePrice: number
  unitOfMeasurement: string | null
  categoryId: string | null
  categoryName: string | null
}

interface PosProductRow {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  base_price: string | number
  unit_of_measurement: string | null
  category_id: string | null
  category_name: string | null
}

function mapPosProduct(row: PosProductRow): PosProduct {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    basePrice: Number(row.base_price),
    unitOfMeasurement: row.unit_of_measurement,
    categoryId: row.category_id,
    categoryName: row.category_name,
  }
}

/**
 * Matches a term against product name, SKU, barcode AND category name —
 * `pos_search_products` (20260903090000). The category-name match is what the
 * old `.or(name.ilike,sku.ilike,barcode.ilike)` in searchProducts() could not
 * do: `categories` was an embedded resource there, and PostgREST's `or=`
 * cannot reach an embed.
 */
export async function posSearchProducts(
  businessUnitId: string,
  term: string,
  limit = 50,
): Promise<PosProduct[]> {
  const trimmed = term.trim()
  if (!trimmed) return []

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('pos_search_products', {
    p_business_unit_id: businessUnitId,
    p_term: trimmed,
    p_limit: limit,
  })
  if (error) throw error
  return ((data ?? []) as PosProductRow[]).map(mapPosProduct)
}

export interface PosProductShortcut extends PosProduct {
  /** Units sold in the last 30 days — the "most sold" ranking key. */
  quantitySold: number
  lastSoldAt: string | null
}

export interface PosProductShortcuts {
  recent: PosProductShortcut[]
  top: PosProductShortcut[]
}

interface PosShortcutRow {
  kind: 'recent' | 'top'
  id: string
  name: string
  sku: string | null
  base_price: string | number
  category_name: string | null
  last_sold_at: string | null
  quantity_sold: string | number
}

/**
 * The "recently sold" and "most sold" strips — both lists from one
 * `pos_product_shortcuts` (20260903090100) call, so the strips can't be a
 * round trip apart.
 *
 * cache()-wrapped: the POS page and any component that re-reads it inside the
 * same request get one query. It is NOT long-lived caching — a new request
 * (a navigation back to /pos, a refresh) re-runs it, which is the right
 * freshness for "what sold recently".
 */
export const getPosProductShortcuts = cache(
  async (branchId: string, businessUnitId: string, limit = 12): Promise<PosProductShortcuts> => {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.rpc('pos_product_shortcuts', {
      p_branch_id: branchId,
      p_business_unit_id: businessUnitId,
      p_limit: limit,
    })
    if (error) throw error

    const rows = (data ?? []) as PosShortcutRow[]
    const toShortcut = (row: PosShortcutRow): PosProductShortcut => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      barcode: null,
      basePrice: Number(row.base_price),
      unitOfMeasurement: null,
      categoryId: null,
      categoryName: row.category_name,
      quantitySold: Number(row.quantity_sold),
      lastSoldAt: row.last_sold_at,
    })

    return {
      recent: rows.filter((row) => row.kind === 'recent').map(toShortcut),
      top: rows.filter((row) => row.kind === 'top').map(toShortcut),
    }
  },
)
