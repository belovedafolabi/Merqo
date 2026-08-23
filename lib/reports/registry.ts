/**
 * The custom report builder's whitelist — the fixed set of datasets,
 * dimensions and metrics a user may compose a report from.
 *
 * docs/Security _Architecture_And_Authorization.md §68 is unconditional:
 * "Raw SQL from custom reports: Never." Milestone 10's Functional
 * Requirements restate it — "the builder only composes queries from a fixed,
 * permission-checked set of dimensions and metrics". This module is that
 * fixed set, and it is the same list the builder UI renders its pickers from,
 * so there is no way to offer a choice in the UI that the server does not
 * accept, or vice versa.
 *
 * THE `key` / `token` SPLIT IS THE POINT. `key` is what the UI and the saved
 * config use. `token` is what crosses into Postgres. They are usually equal
 * and that is fine — what matters is that the value sent to
 * `run_custom_report()` is read from *this* object rather than passed through
 * from the request. A hostile string in a request can therefore never reach
 * SQL: it either matches a `key` here (and is replaced by the corresponding
 * constant `token`) or it fails zod parsing in lib/reports/schemas.ts.
 *
 * Note this is the second of three layers, not the only one. The third —
 * `run_custom_report()`'s own array whitelist in
 * supabase/migrations/20260823141100_create_custom_report_function.sql — is
 * what protects a caller who skips the application entirely and posts
 * straight to `/rest/v1/rpc/run_custom_report`. That is the threat that
 * actually matters, which is why the list is deliberately duplicated in SQL
 * rather than trusted from here. tests/unit/reports/registry.test.ts asserts
 * the two stay in step; adding an entry here without the matching SQL branch
 * fails CI rather than at runtime.
 *
 * `permission`, where present, is an ADDITIONAL requirement on top of
 * `reports.view` — carried on the individual dimension/metric rather than the
 * dataset because sensitivity is not uniform across a dataset. A Cashier may
 * legitimately group sales by day; the same dataset's `gross_profit` metric
 * exposes cost price in aggregate and is gated behind
 * `reports.view_financials`, per
 * docs/Reporting_Analytics_and_Custom_Reports.md §41's "a Cashier may create
 * Sales reports but not Profit reports".
 */

export const DATASET_KEYS = ['sales', 'sale_items', 'expenses'] as const
export type DatasetKey = (typeof DATASET_KEYS)[number]

/** Additional permission gating a cost-bearing dimension or metric. */
export const FINANCIALS_PERMISSION = 'reports.view_financials'

export interface DimensionDef {
  key: string
  label: string
  /** The literal `run_custom_report()`'s `case` matches. Never a caller-supplied string. */
  token: string
  permission?: string
}

export interface MetricDef {
  key: string
  label: string
  token: string
  /** Drives ReportColumn.type, so the exporters format it the same way the screen does. */
  type: 'money' | 'number' | 'quantity'
  permission?: string
}

export interface DatasetDef {
  key: DatasetKey
  label: string
  description: string
  dimensions: readonly DimensionDef[]
  metrics: readonly MetricDef[]
}

/**
 * Complexity ceiling, per docs/Reporting_Analytics_and_Custom_Reports.md §46.
 * These are not arbitrary UI limits — they are the same numbers as
 * `run_custom_report()`'s fixed slots. A builder that allowed an unbounded
 * number of grouped columns could not be expressed without dynamic SQL, which
 * is exactly what §68 forbids, so the limit and the safety property are one
 * decision rather than two.
 */
export const MAX_DIMENSIONS = 2
export const MAX_METRICS = 4
export const MAX_RANGE_DAYS = 366
export const MAX_ROW_LIMIT = 1000
export const DEFAULT_ROW_LIMIT = 100

const SALES_DIMENSIONS: readonly DimensionDef[] = [
  { key: 'day', label: 'Day', token: 'day' },
  { key: 'week', label: 'Week', token: 'week' },
  { key: 'month', label: 'Month', token: 'month' },
  { key: 'branch', label: 'Branch', token: 'branch' },
  { key: 'business_unit', label: 'Business unit', token: 'business_unit' },
  { key: 'employee', label: 'Employee', token: 'employee' },
  { key: 'customer', label: 'Customer', token: 'customer' },
  { key: 'discount_reason', label: 'Discount reason', token: 'discount_reason' },
]

const SALES_METRICS: readonly MetricDef[] = [
  { key: 'sale_count', label: 'Sales', token: 'sale_count', type: 'number' },
  { key: 'gross_sales', label: 'Gross sales', token: 'gross_sales', type: 'money' },
  { key: 'order_discount', label: 'Order discount', token: 'order_discount', type: 'money' },
  { key: 'line_discount', label: 'Line discount', token: 'line_discount', type: 'money' },
  { key: 'net_sales', label: 'Net sales', token: 'net_sales', type: 'money' },
  { key: 'tax', label: 'Tax collected', token: 'tax', type: 'money' },
  { key: 'service_charge', label: 'Service charge', token: 'service_charge', type: 'money' },
  { key: 'total', label: 'Total charged', token: 'total', type: 'money' },
  { key: 'average_sale', label: 'Average sale', token: 'average_sale', type: 'money' },
  { key: 'quantity_sold', label: 'Items sold', token: 'quantity_sold', type: 'quantity' },
  {
    key: 'cogs',
    label: 'Cost of goods sold',
    token: 'cogs',
    type: 'money',
    permission: FINANCIALS_PERMISSION,
  },
  {
    key: 'gross_profit',
    label: 'Gross profit',
    token: 'gross_profit',
    type: 'money',
    permission: FINANCIALS_PERMISSION,
  },
]

