import Link from 'next/link'
import { ArrowRight, Boxes, Calculator, Pin, Receipt, Users, Wrench } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  REPORT_CATEGORY_LABELS,
  STANDARD_REPORTS,
  findStandardReport,
  type ReportCategory,
  type StandardReportDef,
} from '@/lib/reports/catalog'

const CATEGORY_ICONS: Record<ReportCategory, typeof Receipt> = {
  sales: Receipt,
  financial: Calculator,
  inventory: Boxes,
  customer: Users,
}

/**
 * The report catalog — docs/PRD.md §28's four families, grouped so a reader
 * scanning for "what can I find out about stock" has one place to look rather
 * than fourteen equally-weighted links.
 *
 * Reports the caller cannot run are omitted entirely rather than shown
 * disabled. A greyed-out "Gross profit" tile tells a cashier exactly what
 * exists and that they are not trusted with it, which is information the
 * catalog has no reason to volunteer.
 */
export function ReportCatalog({
  grantedPermissions,
  pinnedReportIds = [],
}: {
  grantedPermissions: readonly string[]
  /** Milestone 17 Part B — this unit's pinned reports, surfaced first. */
  pinnedReportIds?: readonly string[]
}) {
  const visible = STANDARD_REPORTS.filter(
    (report) => !report.permission || grantedPermissions.includes(report.permission),
  )
  const isVisible = (report: StandardReportDef) => visible.includes(report)

  const pinned = pinnedReportIds
    .map((id) => findStandardReport(id))
    .filter((report): report is StandardReportDef => report !== undefined && isVisible(report))

  const categories = (['sales', 'financial', 'inventory', 'customer'] as const).filter((category) =>
    visible.some((report) => report.category === category),
  )

  return (
    <div className="flex flex-col gap-6">
      {pinned.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-body-sm font-semibold tracking-wide text-muted-foreground uppercase">
            <Pin className="size-3.5" /> Pinned
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pinned.map((report) => (
              <ReportTile key={`pinned-${report.id}`} report={report} />
            ))}
          </div>
        </section>
      )}

      {categories.map((category) => (
        <section key={category} className="flex flex-col gap-3">
          <h2 className="text-body-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {REPORT_CATEGORY_LABELS[category]}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible
              .filter((report) => report.category === category)
              .map((report) => (
                <ReportTile key={report.id} report={report} />
              ))}
          </div>
        </section>
      ))}

      {grantedPermissions.includes('reports.save') && (
        <section className="flex flex-col gap-3">
          <h2 className="text-body-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Build your own
          </h2>
          <Link
            href="/reports/builder"
            className={cn(
              'group flex items-center justify-between gap-4 rounded-lg border bg-card p-5 shadow-card transition-colors',
              'hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            )}
          >
            <span className="flex min-w-0 items-start gap-3">
              <Wrench className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">Custom report builder</span>
                <span className="text-body-sm text-muted-foreground">
                  Pick a dataset, choose what to group by, and save the result for reuse.
                </span>
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        </section>
      )}
    </div>
  )
}

/**
 * Styled as a card but built as a plain `<Link>` rather than wrapping one in
 * `<Card>`: the whole tile should be the click target, and `Card` in this
 * codebase is a plain `<div>` with no `asChild` escape hatch — nesting a link
 * inside it would leave most of the tile's surface inert.
 */
function ReportTile({ report }: { report: StandardReportDef }) {
  const Icon = CATEGORY_ICONS[report.category]

  return (
    <Link
      href={`/reports/${report.id}`}
      className={cn(
        'group flex h-full flex-col gap-2 rounded-xl border bg-card p-5 shadow-card transition-colors',
        'hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
      )}
    >
      <span className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 font-medium">{report.title}</span>
        <ArrowRight className="mt-0.5 ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </span>
      <span className="text-body-sm text-muted-foreground">{report.description}</span>
    </Link>
  )
}
