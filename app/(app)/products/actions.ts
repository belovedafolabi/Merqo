'use server'

import { revalidatePath } from 'next/cache'

import {
  archiveCategory,
  archiveProduct,
  archiveProductVariant,
  createCategory,
  createProduct,
  createProductVariant,
  removeBranchPriceOverride,
  updateCategory,
  updateProduct,
  updateProductVariant,
  upsertBranchPriceOverride,
} from '@/lib/products/mutations'

/**
 * Server Actions for the Product/Category/Variant/pricing screens — same
 * thin FormData-parsing shape as app/(app)/business-structure/actions.ts
 * around lib/products/mutations.ts.
 */
export interface ProductsActionState {
  error: string | null
}

const initialState: ProductsActionState = { error: null }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function numberField(formData: FormData, key: string): number {
  return Number(formData.get(key) ?? 0)
}

function optionalStringField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  return value ? String(value) : undefined
}

/**
 * Present only when the field was actually rendered — a caller lacking
 * `products.view_cost_price` never sees the cost-price input
 * (components/products/product-form-dialog.tsx), so `formData` never
 * carries the key at all for them, distinct from a present-but-empty value.
 */
function optionalNumberField(formData: FormData, key: string): number | undefined {
  return formData.has(key) ? numberField(formData, key) : undefined
}

/**
 * Three-way: the field is absent entirely (undefined — not rendered, e.g.
 * variant cost-price override behind `<Can permission="products.view_cost_price">`,
 * meaning "leave the existing value untouched"), present but left blank
 * (null — "inherit the parent's price", the variant-override tables' own
 * meaning for a null cost_price/base_price), or present with a value.
 */
function nullableNumberField(formData: FormData, key: string): number | null | undefined {
  if (!formData.has(key)) return undefined
  const raw = formData.get(key)
  if (raw === null || raw === '') return null
  return Number(raw)
}

