import { getCurrentUserContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/guard'
import { resolvePermission } from '@/lib/auth/permissions'
import { logger } from '@/lib/logger'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  buildAccountingSummary,
  EMPTY_AGGREGATES,
  type AccountingAggregates,
  type AccountingSummary,
} from '@/lib/reports/accounting'
import { findStandardReport, type StandardReportDef } from '@/lib/reports/catalog'
import { reportParametersSchema } from '@/lib/reports/schemas'
import { finishReport, toNumber, toText } from '@/lib/reports/run'
import type { ReportCellValue, ReportParameters, ReportResult } from '@/lib/reports/types'

/**
 * Execution of the standard report catalog.
 *
 * The authorization story here has two halves, and it is worth being precise
 * about which does what, because relying on either alone would be a bug:
 *
 *   requirePermission() decides whether the caller may run this report at all.
 *   That check has to live here, because `sales_select` gates on branch access
 *   alone — any org member can read their own branch's sales rows, so RLS by
 *   itself would let anyone run a sales report.
 *
 *   RLS decides which rows a permitted report returns. The functions in
 *   supabase/migrations/20260823141000_create_report_functions.sql are
 *   SECURITY INVOKER precisely so that a branch-scoped user's report is
 *   filtered by the same policies that filter their ordinary queries — not by
 *   a WHERE clause this file remembered to add. See that migration's header.
 *
 * Both halves are exercised in tests/integration/reports-security.test.ts.
 */

/** Permissions that alter what a report shows, resolved once per call. */
const CONTEXTUAL_PERMISSIONS = [
  'reports.view_financials',
  'reports.export',
  'reports.view_all_branches',
] as const

async function grantedPermissionsFor(parameters: ReportParameters): Promise<string[]> {
  const { grants } = await getCurrentUserContext()
  const scope = {
    organizationId: parameters.organizationId,
    ...(parameters.branchId ? { branchId: parameters.branchId } : {}),
    ...(parameters.businessUnitId ? { businessUnitId: parameters.businessUnitId } : {}),
  }

  return CONTEXTUAL_PERMISSIONS.filter((key) => resolvePermission(grants, key, scope))
}

/**
 * Parameters are re-parsed here rather than trusted from the caller. Every
 * entry point into this module is a Server Action or Route Handler, which
 * means the input crossed a network boundary and is untrusted regardless of
 * what its TypeScript type claims.
 */
function parseParameters(parameters: ReportParameters): ReportParameters {
  return reportParametersSchema.parse(parameters)
}

/**
 * Arguments shared by every report function. Built from one place so a
 * parameter added to the SQL family cannot be wired into some callers and
 * silently omitted from others.
 */
function scopeArgs(parameters: ReportParameters) {
  return {
    p_organization_id: parameters.organizationId,
    p_branch_id: parameters.branchId,
    p_business_unit_id: parameters.businessUnitId,
    p_from: parameters.from,
    p_to: parameters.to,
    p_limit: parameters.limit,
  }
}

/**
 * The report-specific arguments each function takes beyond the shared scope.
 * Kept as an explicit switch rather than a generic spread: these signatures
 * genuinely differ, and a generic "pass everything" call would send
 * `p_group_by` to a function that has no such parameter and fail at runtime
 * with a PostgREST signature-mismatch error nobody can read.
 */
function reportArgs(
  report: StandardReportDef,
  parameters: ReportParameters,
): Record<string, unknown> {
  const base = scopeArgs(parameters)

  switch (report.rpc) {
    case 'report_inventory_stock':
      return {
        p_organization_id: parameters.organizationId,
        p_branch_id: parameters.branchId,
        p_business_unit_id: parameters.businessUnitId,
        p_low_stock_only: report.id === 'inventory-low-stock',
        p_limit: parameters.limit,
      }

    case 'report_expiry':
      return {
        p_organization_id: parameters.organizationId,
        p_branch_id: parameters.branchId,
        // The expiry window, not a date range — see the function's own comment.
        p_days_ahead: 30,
        p_limit: parameters.limit,
      }

    case 'report_store_credit':
      // Store credit follows the customer, who belongs to the organization
      // rather than to a branch — the same reasoning as customers_select. A
      // branch filter here would be meaningless.
      return {
        p_organization_id: parameters.organizationId,
        p_from: parameters.from,
        p_to: parameters.to,
        p_limit: parameters.limit,
      }

    case 'report_layaways':
      return { ...base, p_status: null }

    case 'report_sales_by_payment_method':
    case 'report_inventory_movements':
    case 'report_customer_transactions':
      return base

    default:
      return { ...base, p_group_by: parameters.groupBy ?? report.groupings[0]?.value ?? null }
  }
}

/**
 * Maps a raw PostgREST row onto the report's declared columns, coercing by the
 * column's own declared type. Driving the mapping from the catalog rather than
 * from the row's own keys is what guarantees the screen, the CSV and the Excel
 * file contain the same fields in the same order — a report result whose shape
 * depended on which keys happened to come back would differ between an empty
 * period and a busy one.
 */
function mapRow(
  report: StandardReportDef,
  row: Record<string, unknown>,
): Record<string, ReportCellValue> {
  const mapped: Record<string, ReportCellValue> = {}

  for (const column of report.columns) {
    const raw = row[column.key]
    mapped[column.key] =
      column.type === 'money' || column.type === 'number' || column.type === 'quantity'
        ? toNumber(raw)
        : toText(raw)
  }

  return mapped
}

/**
 * Runs one report from the catalog.
 *
 * Throws AuthorizationError (via requirePermission) rather than returning an
 * empty result when the caller lacks permission — an empty report and a
 * forbidden one must not look the same to the reader.
 */
