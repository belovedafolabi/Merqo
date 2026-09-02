'use client'

import { useState, useTransition } from 'react'
import { Receipt } from 'lucide-react'

import { loadMoreSalesAction } from '@/app/(app)/sales/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { EmptyState } from '@/components/states/empty-state'
import {
  formatPaymentMethods,
  shortSaleRef,
  type SaleListEntry,
} from '@/lib/sales/sale-list'

function currency(value: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value)
}

/** Opens the existing print/preview route in a small named popup — the same
 *  affordance the POS checkout uses for its receipt. */
function openReceipt(saleId: string): void {
  window
    .open(
      `/receipts/preview?saleId=${encodeURIComponent(saleId)}`,
      'merqo-receipt',
      'popup=yes,width=420,height=760',
    )
    ?.focus()
}

export function SalesView({
  initialSales,
  pageSize,
}: {
  initialSales: SaleListEntry[]
  pageSize: number
}) {
  const [sales, setSales] = useState(initialSales)
  const [exhausted, setExhausted] = useState(initialSales.length < pageSize)
  const [pending, startTransition] = useTransition()

  const columns: DataTableColumn<SaleListEntry>[] = [
    {
      header: 'Date',
      cell: (sale) =>
        new Date(sale.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }),
    },
    {
      header: 'Receipt',
      cell: (sale) => <span className="font-mono text-body-sm">#{shortSaleRef(sale.id)}</span>,
    },
    {
      header: 'Items',
      cell: (sale) => <span className="tabular-nums">{sale.itemCount}</span>,
      className: 'text-right',
    },
    {
      header: 'Total',
      cell: (sale) => <span className="tabular-nums">{currency(sale.total)}</span>,
      className: 'text-right',
    },
    { header: 'Payment', cell: (sale) => formatPaymentMethods(sale.paymentMethods) },
    { header: 'Cashier', cell: (sale) => sale.cashierName ?? '—' },
    {
      header: 'Status',
      cell: (sale) =>
        sale.returnCount > 0 ? (
          <Badge variant="outline">Refunded</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: '',
      cell: (sale) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openReceipt(sale.id)}
          aria-label={`View receipt ${shortSaleRef(sale.id)}`}
        >
          View
        </Button>
      ),
      className: 'text-right',
    },
  ]

  function loadMore() {
    const last = sales[sales.length - 1]
    if (!last) return
    startTransition(async () => {
      const more = await loadMoreSalesAction(last.createdAt)
      setSales((prev) => [...prev, ...more])
      if (more.length < pageSize) setExhausted(true)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        columns={columns}
        rows={sales}
        getRowKey={(sale) => sale.id}
        emptyState={
          <EmptyState
            icon={Receipt}
            title="No sales yet"
            description="Completed sales at this branch will appear here."
          />
        }
      />
      {!exhausted && sales.length > 0 && (
        <Button
          variant="outline"
          onClick={loadMore}
          disabled={pending}
          className="self-center"
        >
          {pending ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  )
}
