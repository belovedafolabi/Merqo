import { requirePermission } from '@/lib/auth/guard'
import { recordAuditEvent } from '@/lib/auth/audit'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateSku } from '@/lib/products/sku'
import {
  branchPriceOverrideInputSchema,
  categoryInputSchema,
  productInputSchema,
  productVariantInputSchema,
  type BranchPriceOverrideInput,
  type CategoryInput,
  type ProductInput,
  type ProductVariantInput,
} from '@/lib/products/schemas'

/**
 * The actual DB mutations behind this milestone's Product/Category/Variant/
 * pricing Server Actions — same `requirePermission() -> mutate ->
 * recordAuditEvent()` shape as lib/business-structure/mutations.ts. Every
 * price-changing mutation writes the live column (products.base_price or
 * branch_price_overrides.price) and a product_prices history row via
 * record_product_price() in the same call — see this milestone's Risks
 * section on why the two must never drift apart.
 */

export async function createCategory(
  organizationId: string,
  businessUnitId: string,
  input: CategoryInput,
): Promise<{ id: string }> {
  const user = await requirePermission('categories.manage', { organizationId, businessUnitId })
  const parsed = categoryInputSchema.parse(input)
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('categories')
    .insert({
      business_unit_id: businessUnitId,
      name: parsed.name,
      description: parsed.description ?? null,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'category.created',
      resourceType: 'category',
      resourceId: data.id,
      metadata: { name: parsed.name },
    },
    supabase,
  )

  return { id: data.id }
}

export async function updateCategory(
  organizationId: string,
  businessUnitId: string,
  categoryId: string,
  input: CategoryInput,
): Promise<void> {
  const user = await requirePermission('categories.manage', { organizationId, businessUnitId })
  const parsed = categoryInputSchema.parse(input)
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('categories')
    .update({ name: parsed.name, description: parsed.description ?? null })
    .eq('id', categoryId)
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'category.updated',
      resourceType: 'category',
      resourceId: categoryId,
      metadata: { name: parsed.name },
    },
    supabase,
  )
}

export async function archiveCategory(
  organizationId: string,
  businessUnitId: string,
  categoryId: string,
): Promise<void> {
  const user = await requirePermission('categories.manage', { organizationId, businessUnitId })
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('categories')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', categoryId)
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'category.archived',
      resourceType: 'category',
      resourceId: categoryId,
    },
    supabase,
  )
}

export async function createProduct(
  organizationId: string,
  businessUnitId: string,
  input: ProductInput,
): Promise<{ id: string }> {
  const user = await requirePermission('products.create', { organizationId, businessUnitId })
  const parsed = productInputSchema.parse(input)
  const supabase = await createServerSupabaseClient()

  // SKU is optional on the form: a blank one is generated here from the
  // name. On the (business_unit_id, sku) partial-unique collision (23505)
  // we retry once with a fresh suffix when we generated it; a user-typed
  // duplicate surfaces as a friendly error instead.
  const skuWasSupplied = parsed.sku !== undefined
  let attempt = 0
  let resolvedSku = ''
  let data: { id: string } | null = null
  while (data === null) {
    resolvedSku = skuWasSupplied ? parsed.sku! : generateSku(parsed.name)
    const sku = resolvedSku
    const result = await supabase
      .from('products')
      .insert({
        business_unit_id: businessUnitId,
        category_id: parsed.categoryId ?? null,
        name: parsed.name,
        description: parsed.description ?? null,
        sku,
        barcode: parsed.barcode ?? null,
        unit_of_measurement: parsed.unitOfMeasurement,
        // Absent (rather than 0) means "caller can't see/set cost price" —
        // defaults to 0 at creation in that case; only a caller with
        // products.view_cost_price ever sets a nonzero value (this
        // milestone's Security Requirements).
        cost_price: parsed.costPrice ?? 0,
        base_price: parsed.basePrice,
        // Milestone 17 Part B — defaults true (a stock-tracked product) at the
        // DB and here; only an explicit `false` (a service line item) opts out.
        track_inventory: parsed.trackInventory ?? true,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (result.error) {
      const code = (result.error as { code?: string }).code
      if (code === '23505') {
        if (!skuWasSupplied && attempt < 3) {
          attempt += 1
          continue
        }
        throw new Error(
          skuWasSupplied
            ? 'That SKU or barcode is already in use by another product in this business unit.'
            : 'Could not generate a unique SKU — please enter one manually.',
        )
      }
      throw result.error
    }
    data = result.data as { id: string }
  }

  const { error: priceHistoryError } = await supabase.rpc('record_product_price', {
    p_product_id: data.id,
    p_branch_id: null,
    p_price: parsed.basePrice,
    p_changed_by: user.id,
  })
  if (priceHistoryError) throw priceHistoryError

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'product.created',
      resourceType: 'product',
      resourceId: data.id,
      metadata: { name: parsed.name, sku: resolvedSku, basePrice: parsed.basePrice },
    },
    supabase,
  )

  return { id: data.id }
}

