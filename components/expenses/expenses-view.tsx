'use client'

import { useState } from 'react'
import { Check, Plus, Receipt, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { StatCard } from '@/components/ui/stat-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/states/empty-state'
import {
  ExpenseDecisionDialog,
  type ExpenseDecision,
} from '@/components/expenses/expense-decision-dialog'
import { ExpenseFormDialog } from '@/components/expenses/expense-form-dialog'
// Imported from the pure module, not from lib/expenses/queries.ts — that one
// reaches `next/headers` and cannot be pulled into a client bundle.
import { summarizeExpenses, type Expense } from '@/lib/expenses/summary'

function currency(value: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value)
}

const STATUS_VARIANTS: Record<Expense['status'], 'default' | 'secondary' | 'destructive'> = {
  approved: 'default',
  pending: 'secondary',
  rejected: 'destructive',
}

/**
 * The expenses screen — record, review, decide.
 *
 * Split into "Awaiting approval" and "All expenses" tabs rather than one list
 * with a filter, because the pending queue is a to-do list and the full list is
 * a record. Someone opening this screen to approve things should not have to
 * find them among four months of history.
 */
export function ExpensesView({
  organizationId,
  branchId,
  businessUnitId,
  expenses,
  canCreate,
  canApprove,
  canVoid,
}: {
  organizationId: string
  branchId: string
  businessUnitId: string | null
  expenses: Expense[]
  canCreate: boolean
  canApprove: boolean
  canVoid: boolean
}) {
  const [recordOpen, setRecordOpen] = useState(false)
  const [decision, setDecision] = useState<{ expense: Expense; kind: ExpenseDecision } | null>(null)

  const totals = summarizeExpenses(expenses)
  const pending = expenses.filter(
    (expense) => expense.status === 'pending' && expense.voidedAt === null,
  )
  const categories = [...new Set(expenses.map((expense) => expense.category))].sort()

  const baseColumns: DataTableColumn<Expense>[] = [
    {
      header: 'Date',
      cell: (row) =>
        new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(row.expenseDate)),
    },
    {
      header: 'Category',
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{row.category}</span>
          {row.description && (
            <span className="truncate text-xs text-muted-foreground">{row.description}</span>
          )}
        </div>
      ),
    },
    { header: 'Branch', cell: (row) => row.branchName },
    {
      header: 'Amount',
      className: 'text-right tabular-nums',
      cell: (row) => currency(row.amount),
    },
    { header: 'Paid by', cell: (row) => row.paymentMethod },
    {
      header: 'Status',
      cell: (row) =>
        row.voidedAt ? (
          <Badge variant="outline">Voided</Badge>
        ) : (
          <Badge variant={STATUS_VARIANTS[row.status]} className="capitalize">
            {row.status}
          </Badge>
        ),
    },
    { header: 'Recorded by', cell: (row) => row.createdByName ?? '—' },
  ]

  const actionColumn: DataTableColumn<Expense> = {
    header: 'Actions',
    className: 'text-right',
    cell: (row) => (
      <div className="flex justify-end gap-1">
        {canApprove && row.status === 'pending' && row.voidedAt === null && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDecision({ expense: row, kind: 'approve' })}
              aria-label={`Approve ${row.category} expense`}
            >
              <Check /> Approve
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDecision({ expense: row, kind: 'reject' })}
              aria-label={`Reject ${row.category} expense`}
            >
              <X /> Reject
            </Button>
          </>
        )}
        {canVoid && row.voidedAt === null && row.status !== 'pending' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDecision({ expense: row, kind: 'void' })}
            aria-label={`Void ${row.category} expense`}
          >
            Void
          </Button>
        )}
      </div>
    ),
  }

  const columns = canApprove || canVoid ? [...baseColumns, actionColumn] : baseColumns

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Awaiting approval" value={String(totals.pendingCount)} />
        <StatCard label="Pending value" value={currency(totals.pendingAmount)} />
        <StatCard label="Approved this period" value={currency(totals.approvedAmount)} />
      </div>

      {canCreate && (
        <div className="flex justify-end">
          <Button onClick={() => setRecordOpen(true)}>
            <Plus /> Record expense
          </Button>
        </div>
      )}

      <Tabs defaultValue={pending.length > 0 ? 'pending' : 'all'}>
        <TabsList>
          <TabsTrigger value="pending">Awaiting approval ({pending.length})</TabsTrigger>
          <TabsTrigger value="all">All expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Awaiting approval</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <DataTable
                columns={columns}
                rows={pending}
                getRowKey={(row) => row.id}
                emptyState={
                  <EmptyState
                    icon={Check}
                    title="Nothing waiting"
                    description="Every recorded expense has been decided."
                  />
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>All expenses</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <DataTable
                columns={columns}
                rows={expenses}
                getRowKey={(row) => row.id}
                emptyState={
                  <EmptyState
                    icon={Receipt}
                    title="No expenses yet"
                    description="Record your first business expense to see it counted against profit."
                  />
                }
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {canCreate && (
        <ExpenseFormDialog
          organizationId={organizationId}
          branchId={branchId}
          businessUnitId={businessUnitId}
          existingCategories={categories}
          open={recordOpen}
          onOpenChange={setRecordOpen}
        />
      )}

      {decision && (
        <ExpenseDecisionDialog
          organizationId={organizationId}
          expense={decision.expense}
          decision={decision.kind}
          open
          onOpenChange={(open) => (open ? undefined : setDecision(null))}
        />
      )}
    </div>
  )
}
