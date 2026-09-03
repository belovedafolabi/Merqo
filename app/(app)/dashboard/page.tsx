import { redirect } from 'next/navigation'

import { getCurrentOrganizationId } from '@/lib/auth/context'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { listLowStockBalances } from '@/lib/inventory/queries'
import { getDefaultLowStockThreshold } from '@/lib/organization/queries'
import { listRecentProducts } from '@/lib/products/queries'
import { getPosProductShortcuts } from '@/lib/pos/catalog'
import { listSales } from '@/lib/sales/queries'
import {
  getDashboardSeries,
  getDashboardSummary,
  type DashboardSeriesPoint,
  type DashboardSummary,
} from '@/lib/dashboard/summary'
import { dashboardWindow, trailingDays, type DashboardPeriod } from '@/lib/dashboard/periods'
import { activeDashboardWidgets, resolveDashboardWidgets } from '@/lib/dashboard/layout'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { AddWidgetDrawer } from '@/components/dashboard/add-widget-drawer'
import {
  DashboardGrid,
  type DashboardData,
  type PerformanceBundle,
} from '@/components/dashboard/dashboard-grid'

/**
 * The Admin dashboard's Overview. Milestone 04 shipped it with every card a
 * static "₦0" placeholder; this fills them from real queries and makes the
 * card set user-configurable (dashboard_widgets, 20260903090400).
 *
 * WINDOWS. The "Sales summary" card is genuinely *today* (local calendar day,
 * per lib/dashboard/periods.ts) — its label always said "Sales today" but it
 * was fed a trailing 14-day total. The "Sales overview" chart keeps a trailing
 * two-week range. The optional "Sales performance" card carries its own four
 * windows (today / month-to-date / year-to-date / all-time).
 */
const OVERVIEW_DAYS = 14

/** Chart range per performance period — the summary numbers use the true
 *  period window; the trend is capped so "all time" isn't ~9000 daily points. */
const PERFORMANCE_CHART_DAYS: Record<DashboardPeriod, number> = {
  today: 14,
  month: 31,
  year: 365,
  all: 365,
}

async function loadPerformance(branchId: string): Promise<PerformanceBundle> {
  const periods: DashboardPeriod[] = ['today', 'month', 'year', 'all']
  const entries = await Promise.all(
    periods.map(async (period) => {
      const { from, to } = dashboardWindow(period)
      const chart = trailingDays(PERFORMANCE_CHART_DAYS[period])
      const [summary, series] = await Promise.all([
        getDashboardSummary(branchId, from, to),
        getDashboardSeries(branchId, chart.from, chart.to),
      ])
      return [period, { summary, series }] as const
    }),
  )
  return Object.fromEntries(entries) as PerformanceBundle
}

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

  const today = dashboardWindow('today')
  const overview = trailingDays(OVERVIEW_DAYS)

  const orgLowStockDefault =
    branch && wants('low_stock') ? await getDefaultLowStockThreshold(organizationId) : null

  // Fetch only what the enabled widgets need — a user who has removed a card
  // does not pay for its query.
  const [summary, series, lowStock, recentProducts, recentSales, shortcuts, performance] =
    await Promise.all([
      branch && wants('sales_summary')
        ? getDashboardSummary(branch.id, today.from, today.to)
        : null,
      branch && wants('sales_overview')
        ? getDashboardSeries(branch.id, overview.from, overview.to)
        : ([] as DashboardSeriesPoint[]),
      branch && wants('low_stock') ? listLowStockBalances(branch.id, orgLowStockDefault) : [],
      businessUnit && wants('recent_products') ? listRecentProducts(businessUnit.id) : [],
      branch && wants('recent_sales') ? listSales(branch.id, { limit: 5 }) : [],
      branch && businessUnit && wants('top_products')
        ? getPosProductShortcuts(branch.id, businessUnit.id)
        : { recent: [], top: [] },
      branch && wants('sales_performance') ? loadPerformance(branch.id) : null,
    ])

  const data: DashboardData = {
    summary: summary as DashboardSummary | null,
    series,
    performance,
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
