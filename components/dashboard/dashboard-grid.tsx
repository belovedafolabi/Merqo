import Link from 'next/link'
import { Package } from 'lucide-react'

import { StatCard } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/states/empty-state'
import { SalesOverviewChart } from '@/components/dashboard/sales-overview-chart'
import { SalesPerformanceCard } from '@/components/dashboard/sales-performance-card'
import { deltaLabel, type DashboardSummary, type DashboardSeriesPoint } from '@/lib/dashboard/types'
import type { DashboardPeriod } from '@/lib/dashboard/periods'
import type { ResolvedWidget } from '@/lib/dashboard/layout'
import type { InventoryBalance } from '@/lib/inventory/queries'
import type { RecentProduct } from '@/lib/products/queries'
import type { PosProductShortcut } from '@/lib/pos/catalog'
import type { SaleListEntry } from '@/lib/sales/sale-list'
import { formatPaymentMethods, shortSaleRef } from '@/lib/sales/sale-list'

function money(value: number): string {
  return value.toLocaleString('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  })
}

export type PerformanceBundle = Record<
  DashboardPeriod,
  { summary: DashboardSummary; series: DashboardSeriesPoint[] }
>

export interface DashboardData {
  summary: DashboardSummary | null
  series: DashboardSeriesPoint[]
  performance: PerformanceBundle | null
  lowStock: InventoryBalance[]
  recentProducts: RecentProduct[]
  recentSales: SaleListEntry[]
  topProducts: PosProductShortcut[]
}

/**
 * Renders the enabled dashboard widgets in order. A `switch` on the widget id
 * rather than a registry of components: the set is small, fixed, and each
 * widget needs a different slice of the pre-fetched `data`, so the mapping is
 * clearest read top to bottom.
 */
export function DashboardGrid({
  widgets,
  data,
}: {
  widgets: ResolvedWidget[]
  data: DashboardData
}) {
  if (widgets.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No widgets on your dashboard"
        description="Use “Add widget” to choose what appears here."
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {widgets.map((widget) => {
        switch (widget.id) {
          case 'sales_summary':
            return <SalesSummaryWidget key={widget.id} summary={data.summary} />
          case 'sales_overview':
            return (
              <Card key={widget.id} className="shadow-card lg:col-span-2">
                <CardHeader>
                  <CardTitle>Sales overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <SalesOverviewChart series={data.series} />
                </CardContent>
              </Card>
            )
          case 'sales_performance':
            return data.performance ? (
              <SalesPerformanceCard key={widget.id} bundle={data.performance} />
            ) : null
          case 'low_stock':
            return <LowStockWidget key={widget.id} balances={data.lowStock} />
          case 'recent_products':
            return <RecentProductsWidget key={widget.id} products={data.recentProducts} />
          case 'recent_sales':
            return <RecentSalesWidget key={widget.id} sales={data.recentSales} />
          case 'top_products':
            return <TopProductsWidget key={widget.id} products={data.topProducts} />
          default:
            return null
        }
      })}
    </div>
  )
}

function SalesSummaryWidget({ summary }: { summary: DashboardSummary | null }) {
  const s = summary ?? {
    saleCount: 0,
    netSales: 0,
    averageSale: 0,
    priorSaleCount: 0,
    priorNetSales: 0,
    priorAverageSale: 0,
    grossSales: 0,
    collected: 0,
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-3">
      <StatCard
        label="Sales today"
        value={money(s.netSales)}
        delta={deltaLabel(s.netSales, s.priorNetSales) ?? undefined}
        tone="inverted"
      />
      <StatCard
        label="Transactions"
        value={String(s.saleCount)}
        delta={deltaLabel(s.saleCount, s.priorSaleCount) ?? undefined}
      />
      <StatCard
        label="Average sale"
        value={money(s.averageSale)}
        delta={deltaLabel(s.averageSale, s.priorAverageSale) ?? undefined}
      />
    </div>
  )
}

function LowStockWidget({ balances }: { balances: InventoryBalance[] }) {
  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>Low stock</CardTitle>
      </CardHeader>
      <CardContent>
        {balances.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Nothing low"
            description="Every product is above its threshold. Set a default in Settings → Organization if this looks empty."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {balances.slice(0, 5).map((balance) => (
              <li key={balance.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{balance.productName}</span>
                  <span className="text-xs text-muted-foreground">{balance.sku}</span>
                </div>
                <Badge variant="destructive">{balance.availableQuantity} left</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function RecentProductsWidget({ products }: { products: RecentProduct[] }) {
  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>Recent products</CardTitle>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No products yet"
            description="Add a product from the Products screen to start selling."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {products.map((product) => (
              <li key={product.id} className="flex items-center justify-between gap-3 text-sm">
                <Link
                  href={`/products/${product.id}`}
                  className="flex min-w-0 flex-col hover:underline"
                >
                  <span className="truncate font-medium">{product.name}</span>
                  <span className="text-xs text-muted-foreground">{product.sku}</span>
                </Link>
                <span className="shrink-0 tabular-nums">{money(product.basePrice)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function RecentSalesWidget({ sales }: { sales: SaleListEntry[] }) {
  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>Recent sales</CardTitle>
      </CardHeader>
      <CardContent>
        {sales.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No sales yet"
            description="Completed sales at this branch will appear here."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {sales.map((sale) => (
              <li key={sale.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 flex-col">
                  <span className="font-mono text-xs">#{shortSaleRef(sale.id)}</span>
                  <span className="text-xs text-muted-foreground">
                    {sale.itemCount} item{sale.itemCount === 1 ? '' : 's'} ·{' '}
                    {formatPaymentMethods(sale.paymentMethods)}
                  </span>
                </div>
                <span className="shrink-0 tabular-nums">{money(sale.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function TopProductsWidget({ products }: { products: PosProductShortcut[] }) {
  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>Top products</CardTitle>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Not enough data yet"
            description="Best sellers over the last 30 days will appear here."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {products.slice(0, 5).map((product) => (
              <li key={product.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{product.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {product.quantitySold} sold
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
