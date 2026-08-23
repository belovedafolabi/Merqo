'use client'

import { useState } from 'react'
import { Pencil, PlusCircle, Receipt, ScrollText, SlidersHorizontal, Wallet } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { StatCard } from '@/components/ui/stat-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/states/empty-state'
import { Can } from '@/components/auth/can'
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog'
import { StoreCreditDialog } from '@/components/customers/store-credit-dialog'
import { formatDate, formatDateTime } from '@/lib/utils'
import type {
  Customer,
  CustomerActivityEntry,
  Layaway,
  StoreCreditEntryRecord,
} from '@/lib/customers/queries'

type DialogState = { kind: 'edit' } | { kind: 'issue' } | { kind: 'adjust' } | null

function currency(value: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value)
}

const CREDIT_LABELS: Record<StoreCreditEntryRecord['entryType'], string> = {
  issue: 'Issued',
  spend: 'Spent',
  refund_to_credit: 'From refund',
  adjustment: 'Adjustment',
}

const ACTIVITY_LABELS: Record<CustomerActivityEntry['kind'], string> = {
  sale: 'Sale',
  return: 'Return',
  store_credit: 'Store credit',
  layaway: 'Layaway',
}

/**
 * The customer detail screen (docs/milestones/09-customer-store-credit-and-
 * layaway.md Frontend Changes: detail screen, financial summary, store-credit
 * balance display, transaction history). Same tabbed, card-and-table shape as
 * components/inventory/inventory-view.tsx and components/products/
 * product-detail-view.tsx.
 *
 * The balance shown here is store_credit_accounts.balance, which
 * record_store_credit_entry() maintains in the same transaction as every
 * ledger row — the ledger tab beside it is the derivation it must always
 * agree with, which is exactly what makes drift visible to a human reading
 * this page, not just to the test suite.
 */
