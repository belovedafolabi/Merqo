import { History } from 'lucide-react'

import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { EmptyState } from '@/components/states/empty-state'
import type { PriceHistoryEntry } from '@/lib/products/queries'

/**
 * Read-only price history (docs/milestones/06-product-catalog-and-
 * pricing.md Frontend Changes: "Price history view on a product's detail
 * page"). Rows come straight from the append-only `product_prices` table —
 * nothing here can edit or delete a past entry (lib/products/queries.ts's
 * listPriceHistory(), lib/products/mutations.ts never exposes an update/
 * delete path for it).
 */
export function PriceHistoryView({ entries }: { entries: PriceHistoryEntry[] }) {
  const columns: DataTableColumn<PriceHistoryEntry>[] = [
    {
      header: 'Changed',
      cell: (row) => new Date(row.changedAt).toLocaleString(),
    },
    {
      header: 'Scope',
      cell: (row) => (row.branchId ? `Branch override — ${row.branchName}` : 'Base price'),
    },
    {
      header: 'Price',
      className: 'text-right tabular-nums',
      cell: (row) => row.price.toLocaleString(undefined, { style: 'currency', currency: 'NGN' }),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={entries}
      getRowKey={(row) => row.id}
      emptyState={
        <EmptyState
          icon={History}
          title="No price changes yet"
          description="Every base price or branch override change will be recorded here."
        />
      }
    />
  )
}
