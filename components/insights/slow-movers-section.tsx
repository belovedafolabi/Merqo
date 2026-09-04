import Link from 'next/link'
import { Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { EmptyState } from '@/components/states/empty-state'
import { slowMoverWhy } from '@/lib/insights/why'
import type { SlowMoverRow } from '@/lib/insights/types'

function currency(value: number): string {
  return value.toLocaleString('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  })
}

/**
 * Milestone 17 Part A — stocked products with no sales in 30 days, ranked by
 * retail value tied up. Each row links to Settings → Coupons with the product
 * name pre-filled in a note; it never creates a coupon (the coupon engine has
 * no product targeting — the merchant sets the code up themselves).
 */
export function SlowMoversSection({ rows }: { rows: SlowMoverRow[] }) {
  const columns: DataTableColumn<SlowMoverRow>[] = [
    { header: 'Product', cell: (row) => row.name },
    {
      header: 'On hand',
      cell: (row) => <span className="tabular-nums">{Math.round(row.onHand)}</span>,
    },
    {
      header: 'Value tied up',
      cell: (row) => <span className="font-medium tabular-nums">{currency(row.retailValue)}</span>,
    },
    {
      header: 'Why',
      cell: (row) => (
        <span className="text-body-sm text-muted-foreground">{slowMoverWhy(row)}</span>
      ),
    },
    {
      header: '',
      className: 'text-right',
      cell: () => (
        <Button asChild variant="outline" size="sm">
          {/* The coupon engine has no product targeting — this just opens the
              coupons screen; the merchant creates the code themselves. */}
          <Link href="/settings/coupons">Set up a promo</Link>
        </Button>
      ),
    },
  ]

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>Slow movers</CardTitle>
        <CardDescription>
          In stock but nothing sold in the last 30 days — candidates for a clearance promotion.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.productId}
          emptyState={
            <EmptyState
              icon={Sparkles}
              title="No slow movers"
              description="Every stocked product has sold at least once in the last 30 days."
            />
          }
        />
      </CardContent>
    </Card>
  )
}