export function CustomerDetailView({
  organizationId,
  customer,
  storeCreditBalance,
  storeCreditLedger,
  layaways,
  activity,
}: {
  organizationId: string
  customer: Customer
  storeCreditBalance: number
  storeCreditLedger: StoreCreditEntryRecord[]
  layaways: Layaway[]
  activity: CustomerActivityEntry[]
}) {
  const [dialog, setDialog] = useState<DialogState>(null)
  const closeDialog = () => setDialog(null)

  const layawayOutstanding = layaways
    .filter((layaway) => layaway.status === 'active')
    .reduce((sum, layaway) => sum + layaway.outstandingAmount, 0)

  const activityColumns: DataTableColumn<CustomerActivityEntry>[] = [
    { header: 'Date', cell: (row) => formatDateTime(row.occurredAt) },
    { header: 'Type', cell: (row) => <Badge variant="outline">{ACTIVITY_LABELS[row.kind]}</Badge> },
    { header: 'Detail', cell: (row) => row.description },
    {
      header: 'Amount',
      cell: (row) => (
        <span className="tabular-nums">{row.amount === null ? '—' : currency(row.amount)}</span>
      ),
    },
  ]

  const ledgerColumns: DataTableColumn<StoreCreditEntryRecord>[] = [
    { header: 'Date', cell: (row) => formatDateTime(row.createdAt) },
    {
      header: 'Type',
      cell: (row) => <Badge variant="outline">{CREDIT_LABELS[row.entryType]}</Badge>,
    },
    {
      header: 'Amount',
      cell: (row) => (
        // Sign is spelled out as well as coloured — colour alone must never
        // carry meaning (WCAG 1.4.1).
        <span className={row.amount < 0 ? 'text-destructive tabular-nums' : 'tabular-nums'}>
          {row.amount < 0 ? '−' : '+'}
          {currency(Math.abs(row.amount))}
        </span>
      ),
    },
    {
      header: 'Balance after',
      cell: (row) => <span className="tabular-nums">{currency(row.balanceAfter)}</span>,
    },
    { header: 'Reason', cell: (row) => row.reason ?? '—' },
  ]

  const layawayColumns: DataTableColumn<Layaway>[] = [
    { header: 'Reference', cell: (row) => <span className="tabular-nums">{row.reference}</span> },
    { header: 'Created', cell: (row) => formatDate(row.createdAt) },
    {
      header: 'Total',
      cell: (row) => <span className="tabular-nums">{currency(row.totalAmount)}</span>,
    },
    {
      header: 'Outstanding',
      cell: (row) => <span className="tabular-nums">{currency(row.outstandingAmount)}</span>,
    },
    {
      header: 'Status',
      cell: (row) => (
        <Badge variant={row.status === 'active' ? 'outline' : 'secondary'}>{row.status}</Badge>
      ),
    },
  ]

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-heading-md font-semibold">{customer.name}</h2>
          <p className="text-body-sm text-muted-foreground tabular-nums">
            {customer.customerCode}
            {customer.phone ? ` · ${customer.phone}` : ''}
            {customer.email ? ` · ${customer.email}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Can permission="customers.update" scope={{ organizationId }}>
            <Button variant="outline" onClick={() => setDialog({ kind: 'edit' })}>
              <Pencil /> Edit
            </Button>
          </Can>
          <Can permission="store_credit.adjust" scope={{ organizationId }}>
            <Button variant="outline" onClick={() => setDialog({ kind: 'adjust' })}>
              <SlidersHorizontal /> Adjust credit
            </Button>
          </Can>
          <Can permission="store_credit.issue" scope={{ organizationId }}>
            <Button onClick={() => setDialog({ kind: 'issue' })}>
              <PlusCircle /> Issue credit
            </Button>
          </Can>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Store credit balance" value={currency(storeCreditBalance)} />
        <StatCard label="Layaway outstanding" value={currency(layawayOutstanding)} />
        <StatCard
          label="Active layaways"
          value={String(layaways.filter((layaway) => layaway.status === 'active').length)}
        />
      </div>

      <Tabs defaultValue="activity">
        <TabsList>
          <TabsTrigger value="activity">Transaction history</TabsTrigger>
          <TabsTrigger value="credit">Store credit</TabsTrigger>
          <TabsTrigger value="layaways">Layaways</TabsTrigger>
        </TabsList>

        <TabsContent value="activity">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Everything this customer has done</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={activityColumns}
                rows={activity}
                getRowKey={(row) => `${row.kind}-${row.id}`}
                emptyState={
                  <EmptyState
                    icon={Receipt}
                    title="Nothing yet"
                    description="Sales, returns, store-credit entries, and layaways will appear here as they happen."
                  />
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="credit">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Store-credit ledger</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={ledgerColumns}
                rows={storeCreditLedger}
                getRowKey={(row) => row.id}
                emptyState={
                  <EmptyState
                    icon={Wallet}
                    title="No store credit yet"
                    description="Credit issued here, or refunded to credit at the till, will show up as entries you can audit."
                  />
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="layaways">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Layaways</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={layawayColumns}
                rows={layaways}
                getRowKey={(row) => row.id}
                emptyState={
                  <EmptyState
                    icon={ScrollText}
                    title="No layaways"
                    description="Layaways created for this customer will be listed here with their outstanding balance."
                  />
                }
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CustomerFormDialog
        organizationId={organizationId}
        customer={customer}
        open={dialog?.kind === 'edit'}
        onOpenChange={(open) => (open ? setDialog({ kind: 'edit' }) : closeDialog())}
      />

      {(dialog?.kind === 'issue' || dialog?.kind === 'adjust') && (
        <StoreCreditDialog
          organizationId={organizationId}
          customerId={customer.id}
          customerName={customer.name}
          mode={dialog.kind === 'issue' ? 'issue' : 'adjust'}
          open
          onOpenChange={(open) => (open ? undefined : closeDialog())}
        />
      )}
    </div>
  )
}