export async function runStandardReport(
  reportId: string,
  rawParameters: ReportParameters,
): Promise<ReportResult> {
  const report = findStandardReport(reportId)
  if (!report) throw new Error(`Unknown report: ${reportId}`)

  const parameters = parseParameters(rawParameters)
  const scope = {
    organizationId: parameters.organizationId,
    ...(parameters.branchId ? { branchId: parameters.branchId } : {}),
  }

  await requirePermission('reports.view', scope)
  if (report.permission) await requirePermission(report.permission, scope)

  const startedAt = performance.now()
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.rpc(report.rpc, reportArgs(report, parameters))
  if (error) throw error

  return finishReport({
    id: report.id,
    title: report.title,
    columns: report.columns,
    rows: ((data ?? []) as Record<string, unknown>[]).map((row) => mapRow(report, row)),
    parameters,
    grantedPermissions: await grantedPermissionsFor(parameters),
    startedAt,
  })
}

// ---------------------------------------------------------------------------
// Accounting summary
// ---------------------------------------------------------------------------

interface AggregateRow {
  sale_count: string | number
  gross_sales: string | number
  line_discounts: string | number
  order_discounts: string | number
  tax_collected: string | number
  service_charge_collected: string | number
  sale_cogs: string | number
  return_cogs: string | number
  refunds_approved: string | number
  refund_count: string | number
  expenses_approved: string | number
  expense_count: string | number
}

function toAggregates(row: AggregateRow | undefined): AccountingAggregates {
  if (!row) return EMPTY_AGGREGATES

  const n = (value: string | number) => toNumber(value) ?? 0

  return {
    saleCount: n(row.sale_count),
    grossSales: n(row.gross_sales),
    lineDiscounts: n(row.line_discounts),
    orderDiscounts: n(row.order_discounts),
    taxCollected: n(row.tax_collected),
    serviceChargeCollected: n(row.service_charge_collected),
    saleCogs: n(row.sale_cogs),
    returnCogs: n(row.return_cogs),
    refundsApproved: n(row.refunds_approved),
    refundCount: n(row.refund_count),
    expensesApproved: n(row.expenses_approved),
    expenseCount: n(row.expense_count),
  }
}

/**
 * docs/PRD.md §27's accounting module, assembled.
 *
 * Four queries rather than one: the raw aggregates, plus the payment, store
 * credit and layaway breakdowns that §27 lists alongside them. They run
 * concurrently because none depends on another's result, and the summary is
 * then derived by lib/reports/accounting.ts — this function does no arithmetic
 * of its own, deliberately. See that module's header for why the summing and
 * the deriving live in different places.
 *
 * Gated on `reports.view_financials`, not merely `reports.view`: this is the
 * screen that puts cost of goods and profit on one page.
 */
export async function getAccountingSummary(
  rawParameters: ReportParameters,
): Promise<AccountingSummary> {
  const parameters = parseParameters(rawParameters)
  const scope = {
    organizationId: parameters.organizationId,
    ...(parameters.branchId ? { branchId: parameters.branchId } : {}),
  }

  await requirePermission('reports.view', scope)
  await requirePermission('reports.view_financials', scope)

  const startedAt = performance.now()
  const supabase = await createServerSupabaseClient()

  const [aggregatesResult, paymentsResult, storeCreditResult, layawaysResult] = await Promise.all([
    supabase.rpc('report_accounting_aggregates', {
      p_organization_id: parameters.organizationId,
      p_branch_id: parameters.branchId,
      p_business_unit_id: parameters.businessUnitId,
      p_from: parameters.from,
      p_to: parameters.to,
    }),
    supabase.rpc('report_sales_by_payment_method', scopeArgs(parameters)),
    supabase.rpc('report_store_credit', {
      p_organization_id: parameters.organizationId,
      p_from: parameters.from,
      p_to: parameters.to,
      p_limit: parameters.limit,
    }),
    supabase.rpc('report_layaways', { ...scopeArgs(parameters), p_status: null }),
  ])

  for (const result of [aggregatesResult, paymentsResult, storeCreditResult, layawaysResult]) {
    if (result.error) throw result.error
  }

  const summary = buildAccountingSummary({
    aggregates: toAggregates((aggregatesResult.data as AggregateRow[])?.[0]),
    payments: ((paymentsResult.data ?? []) as Record<string, unknown>[]).map((row) => ({
      method: toText(row.group_label) ?? 'Unknown',
      count: toNumber(row.payment_count) ?? 0,
      amount: toNumber(row.amount) ?? 0,
    })),
    storeCredit: ((storeCreditResult.data ?? []) as Record<string, unknown>[]).map((row) => ({
      balance: toNumber(row.balance) ?? 0,
      issued: toNumber(row.issued) ?? 0,
      spent: toNumber(row.spent) ?? 0,
    })),
    layaways: ((layawaysResult.data ?? []) as Record<string, unknown>[]).map((row) => ({
      status: (toText(row.status) ?? 'active') as 'active' | 'paid' | 'cancelled',
      totalAmount: toNumber(row.total_amount) ?? 0,
      amountPaid: toNumber(row.amount_paid) ?? 0,
    })),
  })

  // Same Observability requirement as finishReport(), which this path does not
  // go through because its output is a summary rather than a table.
  logger.info('report.executed', {
    reportId: 'accounting-summary',
    durationMs: Math.round(performance.now() - startedAt),
    rowCount: summary.saleCount,
    branchId: parameters.branchId,
  })

  return summary
}