const SALE_ITEM_DIMENSIONS: readonly DimensionDef[] = [
  { key: 'day', label: 'Day', token: 'day' },
  { key: 'month', label: 'Month', token: 'month' },
  { key: 'product', label: 'Product', token: 'product' },
  { key: 'variant', label: 'Variant', token: 'variant' },
  { key: 'category', label: 'Category', token: 'category' },
  { key: 'branch', label: 'Branch', token: 'branch' },
  { key: 'business_unit', label: 'Business unit', token: 'business_unit' },
]

const SALE_ITEM_METRICS: readonly MetricDef[] = [
  { key: 'line_count', label: 'Lines', token: 'line_count', type: 'number' },
  { key: 'quantity_sold', label: 'Quantity sold', token: 'quantity_sold', type: 'quantity' },
  { key: 'gross_sales', label: 'Gross sales', token: 'gross_sales', type: 'money' },
  { key: 'line_discount', label: 'Line discount', token: 'line_discount', type: 'money' },
  { key: 'net_sales', label: 'Net sales', token: 'net_sales', type: 'money' },
  {
    key: 'average_unit_price',
    label: 'Average unit price',
    token: 'average_unit_price',
    type: 'money',
  },
  {
    key: 'cogs',
    label: 'Cost of goods sold',
    token: 'cogs',
    type: 'money',
    permission: FINANCIALS_PERMISSION,
  },
  {
    key: 'gross_profit',
    label: 'Gross profit',
    token: 'gross_profit',
    type: 'money',
    permission: FINANCIALS_PERMISSION,
  },
]

const EXPENSE_DIMENSIONS: readonly DimensionDef[] = [
  { key: 'day', label: 'Day', token: 'day' },
  { key: 'month', label: 'Month', token: 'month' },
  { key: 'category', label: 'Category', token: 'category' },
  { key: 'branch', label: 'Branch', token: 'branch' },
  { key: 'business_unit', label: 'Business unit', token: 'business_unit' },
  { key: 'payment_method', label: 'Payment method', token: 'payment_method' },
  { key: 'status', label: 'Status', token: 'status' },
]

/**
 * Every expense metric carries the financials permission. Unlike sales — where
 * revenue is ordinary operational information and only cost is sensitive —
 * there is no non-sensitive way to read an expense total: what the business
 * spends is management information in its entirety.
 */
const EXPENSE_METRICS: readonly MetricDef[] = [
  {
    key: 'expense_count',
    label: 'Expenses',
    token: 'expense_count',
    type: 'number',
    permission: FINANCIALS_PERMISSION,
  },
  {
    key: 'total_amount',
    label: 'Total amount',
    token: 'total_amount',
    type: 'money',
    permission: FINANCIALS_PERMISSION,
  },
  {
    key: 'approved_amount',
    label: 'Approved',
    token: 'approved_amount',
    type: 'money',
    permission: FINANCIALS_PERMISSION,
  },
  {
    key: 'pending_amount',
    label: 'Pending',
    token: 'pending_amount',
    type: 'money',
    permission: FINANCIALS_PERMISSION,
  },
  {
    key: 'rejected_amount',
    label: 'Rejected',
    token: 'rejected_amount',
    type: 'money',
    permission: FINANCIALS_PERMISSION,
  },
  {
    key: 'voided_amount',
    label: 'Voided',
    token: 'voided_amount',
    type: 'money',
    permission: FINANCIALS_PERMISSION,
  },
  {
    key: 'average_amount',
    label: 'Average amount',
    token: 'average_amount',
    type: 'money',
    permission: FINANCIALS_PERMISSION,
  },
]

export const REPORT_DATASETS: Readonly<Record<DatasetKey, DatasetDef>> = {
  sales: {
    key: 'sales',
    label: 'Sales',
    description: 'One row per completed sale, grouped however you choose.',
    dimensions: SALES_DIMENSIONS,
    metrics: SALES_METRICS,
  },
  sale_items: {
    key: 'sale_items',
    label: 'Sale items',
    description: 'One row per cart line — the dataset for product and category analysis.',
    dimensions: SALE_ITEM_DIMENSIONS,
    metrics: SALE_ITEM_METRICS,
  },
  expenses: {
    key: 'expenses',
    label: 'Expenses',
    description: 'Recorded business expenses, by category, branch or approval status.',
    dimensions: EXPENSE_DIMENSIONS,
    metrics: EXPENSE_METRICS,
  },
}

export function findDimension(dataset: DatasetKey, key: string): DimensionDef | undefined {
  return REPORT_DATASETS[dataset].dimensions.find((dimension) => dimension.key === key)
}

export function findMetric(dataset: DatasetKey, key: string): MetricDef | undefined {
  return REPORT_DATASETS[dataset].metrics.find((metric) => metric.key === key)
}

/**
 * Every extra permission any of this dataset's selected fields requires.
 * Returned as a list rather than checked here, because this module is pure —
 * lib/reports/custom.ts does the actual requirePermission() calls, keeping the
 * registry free of server-only imports so the builder UI can import it too.
 */
export function requiredPermissionsFor(
  dataset: DatasetKey,
  dimensionKeys: readonly string[],
  metricKeys: readonly string[],
): string[] {
  const permissions = new Set<string>()

  for (const key of dimensionKeys) {
    const permission = findDimension(dataset, key)?.permission
    if (permission) permissions.add(permission)
  }
  for (const key of metricKeys) {
    const permission = findMetric(dataset, key)?.permission
    if (permission) permissions.add(permission)
  }

  return [...permissions]
}