export async function updateProduct(
  organizationId: string,
  businessUnitId: string,
  productId: string,
  input: ProductInput,
): Promise<void> {
  const user = await requirePermission('products.update', { organizationId, businessUnitId })
  const parsed = productInputSchema.parse(input)
  const supabase = await createServerSupabaseClient()

  const { data: existing, error: existingError } = await supabase
    .from('products')
    .select('base_price')
    .eq('id', productId)
    .single<{ base_price: string | number }>()
  if (existingError) throw existingError

  // cost_price is only included in the update payload when the caller
  // actually submitted it — a caller lacking products.view_cost_price never
  // has the field rendered at all (components/products/product-form-dialog.tsx),
  // so parsed.costPrice is undefined for them and the existing value is left
  // untouched, rather than a hidden/absent field silently zeroing it out.
  const updatePayload: Record<string, unknown> = {
    category_id: parsed.categoryId ?? null,
    name: parsed.name,
    description: parsed.description ?? null,
    barcode: parsed.barcode ?? null,
    unit_of_measurement: parsed.unitOfMeasurement,
    base_price: parsed.basePrice,
  }
  // A blank SKU on edit means "keep the current one" — never null it out.
  if (parsed.sku !== undefined) {
    updatePayload.sku = parsed.sku
  }
  if (parsed.costPrice !== undefined) {
    updatePayload.cost_price = parsed.costPrice
  }

  const { error } = await supabase.from('products').update(updatePayload).eq('id', productId)
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error(
        'That SKU or barcode is already in use by another product in this business unit.',
      )
    }
    throw error
  }

  // Only append a price-history row when the base price actually changed —
  // an edit that leaves price untouched shouldn't manufacture a spurious
  // history entry (this milestone's FR: history records *changes*).
  if (Number(existing.base_price) !== parsed.basePrice) {
    const { error: priceHistoryError } = await supabase.rpc('record_product_price', {
      p_product_id: productId,
      p_branch_id: null,
      p_price: parsed.basePrice,
      p_changed_by: user.id,
    })
    if (priceHistoryError) throw priceHistoryError
  }

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'product.updated',
      resourceType: 'product',
      resourceId: productId,
      metadata: { name: parsed.name, sku: parsed.sku, basePrice: parsed.basePrice },
    },
    supabase,
  )
}

export async function archiveProduct(
  organizationId: string,
  businessUnitId: string,
  productId: string,
): Promise<void> {
  const user = await requirePermission('products.archive', { organizationId, businessUnitId })
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('products')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', productId)
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'product.archived',
      resourceType: 'product',
      resourceId: productId,
    },
    supabase,
  )
}

