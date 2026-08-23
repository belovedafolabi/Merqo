import { Package, Plus } from 'lucide-react'

import { getOnboardingState } from '@/lib/business-structure/queries'
import { listLowStockBalances } from '@/lib/inventory/queries'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { StatCard } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import { EmptyState } from '@/components/states/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

/**
 * The Admin Dashboard's landing screen. Milestone 04 shipped the shell and
 * shared components only, with every card a static placeholder. Milestone
 * 07 fills in "Low stock" with a real query
 * (lib/inventory/queries.ts's listLowStockBalances()) — the other cards
 * stay placeholders until their own milestone (Sales: 08, Products list:
 * already live on /products) does the same.
 */
export default async function DashboardPage() {
  const onboardingState = await getOnboardingState()
  const lowStockBalances = onboardingState.branch
    ? await listLowStockBalances(onboardingState.branch.id)
    : []

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
              {lowStockBalances.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="Nothing low"
                  description="Every tracked product is above its configured threshold."
                />
              ) : (
                <ul className="flex flex-col gap-3">
                  {lowStockBalances.slice(0, 5).map((balance) => (
                    <li
                      key={balance.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{balance.productName}</span>
                        <span className="text-xs text-muted-foreground">{balance.sku}</span>
                      </div>
                      <Badge variant="destructive">{balance.quantity} left</Badge>
                    </li>
                  ))}
                </ul>
              )}
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
