import { PackageCheck } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { EmptyState } from '@/components/states/empty-state'
import { restockWhy } from '@/lib/insights/why'
import type { RestockRow } from '@/lib/insights/types'

/**
 * Milestone 17 Part A — products running low at current velocity, with a
 * suggested order quantity. Pure render, no client behaviour.
 */
export function RestockSection({ rows, leadDays }: { rows: RestockRow[]; leadDays: number }) {
  const columns: DataTableColumn<RestockRow>[] = [
    { header: 'Product', cell: (row) => row.name },
    {
      header: 'On hand',
      cell: (row) => <span className="tabular-nums">{Math.round(row.onHand)}</span>,
    },
    {
      header: 'Days of cover',
      cell: (row) => (
        <span className="tabular-nums">
          {row.daysOfCover === null ? '0' : Math.round(row.daysOfCover)}
        </span>
      ),
    },
    {
      header: 'Suggested order',
      cell: (row) => (
        <span className="font-medium tabular-nums">{Math.ceil(row.suggestedOrderQty)} units</span>
      ),
    },
    {
      header: 'Why',
      cell: (row) => (
        <span className="text-body-sm text-muted-foreground">{restockWhy(row, leadDays)}</span>
      ),
    },
  ]

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>Restock soon</CardTitle>
        <CardDescription>
          Products that will run out within {leadDays} days at their current selling rate.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.productId}
          emptyState={
            <EmptyState
              icon={PackageCheck}
              title="Nothing to restock"
              description="No product is projected to run out inside the reorder window."
            />
          }
        />
      </CardContent>
    </Card>
  )
}