export async function createProductVariant(
  organizationId: string,
  businessUnitId: string,
  productId: string,
  input: ProductVariantInput,
): Promise<{ id: string }> {
  const user = await requirePermission('products.create', { organizationId, businessUnitId })
  const parsed = productVariantInputSchema.parse(input)
  const supabase = await createServerSupabaseClient()

  // business_unit_id is derived server-side by
  // trg_product_variants_sync_business_unit_id — not trusted from the
  // caller — so it's deliberately omitted from this insert payload.
  const { data, error } = await supabase
    .from('product_variants')
    .insert({
      product_id: productId,
      name: parsed.name,
      sku: parsed.sku ?? null,
      barcode: parsed.barcode ?? null,
      cost_price: parsed.costPrice ?? null,
      base_price: parsed.basePrice ?? null,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'product_variant.created',
      resourceType: 'product_variant',
      resourceId: data.id,
      metadata: { productId, name: parsed.name },
    },
    supabase,
  )

  return { id: data.id }
}

export async function updateProductVariant(
  organizationId: string,
  businessUnitId: string,
  variantId: string,
  input: ProductVariantInput,
): Promise<void> {
  const user = await requirePermission('products.update', { organizationId, businessUnitId })
  const parsed = productVariantInputSchema.parse(input)
  const supabase = await createServerSupabaseClient()

  // cost_price is only included when the caller actually submitted the
  // field (undefined means "not rendered — caller lacks
  // products.view_cost_price", left untouched; null means "rendered but
  // cleared — inherit the parent product's cost price"), same reasoning as
  // updateProduct() above.
  const updatePayload: Record<string, unknown> = {
    name: parsed.name,
    sku: parsed.sku ?? null,
    barcode: parsed.barcode ?? null,
    base_price: parsed.basePrice ?? null,
  }
  if (parsed.costPrice !== undefined) {
    updatePayload.cost_price = parsed.costPrice
  }

  const { error } = await supabase
    .from('product_variants')
    .update(updatePayload)
    .eq('id', variantId)
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'product_variant.updated',
      resourceType: 'product_variant',
      resourceId: variantId,
      metadata: { name: parsed.name },
    },
    supabase,
  )
}

export async function archiveProductVariant(
  organizationId: string,
  businessUnitId: string,
  variantId: string,
): Promise<void> {
  const user = await requirePermission('products.archive', { organizationId, businessUnitId })
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('product_variants')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', variantId)
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'product_variant.archived',
      resourceType: 'product_variant',
      resourceId: variantId,
    },
    supabase,
  )
}

export async function upsertBranchPriceOverride(
  organizationId: string,
  businessUnitId: string,
  productId: string,
  input: BranchPriceOverrideInput,
): Promise<void> {
  const user = await requirePermission('products.update', { organizationId, businessUnitId })
  const parsed = branchPriceOverrideInputSchema.parse(input)
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.from('branch_price_overrides').upsert(
    {
      product_id: productId,
      branch_id: parsed.branchId,
      price: parsed.price,
      created_by: user.id,
    },
    { onConflict: 'product_id,branch_id' },
  )
  if (error) throw error

  const { error: priceHistoryError } = await supabase.rpc('record_product_price', {
    p_product_id: productId,
    p_branch_id: parsed.branchId,
    p_price: parsed.price,
    p_changed_by: user.id,
  })
  if (priceHistoryError) throw priceHistoryError

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'product.branch_price_override_set',
      resourceType: 'product',
      resourceId: productId,
      metadata: { branchId: parsed.branchId, price: parsed.price },
    },
    supabase,
  )
}

export async function removeBranchPriceOverride(
  organizationId: string,
  businessUnitId: string,
  productId: string,
  branchId: string,
): Promise<void> {
  const user = await requirePermission('products.update', { organizationId, businessUnitId })
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('branch_price_overrides')
    .delete()
    .eq('product_id', productId)
    .eq('branch_id', branchId)
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'product.branch_price_override_removed',
      resourceType: 'product',
      resourceId: productId,
      metadata: { branchId },
    },
    supabase,
  )
}
