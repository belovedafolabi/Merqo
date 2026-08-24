import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { StatCard } from '@/components/ui/stat-card'
import { ReportFilterBar, type BranchOption } from '@/components/reports/report-filter-bar'
import { cn } from '@/lib/utils'
import type { AccountingSummary } from '@/lib/reports/accounting'
import type { ReportParameters } from '@/lib/reports/types'

function currency(value: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value)
}

/**
 * The accounting summary — docs/PRD.md §27's intermediate accounting module on
 * one page.
 *
 * Two presentation decisions carry real meaning rather than being styling:
 *
 * The headline figure is labelled from `summary.netProfitLabel`, which reads
 * "Estimated operational profit" — §34's own wording. Calling it "net profit"
 * unqualified would invite an owner to treat a figure that excludes
 * depreciation and unrecorded payroll as something they could file taxes on.
 *
 * Tax and service charge sit in a separate "Collected, not earned" block
 * rather than among the revenue figures. §29–30 are explicit that neither is
 * business revenue, and putting them in the same visual group as revenue is
 * exactly how a reader would come to believe otherwise.
 */
export function AccountingSummaryView({
  summary,
  parameters,
  branches,
  canViewAllBranches,
}: {
  summary: AccountingSummary
  parameters: ReportParameters
  branches: BranchOption[]
  canViewAllBranches: boolean
}) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <ReportFilterBar
        parameters={parameters}
        branches={branches}
        groupings={[]}
        dateRanged
        canViewAllBranches={canViewAllBranches}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue" value={currency(summary.revenue)} />
        <StatCard label="Cost of goods sold" value={currency(summary.cogs)} />
        <StatCard label="Gross profit" value={currency(summary.grossProfit)} />
        <StatCard
          label={summary.netProfitLabel}
          value={currency(summary.netProfit)}
          tone="inverted"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>How the profit was reached</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-body-sm">
            <Line label="Gross sales" value={currency(summary.grossSales)} />
            <Line label="Discounts" value={`−${currency(summary.discounts)}`} muted />
            <Separator />
            <Line label="Net sales" value={currency(summary.revenue)} />
            <Line
              label={`Refunds (${summary.refundCount})`}
              value={`−${currency(summary.refunds)}`}
              muted
            />
            <Separator />
            <Line label="Net sales after refunds" value={currency(summary.netSalesAfterRefunds)} />
            <Line label="Cost of goods sold" value={`−${currency(summary.cogs)}`} muted />
            <Separator />
            <Line label="Gross profit" value={currency(summary.grossProfit)} strong />
            <Line
              label={`Expenses (${summary.expenseCount})`}
              value={`−${currency(summary.expenses)}`}
              muted
            />
            <Separator />
            <Line label={summary.netProfitLabel} value={currency(summary.netProfit)} strong />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Collected, not earned</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-body-sm">
              <p className="text-muted-foreground">
                Held on behalf of others, and deliberately excluded from revenue above.
              </p>
              <Line label="Tax collected" value={currency(summary.taxPayable)} />
              <Line label="Service charge" value={currency(summary.serviceCharge)} />
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Payments taken</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-body-sm">
              {summary.payments.methods.length === 0 ? (
                <p className="text-muted-foreground">No payments in this period.</p>
              ) : (
                <>
                  {summary.payments.methods.map((method) => (
                    <Line
                      key={method.method}
                      label={`${method.method} (${method.count})`}
                      value={currency(method.amount)}
                      capitalize
                    />
                  ))}
                  <Separator />
                  <Line label="Total" value={currency(summary.payments.totalAmount)} strong />
                </>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Outstanding to customers</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-body-sm">
              <p className="text-muted-foreground">
                Liabilities, not income — money and goods already owed.
              </p>
              <Line
                label={`Store credit (${summary.storeCredit.accountCount} ${
                  summary.storeCredit.accountCount === 1 ? 'account' : 'accounts'
                })`}
                value={currency(summary.storeCredit.outstanding)}
              />
              <Line
                label={`Layaways outstanding (${summary.layaways.activeCount} active)`}
                value={currency(summary.layaways.outstanding)}
              />
              <Line
                label="Layaway instalments collected"
                value={currency(summary.layaways.collected)}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Line({
  label,
  value,
  muted,
  strong,
  capitalize,
}: {
  label: string
  value: string
  muted?: boolean
  strong?: boolean
  /**
   * Only for labels that come from the database in lower case — payment method
   * names. Applying it to every row title-cases written English into
   * "Net Sales After Refunds", which reads like a spreadsheet header rather
   * than a sentence.
   */
  capitalize?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span
        className={cn(muted && 'text-muted-foreground', capitalize && 'first-letter:uppercase')}
      >
        {label}
      </span>
      <span className={cn('tabular-nums', strong && 'font-semibold')}>{value}</span>
    </div>
  )
}
