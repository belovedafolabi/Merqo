import { redirect } from 'next/navigation'

import { getCurrentOrganizationId } from '@/lib/auth/context'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { listLowStockBalances } from '@/lib/inventory/queries'
import { listRecentProducts } from '@/lib/products/queries'
import { getPosProductShortcuts } from '@/lib/pos/catalog'
import { listSales } from '@/lib/sales/queries'
import { getDashboardSeries, getDashboardSummary } from '@/lib/dashboard/summary'
import { activeDashboardWidgets, resolveDashboardWidgets } from '@/lib/dashboard/layout'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { AddWidgetDrawer } from '@/components/dashboard/add-widget-drawer'
import { DashboardGrid, type DashboardData } from '@/components/dashboard/dashboard-grid'

/**
 * The Admin dashboard's Overview. Milestone 04 shipped it with every card a
 * static "₦0" placeholder; this fills them from real queries and makes the
 * card set user-configurable (dashboard_widgets, 20260903090400).
 *
 * The window for the summary/chart is the last 14 days ending now; the
 * summary's day-on-day delta compares that against the 14 days before it
 * (dashboard_sales_summary derives the prior window itself).
 */
const WINDOW_DAYS = 14

export default async function DashboardPage() {
  const organizationId = await getCurrentOrganizationId()
  if (!organizationId) redirect('/sign-in')

  const onboarding = await getOnboardingState()
  const branch = onboarding.branch
  const businessUnit = onboarding.businessUnit

  const [active, allWidgets] = await Promise.all([
    activeDashboardWidgets(organizationId),
    resolveDashboardWidgets(organizationId),
  ])
  const wants = (id: string) => active.some((widget) => widget.id === id)

  const to = new Date()
  const from = new Date(to.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000)

  // Fetch only what the enabled widgets need — a user who has removed a card
  // does not pay for its query.
  const [summary, series, lowStock, recentProducts, recentSales, shortcuts] = await Promise.all([
    branch && (wants('sales_summary') || wants('sales_overview'))
      ? getDashboardSummary(branch.id, from, to)
      : null,
    branch && wants('sales_overview') ? getDashboardSeries(branch.id, from, to) : [],
    branch && wants('low_stock') ? listLowStockBalances(branch.id) : [],
    businessUnit && wants('recent_products') ? listRecentProducts(businessUnit.id) : [],
    branch && wants('recent_sales') ? listSales(branch.id, { limit: 5 }) : [],
    branch && businessUnit && wants('top_products')
      ? getPosProductShortcuts(branch.id, businessUnit.id)
      : { recent: [], top: [] },
  ])

  const data: DashboardData = {
    summary,
    series,
    lowStock,
    recentProducts,
    recentSales,
    topProducts: shortcuts.top,
  }

  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Dashboard">
        <AddWidgetDrawer widgets={allWidgets} />
      </AdminTopbar>

      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <DashboardGrid widgets={active} data={data} />
      </div>
    </div>
  )
}