export async function createCategoryAction(
  _prevState: ProductsActionState,
  formData: FormData,
): Promise<ProductsActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const businessUnitId = String(formData.get('businessUnitId') ?? '')

  try {
    await createCategory(organizationId, businessUnitId, {
      name: String(formData.get('name') ?? ''),
      description: optionalStringField(formData, 'description'),
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/products')
  return initialState
}

export async function updateCategoryAction(
  _prevState: ProductsActionState,
  formData: FormData,
): Promise<ProductsActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const businessUnitId = String(formData.get('businessUnitId') ?? '')
  const categoryId = String(formData.get('categoryId') ?? '')

  try {
    await updateCategory(organizationId, businessUnitId, categoryId, {
      name: String(formData.get('name') ?? ''),
      description: optionalStringField(formData, 'description'),
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/products')
  return initialState
}

export async function archiveCategoryAction(
  _prevState: ProductsActionState,
  formData: FormData,
): Promise<ProductsActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const businessUnitId = String(formData.get('businessUnitId') ?? '')
  const categoryId = String(formData.get('categoryId') ?? '')

  try {
    await archiveCategory(organizationId, businessUnitId, categoryId)
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/products')
  return initialState
}

export async function createProductAction(
  _prevState: ProductsActionState,
  formData: FormData,
): Promise<ProductsActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const businessUnitId = String(formData.get('businessUnitId') ?? '')
  const categoryId = optionalStringField(formData, 'categoryId')

  try {
    await createProduct(organizationId, businessUnitId, {
      categoryId: categoryId ?? null,
      name: String(formData.get('name') ?? ''),
      description: optionalStringField(formData, 'description'),
      sku: String(formData.get('sku') ?? ''),
      barcode: optionalStringField(formData, 'barcode'),
      unitOfMeasurement: String(formData.get('unitOfMeasurement') ?? 'unit'),
      costPrice: optionalNumberField(formData, 'costPrice'),
      basePrice: numberField(formData, 'basePrice'),
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/products')
  return initialState
}

export async function updateProductAction(
  _prevState: ProductsActionState,
  formData: FormData,
): Promise<ProductsActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const businessUnitId = String(formData.get('businessUnitId') ?? '')
  const productId = String(formData.get('productId') ?? '')
  const categoryId = optionalStringField(formData, 'categoryId')

  try {
    await updateProduct(organizationId, businessUnitId, productId, {
      categoryId: categoryId ?? null,
      name: String(formData.get('name') ?? ''),
      description: optionalStringField(formData, 'description'),
      sku: String(formData.get('sku') ?? ''),
      barcode: optionalStringField(formData, 'barcode'),
      unitOfMeasurement: String(formData.get('unitOfMeasurement') ?? 'unit'),
      costPrice: optionalNumberField(formData, 'costPrice'),
      basePrice: numberField(formData, 'basePrice'),
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/products')
  revalidatePath(`/products/${productId}`)
  return initialState
}

export async function archiveProductAction(
  _prevState: ProductsActionState,
  formData: FormData,
): Promise<ProductsActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const businessUnitId = String(formData.get('businessUnitId') ?? '')
  const productId = String(formData.get('productId') ?? '')

  try {
    await archiveProduct(organizationId, businessUnitId, productId)
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/products')
  revalidatePath(`/products/${productId}`)
  return initialState
}

export async function createProductVariantAction(
  _prevState: ProductsActionState,
  formData: FormData,
): Promise<ProductsActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const businessUnitId = String(formData.get('businessUnitId') ?? '')
  const productId = String(formData.get('productId') ?? '')

  try {
    await createProductVariant(organizationId, businessUnitId, productId, {
      name: String(formData.get('name') ?? ''),
      sku: optionalStringField(formData, 'sku'),
      barcode: optionalStringField(formData, 'barcode'),
      costPrice: nullableNumberField(formData, 'costPrice') ?? null,
      basePrice: nullableNumberField(formData, 'basePrice') ?? null,
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath(`/products/${productId}`)
  return initialState
}

export async function updateProductVariantAction(
  _prevState: ProductsActionState,
  formData: FormData,
): Promise<ProductsActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const businessUnitId = String(formData.get('businessUnitId') ?? '')
  const productId = String(formData.get('productId') ?? '')
  const variantId = String(formData.get('variantId') ?? '')

  try {
    await updateProductVariant(organizationId, businessUnitId, variantId, {
      name: String(formData.get('name') ?? ''),
      sku: optionalStringField(formData, 'sku'),
      barcode: optionalStringField(formData, 'barcode'),
      costPrice: nullableNumberField(formData, 'costPrice'),
      basePrice: nullableNumberField(formData, 'basePrice'),
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath(`/products/${productId}`)
  return initialState
}

export async function archiveProductVariantAction(
  _prevState: ProductsActionState,
  formData: FormData,
): Promise<ProductsActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const businessUnitId = String(formData.get('businessUnitId') ?? '')
  const productId = String(formData.get('productId') ?? '')
  const variantId = String(formData.get('variantId') ?? '')

  try {
    await archiveProductVariant(organizationId, businessUnitId, variantId)
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath(`/products/${productId}`)
  return initialState
}

export async function upsertBranchPriceOverrideAction(
  _prevState: ProductsActionState,
  formData: FormData,
): Promise<ProductsActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const businessUnitId = String(formData.get('businessUnitId') ?? '')
  const productId = String(formData.get('productId') ?? '')

  try {
    await upsertBranchPriceOverride(organizationId, businessUnitId, productId, {
      branchId: String(formData.get('branchId') ?? ''),
      price: numberField(formData, 'price'),
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath(`/products/${productId}`)
  return initialState
}

export async function removeBranchPriceOverrideAction(
  _prevState: ProductsActionState,
  formData: FormData,
): Promise<ProductsActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const businessUnitId = String(formData.get('businessUnitId') ?? '')
  const productId = String(formData.get('productId') ?? '')
  const branchId = String(formData.get('branchId') ?? '')

  try {
    await removeBranchPriceOverride(organizationId, businessUnitId, productId, branchId)
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath(`/products/${productId}`)
  return initialState
}
