import { redirect } from 'next/navigation'
import { TrendingUp } from 'lucide-react'

import { requirePermission } from '@/lib/auth/guard'
import { getOnboardingState, listBusinessUnits } from '@/lib/business-structure/queries'
import { getSalesInsights } from '@/lib/insights/queries'
import { parseInsightsParams, type InsightsSearchParams } from '@/lib/insights/params'
import { getOrganizationProfile } from '@/lib/organization/queries'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { EmptyState } from '@/components/states/empty-state'
import { ForecastSection } from '@/components/insights/forecast-section'
import { InsightsScopeBar } from '@/components/insights/insights-scope-bar'
import { RecomputedCaption } from '@/components/insights/recomputed-caption'
import { RestockSection } from '@/components/insights/restock-section'
import { SlowMoversSection } from '@/components/insights/slow-movers-section'

/**
 * Milestone 17 Part A — the Sales Insights page. Statistics only: per-product
 * demand forecasts, restock suggestions, and slow-mover promo candidates,
 * computed from the sales history already in public.sales / public.sale_items.
 *
 * Scoped per business unit via `?unit=` (there is no cross-unit roll-up in
 * v1). Gated on insights.view — the nav entry, this route, the query, and RLS
 * on the cache table all enforce it.
 */
export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<InsightsSearchParams>
}) {
  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  await requirePermission('insights.view', { organizationId })

  const { businessUnitId: requestedUnitId, horizon } = parseInsightsParams(await searchParams)

  const [units, profile] = await Promise.all([
    listBusinessUnits(organizationId),
    getOrganizationProfile(),
  ])
  const activeUnits = units.filter((unit) => unit.archivedAt === null)

  if (activeUnits.length === 0) {
    return (
      <InsightsShell>
        <EmptyState
          icon={TrendingUp}
          title="No business unit yet"
          description="Set up a business unit and record some sales before insights can be computed."
        />
      </InsightsShell>
    )
  }

  const selectedUnit =
    activeUnits.find((unit) => unit.id === requestedUnitId) ??
    activeUnits.find((unit) => unit.id === onboardingState.businessUnit?.id) ??
    activeUnits[0]
  // activeUnits is non-empty (guarded above), so this is only for the type
  // narrowing noUncheckedIndexedAccess demands.
  if (!selectedUnit) redirect('/dashboard')

  const insights = await getSalesInsights(selectedUnit.id)
  const leadDays = profile?.insightsLeadDays ?? 14

  const hasAnything =
    insights.forecast.length > 0 || insights.restock.length > 0 || insights.slowMovers.length > 0

  return (
    <InsightsShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <InsightsScopeBar
          units={activeUnits.map((unit) => ({
            id: unit.id,
            label: activeUnits.some((other) => other.id !== unit.id && other.name === unit.name)
              ? `${unit.name} · ${unit.branchName}`
              : unit.name,
          }))}
          selectedUnitId={selectedUnit.id}
        />
        <RecomputedCaption computedAt={insights.computedAt} businessUnitId={selectedUnit.id} />
      </div>

      {hasAnything ? (
        <>
          <ForecastSection rows={insights.forecast} horizon={horizon} />
          <RestockSection rows={insights.restock} leadDays={leadDays} />
          <SlowMoversSection rows={insights.slowMovers} />
        </>
      ) : (
        <EmptyState
          icon={TrendingUp}
          title="Not enough sales history yet"
          description={`${selectedUnit.name} hasn't recorded enough sales for a forecast. Insights appear once there is a few weeks of data.`}
        />
      )}
    </InsightsShell>
  )
}

function InsightsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Insights" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">{children}</div>
    </div>
  )
}
