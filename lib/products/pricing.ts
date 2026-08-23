import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * The shared price-resolution mechanism this milestone's Technical
 * Requirements call for (docs/milestones/06-product-catalog-and-pricing.md:
 * "resolveEffectivePrice(productId, branchId), so every future consumer
 * (POS checkout, reports, receipts) gets identical pricing logic — never
 * duplicated per-caller"). Milestone 08's checkout snapshots this
 * function's result into the sale record at the moment of sale — it must
 * never read a live product reference later, or a price change would
 * silently rewrite historical sale totals (this milestone's own Risks
 * section).
 *
 * Split into a pure core (resolveEffectivePriceFromRows) and an async
 * DB-fetching wrapper, mirroring lib/auth/permissions.ts's
 * resolvePermission()/guard.ts split — the core is unit-tested without a
 * database in tests/unit/products/pricing.test.ts.
 */

export interface ProductPriceRow {
  basePrice: number
}

export interface BranchPriceOverrideRow {
  price: number
}

/**
 * Branch → Business Unit's base price → override precedence
 * (docs/Product_Catalog_and_Pricing_Architecture.md §20.4): an override for
 * this exact (product, branch) pair takes precedence; otherwise the
 * product's own base price applies.
 */
export function resolveEffectivePriceFromRows(
  product: ProductPriceRow,
  override: BranchPriceOverrideRow | null,
): number {
  return override ? override.price : product.basePrice
}

export async function resolveEffectivePrice(
  productId: string,
  branchId: string,
): Promise<number> {
  const supabase = await createServerSupabaseClient()

  const { data: product, error: productError } = await supabase
    .from('products')
    .select('base_price')
    .eq('id', productId)
    .single<{ base_price: string | number }>()
  if (productError) throw productError

  const { data: override, error: overrideError } = await supabase
    .from('branch_price_overrides')
    .select('price')
    .eq('product_id', productId)
    .eq('branch_id', branchId)
    .maybeSingle<{ price: string | number }>()
  if (overrideError) throw overrideError

  return resolveEffectivePriceFromRows(
    { basePrice: Number(product.base_price) },
    override ? { price: Number(override.price) } : null,
  )
}

/**
 * A variant's own price if it sets one, otherwise its parent product's
 * resolved price — variants don't get their own branch-override row (this
 * milestone's Implementation Notes scope branch overrides to the
 * product/branch pair only; a variant inherits whatever precedence already
 * resolved for its parent).
 */
export function resolveVariantPrice(
  variantBasePrice: number | null,
  parentEffectivePrice: number,
): number {
  return variantBasePrice ?? parentEffectivePrice
}
