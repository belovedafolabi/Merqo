'use client'

import { useMemo, useState } from 'react'
import { ArrowLeftRight, Boxes, PackagePlus, Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { Input } from '@/components/ui/input'
import { StatCard } from '@/components/ui/stat-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/states/empty-state'
import { LowStockThresholdDialog } from '@/components/inventory/low-stock-threshold-dialog'
import { StockAdjustmentDialog } from '@/components/inventory/stock-adjustment-dialog'
import { StockTransferDialog } from '@/components/inventory/stock-transfer-dialog'
import { formatDateTime } from '@/lib/utils'
import type { Branch } from '@/lib/business-structure/queries'
import type {
  BranchProductOption,
  InventoryBalance,
  InventoryMovementEntry,
} from '@/lib/inventory/queries'

type DialogState =
  | { kind: 'adjustment' }
  | { kind: 'transfer' }
  | { kind: 'threshold'; balance: InventoryBalance }
  | null

const MOVEMENT_LABELS: Record<string, string> = {
  SALE: 'Sale',
  RETURN: 'Return',
  ADJUSTMENT: 'Adjustment',
  TRANSFER_OUT: 'Transfer out',
  TRANSFER_IN: 'Transfer in',
}

function currency(value: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value)
}

/**
 * The Inventory screen (docs/milestones/07-inventory-and-stock-
 * management.md Frontend Changes: balance view, movement history,
 * adjustment form, transfer flow, low-stock indicator). Same dialog-driven
 * shape as components/products/products-view.tsx — search is plain
 * client-side array filtering over the already-fetched list, matching that
 * component's own precedent (no dataset here yet justifies
 * @tanstack/react-table either).
 */
export function InventoryView({
  organizationId,
  branchId,
  balances,
  movements,
  productOptions,
  destinationBranches,
  batchTrackingEnabled,
  expiryTrackingEnabled,
  valuation,
}: {
  organizationId: string
  branchId: string
  balances: InventoryBalance[]
  movements: InventoryMovementEntry[]
  productOptions: BranchProductOption[]
  destinationBranches: Branch[]
  batchTrackingEnabled: boolean
  expiryTrackingEnabled: boolean
  valuation: number | null
}) {
  const [dialog, setDialog] = useState<DialogState>(null)
  const closeDialog = () => setDialog(null)
  const [search, setSearch] = useState('')

  const filteredBalances = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return balances
    return balances.filter(
      (balance) =>
        balance.productName.toLowerCase().includes(term) ||
        balance.sku.toLowerCase().includes(term) ||
        (balance.variantName?.toLowerCase().includes(term) ?? false),
    )
  }, [balances, search])

  const lowStockCount = balances.filter(
    (balance) =>
      balance.lowStockThreshold !== null && balance.quantity <= balance.lowStockThreshold,
  ).length

  const balanceColumns: DataTableColumn<InventoryBalance>[] = [
    {
      header: 'Product',
      cell: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.productName}</span>
          <span className="text-xs text-muted-foreground">
            {row.sku}
            {row.variantName ? ` · ${row.variantName}` : ''}
          </span>
        </div>
      ),
    },
    { header: 'On hand', cell: (row) => row.quantity },
    { header: 'Reserved', cell: (row) => row.reservedQuantity },
    { header: 'Available', cell: (row) => row.availableQuantity },
    {
      header: 'Status',
      cell: (row) => {
        const isLow = row.lowStockThreshold !== null && row.quantity <= row.lowStockThreshold
        return isLow ? (
          <Badge variant="destructive">Low stock</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            {row.lowStockThreshold === null ? 'No threshold set' : 'OK'}
          </span>
        )
      },
    },
    {
      header: 'Threshold',
      cell: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDialog({ kind: 'threshold', balance: row })}
        >
          {row.lowStockThreshold ?? '—'}
        </Button>
      ),
    },
  ]

  const movementColumns: DataTableColumn<InventoryMovementEntry>[] = [
    { header: 'Date', cell: (row) => formatDateTime(row.createdAt) },
    {
      header: 'Product',
      cell: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.productName}</span>
          {row.variantName && (
            <span className="text-xs text-muted-foreground">{row.variantName}</span>
          )}
        </div>
      ),
    },
    {
      header: 'Type',
      cell: (row) => (
        <Badge variant="outline">{MOVEMENT_LABELS[row.movementType] ?? row.movementType}</Badge>
      ),
    },
    {
      header: 'Change',
      cell: (row) => (
        <span className={row.quantityDelta < 0 ? 'text-destructive' : 'text-emerald-600'}>
          {row.quantityDelta > 0 ? `+${row.quantityDelta}` : row.quantityDelta}
        </span>
      ),
    },
    { header: 'Balance after', cell: (row) => row.quantityAfter },
    { header: 'Reason', cell: (row) => row.reason ?? '—' },
  ]

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Products tracked" value={String(balances.length)} />
        <StatCard
          label="Low stock"
          value={String(lowStockCount)}
          tone={lowStockCount > 0 ? 'inverted' : undefined}
        />
        <StatCard label="Inventory value" value={valuation === null ? '—' : currency(valuation)} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products…"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDialog({ kind: 'transfer' })}>
            <ArrowLeftRight /> Transfer stock
          </Button>
          <Button onClick={() => setDialog({ kind: 'adjustment' })}>
            <PackagePlus /> Adjust stock
          </Button>
        </div>
      </div>

      <Tabs defaultValue="balances">
        <TabsList>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="movements">Movement history</TabsTrigger>
        </TabsList>

        <TabsContent value="balances">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Stock on hand</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={balanceColumns}
                rows={filteredBalances}
                getRowKey={(row) => row.id}
                emptyState={
                  <EmptyState
                    icon={Boxes}
                    title="No inventory yet"
                    description="Record your first stock adjustment to start tracking balances at this branch."
                  />
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Movement history</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={movementColumns}
                rows={movements}
                getRowKey={(row) => row.id}
                emptyState={
                  <EmptyState
                    icon={Boxes}
                    title="No movements yet"
                    description="Adjustments and transfers will appear here as they happen."
                  />
                }
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <StockAdjustmentDialog
        organizationId={organizationId}
        branchId={branchId}
        productOptions={productOptions}
        batchTrackingEnabled={batchTrackingEnabled}
        expiryTrackingEnabled={expiryTrackingEnabled}
        open={dialog?.kind === 'adjustment'}
        onOpenChange={(open) => (open ? setDialog({ kind: 'adjustment' }) : closeDialog())}
      />

      <StockTransferDialog
        organizationId={organizationId}
        sourceBranchId={branchId}
        sourceProductOptions={productOptions}
        destinationBranches={destinationBranches}
        open={dialog?.kind === 'transfer'}
        onOpenChange={(open) => (open ? setDialog({ kind: 'transfer' }) : closeDialog())}
      />

      {dialog?.kind === 'threshold' && (
        <LowStockThresholdDialog
          organizationId={organizationId}
          branchId={branchId}
          balance={dialog.balance}
          open
          onOpenChange={(open) => (open ? undefined : closeDialog())}
        />
      )}
    </div>
  )
}
