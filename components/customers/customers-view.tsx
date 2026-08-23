'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, UserPlus, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/states/empty-state'
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog'
import { Can } from '@/components/auth/can'
import { formatDate } from '@/lib/utils'
import type { Customer } from '@/lib/customers/queries'

/**
 * The Customers list (docs/milestones/09-customer-store-credit-and-
 * layaway.md Frontend Changes: "Customer list/search/detail screens").
 * Same dialog-driven shape as components/inventory/inventory-view.tsx —
 * search is plain client-side filtering over the already-fetched list,
 * matching that component's own precedent. The indexed server-side
 * searchCustomers() exists for the POS picker, where the operator is
 * looking through the whole business rather than one loaded page.
 */
export function CustomersView({
  organizationId,
  customers,
}: {
  organizationId: string
  customers: Customer[]
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return customers
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(term) ||
        customer.customerCode.toLowerCase().includes(term) ||
        (customer.phone?.toLowerCase().includes(term) ?? false) ||
        (customer.email?.toLowerCase().includes(term) ?? false),
    )
  }, [customers, search])

  const columns: DataTableColumn<Customer>[] = [
    {
      header: 'Customer',
      cell: (row) => (
        <div className="flex flex-col">
          <Link
            href={`/customers/${row.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {row.name}
          </Link>
          <span className="text-xs text-muted-foreground tabular-nums">{row.customerCode}</span>
        </div>
      ),
    },
    { header: 'Phone', cell: (row) => row.phone ?? '—' },
    { header: 'Email', cell: (row) => row.email ?? '—' },
    { header: 'Added', cell: (row) => formatDate(row.createdAt) },
  ]

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            placeholder="Search name, phone, or email…"
            className="pl-9"
            aria-label="Search customers"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Can permission="customers.create" scope={{ organizationId }}>
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus /> New customer
          </Button>
        </Can>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Customers</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={filtered}
            getRowKey={(row) => row.id}
            emptyState={
              <EmptyState
                icon={Users}
                title={search ? 'No matching customers' : 'No customers yet'}
                description={
                  search
                    ? 'Try a different name, phone number, or email address.'
                    : 'Add a customer to start tracking their purchases, store credit, and layaways.'
                }
              />
            }
          />
        </CardContent>
      </Card>

      <CustomerFormDialog
        organizationId={organizationId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  )
}
