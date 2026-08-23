'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Ban, Plus, Search, Wallet } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { StatCard } from '@/components/ui/stat-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/states/empty-state'
import { Can } from '@/components/auth/can'
import { LayawayCancelDialog } from '@/components/layaways/layaway-cancel-dialog'
import { LayawayFormDialog } from '@/components/layaways/layaway-form-dialog'
import { LayawayPaymentDialog } from '@/components/layaways/layaway-payment-dialog'
import type { BranchProductOption } from '@/lib/inventory/queries'
import type { Layaway } from '@/lib/customers/queries'

type DialogState =
  | { kind: 'create' }
  | { kind: 'payment'; layaway: Layaway }
  | { kind: 'cancel'; layaway: Layaway }
  | null

function currency(value: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value)
}

/**
 * The Layaways screen (docs/milestones/09-customer-store-credit-and-
 * layaway.md Frontend Changes: creation, payment recording, outstanding-
 * balance/status display). Same tabbed, dialog-driven shape as
 * components/inventory/inventory-view.tsx.
 *
 * Split into Active and Closed rather than one list with a status column
 * doing all the work: an active layaway is something staff act on (take a
 * payment, cancel it), while a paid or cancelled one is a record. Sorting
 * the actionable ones to their own tab is the difference between a working
 * queue and an archive.
 */
export function LayawaysView({
  organizationId,
  branchId,
  businessUnitId,
  layaways,
  productOptions,
}: {
  organizationId: string
  branchId: string
  businessUnitId: string
  layaways: Layaway[]
  productOptions: BranchProductOption[]
}) {
  const [dialog, setDialog] = useState<DialogState>(null)
  const closeDialog = () => setDialog(null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return layaways
    return layaways.filter(
      (layaway) =>
        layaway.customerName.toLowerCase().includes(term) ||
        layaway.reference.toLowerCase().includes(term),
    )
  }, [layaways, search])

  const active = filtered.filter((layaway) => layaway.status === 'active')
  const closed = filtered.filter((layaway) => layaway.status !== 'active')

  const totalOutstanding = layaways
    .filter((layaway) => layaway.status === 'active')
    .reduce((sum, layaway) => sum + layaway.outstandingAmount, 0)

  const baseColumns: DataTableColumn<Layaway>[] = [
    {
      header: 'Layaway',
      cell: (row) => (
        <div className="flex flex-col">
          <Link
            href={`/customers/${row.customerId}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {row.customerName}
          </Link>
          <span className="text-xs text-muted-foreground tabular-nums">{row.reference}</span>
        </div>
      ),
    },
    {
      header: 'Total',
      cell: (row) => <span className="tabular-nums">{currency(row.totalAmount)}</span>,
    },
    {
      header: 'Paid',
      cell: (row) => (
        <div className="flex min-w-28 flex-col gap-1">
          <span className="tabular-nums">{currency(row.amountPaid)}</span>
          <Progress
            value={row.totalAmount > 0 ? (row.amountPaid / row.totalAmount) * 100 : 0}
            aria-label={`${Math.round(row.totalAmount > 0 ? (row.amountPaid / row.totalAmount) * 100 : 0)}% paid`}
          />
        </div>
      ),
    },
    {
      header: 'Outstanding',
      cell: (row) => <span className="tabular-nums">{currency(row.outstandingAmount)}</span>,
    },
  ]

  const activeColumns: DataTableColumn<Layaway>[] = [
    ...baseColumns,
    {
      header: 'Actions',
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <Can permission="layaway.record_payment" scope={{ organizationId, branchId }}>
            <Button size="sm" onClick={() => setDialog({ kind: 'payment', layaway: row })}>
              Take payment
            </Button>
          </Can>
          <Can permission="layaway.cancel" scope={{ organizationId, branchId }}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Cancel layaway ${row.reference}`}
              onClick={() => setDialog({ kind: 'cancel', layaway: row })}
            >
              <Ban aria-hidden="true" />
            </Button>
          </Can>
        </div>
      ),
    },
  ]

  const closedColumns: DataTableColumn<Layaway>[] = [
    ...baseColumns,
    {
      header: 'Status',
      cell: (row) => (
        <Badge variant={row.status === 'paid' ? 'secondary' : 'outline'}>
          {row.status === 'paid' ? 'Paid in full' : 'Cancelled'}
        </Badge>
      ),
    },
  ]

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active layaways" value={String(active.length)} />
        <StatCard label="Outstanding" value={currency(totalOutstanding)} />
        <StatCard
          label="Completed"
          value={String(closed.filter((l) => l.status === 'paid').length)}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            placeholder="Search customer or reference…"
            className="pl-9"
            aria-label="Search layaways"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Can permission="layaway.create" scope={{ organizationId, branchId }}>
          <Button onClick={() => setDialog({ kind: 'create' })}>
            <Plus /> New layaway
          </Button>
        </Can>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="closed">Closed</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Being paid off</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={activeColumns}
                rows={active}
                getRowKey={(row) => row.id}
                emptyState={
                  <EmptyState
                    icon={Wallet}
                    title="No active layaways"
                    description="Create a layaway to let a customer pay for goods in instalments while the stock is held for them."
                  />
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="closed">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Paid and cancelled</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={closedColumns}
                rows={closed}
                getRowKey={(row) => row.id}
                emptyState={
                  <EmptyState
                    icon={Wallet}
                    title="Nothing closed yet"
                    description="Layaways that are paid in full or cancelled will be kept here."
                  />
                }
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <LayawayFormDialog
        organizationId={organizationId}
        branchId={branchId}
        businessUnitId={businessUnitId}
        productOptions={productOptions}
        open={dialog?.kind === 'create'}
        onOpenChange={(open) => (open ? setDialog({ kind: 'create' }) : closeDialog())}
      />

      {dialog?.kind === 'payment' && (
        <LayawayPaymentDialog
          organizationId={organizationId}
          layaway={dialog.layaway}
          open
          onOpenChange={(open) => (open ? undefined : closeDialog())}
        />
      )}

      {dialog?.kind === 'cancel' && (
        <LayawayCancelDialog
          organizationId={organizationId}
          layaway={dialog.layaway}
          open
          onOpenChange={(open) => (open ? undefined : closeDialog())}
        />
      )}
    </div>
  )
}
