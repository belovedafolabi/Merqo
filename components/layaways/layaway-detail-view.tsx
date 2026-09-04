import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { StatCard } from '@/components/ui/stat-card'
import { formatDateTime } from '@/lib/utils'
import type {
  LayawayDetail,
  LayawayItemRecord,
  LayawayPaymentRecord,
} from '@/lib/customers/queries'

function currency(value: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value)
}

const STATUS_VARIANT: Record<LayawayDetail['status'], 'outline' | 'secondary'> = {
  active: 'outline',
  paid: 'secondary',
  cancelled: 'secondary',
}

/**
 * Read-only detail for one layaway — its line items and its installment
 * history. Reached from the customer activity table (Milestone 17 Part D);
 * payment, cancellation, and creation still happen from the list screen's
 * dialogs, so this page deliberately offers no actions of its own.
 */
export function LayawayDetailView({ layaway }: { layaway: LayawayDetail }) {
  const itemColumns: DataTableColumn<LayawayItemRecord>[] = [
    {
      header: 'Product',
      cell: (row) =>
        row.variantName ? `${row.productName} — ${row.variantName}` : row.productName,
    },
    { header: 'Qty', cell: (row) => <span className="tabular-nums">{row.quantity}</span> },
    {
      header: 'Unit price',
      cell: (row) => <span className="tabular-nums">{currency(row.unitPrice)}</span>,
    },
    {
      header: 'Line total',
      cell: (row) => <span className="tabular-nums">{currency(row.lineTotal)}</span>,
    },
  ]

  const paymentColumns: DataTableColumn<LayawayPaymentRecord>[] = [
    { header: 'Date', cell: (row) => formatDateTime(row.createdAt) },
    { header: 'Method', cell: (row) => row.method },
    { header: 'Reference', cell: (row) => row.reference ?? '—' },
    {
      header: 'Amount',
      cell: (row) => <span className="tabular-nums">{currency(row.amount)}</span>,
    },
    {
      header: 'Balance after',
      cell: (row) => <span className="tabular-nums">{currency(row.balanceAfter)}</span>,
    },
  ]

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-heading-md font-semibold tabular-nums">{layaway.reference}</h2>
          <Badge variant={STATUS_VARIANT[layaway.status]}>{layaway.status}</Badge>
        </div>
        <p className="text-body-sm text-muted-foreground">
          {layaway.customerName} · created {formatDateTime(layaway.createdAt)}
        </p>
        {layaway.cancellationReason && (
          <p className="text-body-sm text-destructive">Cancelled — {layaway.cancellationReason}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total" value={currency(layaway.totalAmount)} />
        <StatCard label="Paid so far" value={currency(layaway.amountPaid)} />
        <StatCard label="Outstanding" value={currency(layaway.outstandingAmount)} />
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={itemColumns} rows={layaway.items} getRowKey={(row) => row.id} />
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={paymentColumns} rows={layaway.payments} getRowKey={(row) => row.id} />
        </CardContent>
      </Card>
    </div>
  )
}
