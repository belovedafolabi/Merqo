'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, Layers, MoreHorizontal, Plus } from 'lucide-react'

import { archiveProductAction, archiveProductVariantAction } from '@/app/(app)/products/actions'
import { Can } from '@/components/auth/can'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/states/empty-state'
import { ArchiveConfirmDialog } from '@/components/products/archive-confirm-dialog'
import { BranchPriceOverrideDialog } from '@/components/products/branch-price-override-dialog'
import { PriceHistoryView } from '@/components/products/price-history-view'
import { ProductFormDialog } from '@/components/products/product-form-dialog'
import { VariantFormDialog } from '@/components/products/variant-form-dialog'
import type {
  BranchPriceOverride,
  Category,
  PriceHistoryEntry,
  Product,
  ProductVariant,
} from '@/lib/products/queries'

type DialogState =
  | { kind: 'product-edit' }
  | { kind: 'product-archive' }
  | { kind: 'variant-create' }
  | { kind: 'variant-edit'; variant: ProductVariant }
  | { kind: 'variant-archive'; variant: ProductVariant }
  | { kind: 'branch-price-override' }
  | null

export function ProductDetailView({
  organizationId,
  product,
  categories,
  unitNames,
  variants,
  branch,
  branchPriceOverride,
  priceHistory,
}: {
  organizationId: string
  product: Product
  categories: Category[]
  unitNames: string[]
  variants: ProductVariant[]
  branch: { id: string; name: string } | null
  branchPriceOverride: BranchPriceOverride | null
  priceHistory: PriceHistoryEntry[]
}) {
  const [dialog, setDialog] = useState<DialogState>(null)
  const closeDialog = () => setDialog(null)

  const variantColumns: DataTableColumn<ProductVariant>[] = [
    { header: 'Name', cell: (row) => row.name },
    { header: 'SKU', cell: (row) => row.sku ?? '—' },
    {
      header: 'Price',
      className: 'text-right tabular-nums',
      cell: (row) =>
        row.basePrice === null
          ? 'Inherits'
          : row.basePrice.toLocaleString(undefined, { style: 'currency', currency: 'NGN' }),
    },
    {
      header: 'Status',
      cell: (row) =>
        row.archivedAt ? (
          <Badge variant="outline">Archived</Badge>
        ) : (
          <Badge variant="secondary">Active</Badge>
        ),
    },
    {
      header: '',
      className: 'w-12 text-right',
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setDialog({ kind: 'variant-edit', variant: row })}>
              Edit
            </DropdownMenuItem>
            {!row.archivedAt && (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDialog({ kind: 'variant-archive', variant: row })}
              >
                Archive
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/products">
              <ArrowLeft /> Back to products
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialog({ kind: 'product-edit' })}>
              Edit
            </Button>
            {!product.archivedAt && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDialog({ kind: 'product-archive' })}
              >
                Archive
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-h3 font-semibold">{product.name}</h1>
          {product.archivedAt ? (
            <Badge variant="outline">Archived</Badge>
          ) : (
            <Badge variant="secondary">Active</Badge>
          )}
        </div>

        <Tabs defaultValue="overview" className="gap-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="variants">Variants</TabsTrigger>
            <TabsTrigger value="pricing">Pricing &amp; history</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex flex-col gap-3">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="SKU" value={product.sku} />
              <Field label="Barcode" value={product.barcode ?? '—'} />
              <Field label="Category" value={product.categoryName ?? '—'} />
              <Field label="Unit of measurement" value={product.unitOfMeasurement} />
              <Can
                permission="products.view_cost_price"
                scope={{ organizationId, businessUnitId: product.businessUnitId }}
              >
                <Field
                  label="Cost price"
                  value={
                    product.costPrice === null
                      ? '—'
                      : product.costPrice.toLocaleString(undefined, {
                          style: 'currency',
                          currency: 'NGN',
                        })
                  }
                />
              </Can>
              <Field
                label="Base price"
                value={product.basePrice.toLocaleString(undefined, {
                  style: 'currency',
                  currency: 'NGN',
                })}
              />
            </dl>
            {product.description && (
              <p className="text-body-sm text-muted-foreground">{product.description}</p>
            )}
          </TabsContent>

          <TabsContent value="variants" className="flex flex-col gap-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setDialog({ kind: 'variant-create' })}>
                <Plus /> New variant
              </Button>
            </div>
            <DataTable
              columns={variantColumns}
              rows={variants}
              getRowKey={(row) => row.id}
              emptyState={
                <EmptyState
                  title="No variants yet"
                  icon={Layers}
                  description="Add a variant (size, color, etc.) if this product needs its own SKU/stock per option."
                />
              }
            />
          </TabsContent>

          <TabsContent value="pricing" className="flex flex-col gap-6">
            {branch && (
              <div className="flex flex-col gap-2 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-body-sm font-medium">Branch price — {branch.name}</p>
                    <p className="text-caption text-muted-foreground">
                      {branchPriceOverride
                        ? `Overridden to ${branchPriceOverride.price.toLocaleString(undefined, { style: 'currency', currency: 'NGN' })}`
                        : `Using base price (${product.basePrice.toLocaleString(undefined, { style: 'currency', currency: 'NGN' })})`}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDialog({ kind: 'branch-price-override' })}
                  >
                    {branchPriceOverride ? 'Edit override' : 'Set override'}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <p className="text-body-sm font-medium">Price history</p>
              <PriceHistoryView entries={priceHistory} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <ProductFormDialog
        organizationId={organizationId}
        businessUnitId={product.businessUnitId}
        categories={categories}
        unitNames={unitNames}
        product={product}
        open={dialog?.kind === 'product-edit'}
        onOpenChange={(open) => !open && closeDialog()}
      />

      {dialog?.kind === 'product-archive' && (
        <ArchiveConfirmDialog
          title="Archive product?"
          description={`"${product.name}" will be hidden from active use and from POS. Historical sales referencing it are preserved.`}
          action={archiveProductAction}
          buildFormData={() => {
            const fd = new FormData()
            fd.set('organizationId', organizationId)
            fd.set('businessUnitId', product.businessUnitId)
            fd.set('productId', product.id)
            return fd
          }}
          open
          onOpenChange={(open) => !open && closeDialog()}
        />
      )}

      <VariantFormDialog
        organizationId={organizationId}
        businessUnitId={product.businessUnitId}
        productId={product.id}
        variant={dialog?.kind === 'variant-edit' ? dialog.variant : null}
        open={dialog?.kind === 'variant-create' || dialog?.kind === 'variant-edit'}
        onOpenChange={(open) => !open && closeDialog()}
      />

      {dialog?.kind === 'variant-archive' && (
        <ArchiveConfirmDialog
          title="Archive variant?"
          description={`"${dialog.variant.name}" will be hidden from active use.`}
          action={archiveProductVariantAction}
          buildFormData={() => {
            const fd = new FormData()
            fd.set('organizationId', organizationId)
            fd.set('businessUnitId', product.businessUnitId)
            fd.set('productId', product.id)
            fd.set('variantId', dialog.variant.id)
            return fd
          }}
          open
          onOpenChange={(open) => !open && closeDialog()}
        />
      )}

      {branch && dialog?.kind === 'branch-price-override' && (
        <BranchPriceOverrideDialog
          organizationId={organizationId}
          businessUnitId={product.businessUnitId}
          productId={product.id}
          branchId={branch.id}
          branchName={branch.name}
          basePrice={product.basePrice}
          override={branchPriceOverride}
          open
          onOpenChange={(open) => !open && closeDialog()}
        />
      )}
    </>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-body-sm font-medium">{value}</dd>
    </div>
  )
}
