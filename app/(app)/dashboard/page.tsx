import { Package, Plus } from 'lucide-react'

import { AdminTopbar } from '@/components/shell/admin-topbar'
import { StatCard } from '@/components/ui/stat-card'
import { DataTable } from '@/components/ui/data-table'
import { EmptyState } from '@/components/states/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

/**
 * The Admin Dashboard's landing screen. Milestone 04 ships the shell and
 * shared components only (docs/milestones/04-design-system-and-app-shell.md
 * Out of Scope: "any feature-specific screen content") — every value below
 * is a static placeholder demonstrating the component set real dashboard
 * content (a later milestone) will populate.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Dashboard">
        <Button size="sm" className="rounded-full">
          <Plus /> Add widget
        </Button>
      </AdminTopbar>

      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Sales today"
            value="₦0"
            delta={{ label: '0% vs. yesterday', direction: 'up', positive: true }}
            tone="inverted"
          />
          <StatCard
            label="Transactions"
            value="0"
            delta={{ label: '0% vs. yesterday', direction: 'up', positive: true }}
          />
          <StatCard
            label="Average sale"
            value="₦0"
            delta={{ label: '0% vs. yesterday', direction: 'up', positive: true }}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="shadow-card lg:col-span-2">
            <CardHeader>
              <CardTitle>Sales overview</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={Package}
                title="No sales data yet"
                description="Charts populate once the POS Transaction Engine (Milestone 08) starts recording sales."
              />
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Low stock</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={Package}
                title="No inventory yet"
                description="Low-stock alerts arrive with Inventory & Stock Management (Milestone 07)."
              />
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Recent products</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { header: 'Product', cell: () => null },
                { header: 'SKU', cell: () => null },
                { header: 'Price', cell: () => null },
                { header: 'Stock', cell: () => null },
              ]}
              rows={[]}
              getRowKey={() => ''}
              emptyState={
                <EmptyState
                  icon={Package}
                  title="No products yet"
                  description="Create your first product to start selling once Milestone 06 ships the catalog."
                />
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
