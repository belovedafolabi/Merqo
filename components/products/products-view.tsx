'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { FolderCog, MoreHorizontal, Package, Plus, Search } from 'lucide-react'

import { archiveProductAction } from '@/app/(app)/products/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/states/empty-state'
import { ArchiveConfirmDialog } from '@/components/products/archive-confirm-dialog'
import { CategoryManagerDialog } from '@/components/products/category-manager-dialog'
import { ProductFormDialog } from '@/components/products/product-form-dialog'
import type { Category, Product } from '@/lib/products/queries'

type DialogState =
  | { kind: 'product-create' }
  | { kind: 'product-edit'; product: Product }
  | { kind: 'product-archive'; product: Product }
  | { kind: 'categories' }
  | null

/**
 * The Product catalog screen (docs/milestones/06-product-catalog-and-
 * pricing.md Frontend Changes: "Product list/grid with search, filter by
 * category, status"). Same dialog-driven shape as
 * components/business-structure/business-structure-view.tsx. Search/
 * category filtering is plain client-side array filtering over the already-
 * fetched list — components/ui/data-table.tsx's own doc comment flags this
 * milestone as the one that would justify @tanstack/react-table if
 * sorting/filtering became a real requirement; a few hundred products
 * filtered in the browser doesn't meet that bar yet, so no new dependency
 * is introduced for it.
 */
export function ProductsView({
  organizationId,
  businessUnitId,
  products,
  categories,
  categorySuggestions,
}: {
  organizationId: string
  businessUnitId: string
  products: Product[]
  categories: Category[]
  categorySuggestions: string[]
}) {
  const [dialog, setDialog] = useState<DialogState>(null)
  const closeDialog = () => setDialog(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const activeCategories = categories.filter((category) => category.archivedAt === null)

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase()
    return products.filter((product) => {
      if (categoryFilter !== 'all' && product.categoryId !== categoryFilter) return false
      if (!term) return true
      return (
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term) ||
        (product.barcode?.toLowerCase().includes(term) ?? false)
      )
    })
  }, [products, search, categoryFilter])

  const columns: DataTableColumn<Product>[] = [
    {
      header: 'Name',
      cell: (row) => (
        <Link href={`/products/${row.id}`} className="font-medium hover:underline">
          {row.name}
        </Link>
      ),
    },
    { header: 'SKU', cell: (row) => <span className="tabular-nums">{row.sku}</span> },
    { header: 'Category', cell: (row) => row.categoryName ?? '—' },
    {
      header: 'Base price',
      className: 'text-right tabular-nums',
      cell: (row) =>
        row.basePrice.toLocaleString(undefined, { style: 'currency', currency: 'NGN' }),
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
            <DropdownMenuItem asChild>
              <Link href={`/products/${row.id}`}>View details</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog({ kind: 'product-edit', product: row })}>
              Edit
            </DropdownMenuItem>
            {!row.archivedAt && (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDialog({ kind: 'product-archive', product: row })}
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, SKU, or barcode…"
                aria-label="Search products"
                className="pl-8"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48" aria-label="Filter by category">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {activeCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialog({ kind: 'categories' })}>
              <FolderCog /> Categories
            </Button>
            <Button size="sm" onClick={() => setDialog({ kind: 'product-create' })}>
              <Plus /> New product
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={filteredProducts}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              icon={Package}
              title={products.length === 0 ? 'No products yet' : 'No matching products'}
              description={
                products.length === 0
                  ? 'Create your first product to start building this business unit’s catalog.'
                  : 'Try a different search term or category.'
              }
            />
          }
        />
      </div>

      <ProductFormDialog
        organizationId={organizationId}
        businessUnitId={businessUnitId}
        categories={activeCategories}
        product={dialog?.kind === 'product-edit' ? dialog.product : null}
        open={dialog?.kind === 'product-create' || dialog?.kind === 'product-edit'}
        onOpenChange={(open) => !open && closeDialog()}
      />

      {dialog?.kind === 'product-archive' && (
        <ArchiveConfirmDialog
          title="Archive product?"
          description={`"${dialog.product.name}" will be hidden from active use and from POS. Historical sales referencing it are preserved.`}
          action={archiveProductAction}
          buildFormData={() => {
            const fd = new FormData()
            fd.set('organizationId', organizationId)
            fd.set('businessUnitId', businessUnitId)
            fd.set('productId', dialog.product.id)
            return fd
          }}
          open
          onOpenChange={(open) => !open && closeDialog()}
        />
      )}

      {dialog?.kind === 'categories' && (
        <CategoryManagerDialog
          organizationId={organizationId}
          businessUnitId={businessUnitId}
          categories={categories}
          suggestions={categorySuggestions}
          open
          onOpenChange={(open) => !open && closeDialog()}
        />
      )}
    </>
  )
}
