import { requirePermission } from '@/lib/auth/guard'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ReportColumnDef } from '@/lib/reports/catalog'
import {
  REPORT_DATASETS,
  findDimension,
  findMetric,
  requiredPermissionsFor,
} from '@/lib/reports/registry'
import { customReportConfigSchema, reportParametersSchema } from '@/lib/reports/schemas'
import { finishReport, toNumber, toText } from '@/lib/reports/run'
import type { CustomReportConfig } from '@/lib/reports/schemas'
import type { ReportCellValue, ReportParameters, ReportResult } from '@/lib/reports/types'

/**
 * Execution of a custom report — the second of the three layers described in
 * lib/reports/registry.ts's header.
 *
 * The whole of this module's security contribution is one property, visible in
 * `toEngineArgs()` below: **no string from the caller reaches the database.**
 * The config is parsed against closed enums, and then every value sent to
 * `run_custom_report()` is read out of the registry as `def.token` — a
 * compile-time constant. If `config.dimensions[0]` were passed through
 * directly the schema would still reject anything hostile, but the guarantee
 * would rest on the schema being right. This way it rests on there being no
 * path at all.
 *
 * The permission check is per *field*, not per report. A user with
 * `reports.view` may group sales by day; adding `gross_profit` to the same
 * report requires `reports.view_financials`, because that column is cost data
 * in aggregate (docs/Reporting_Analytics_and_Custom_Reports.md §41). Checking
 * once at the report level would mean the sensitivity of a report depended on
 * which screen it was opened from.
 */

/** The engine's fixed slots — see run_custom_report()'s header. */
interface EngineArgs {
  p_organization_id: string
  p_dataset: string
  p_dimension_1: string | null
  p_dimension_2: string | null
  p_metric_1: string | null
  p_metric_2: string | null
  p_metric_3: string | null
  p_metric_4: string | null
  p_branch_id: string | null
  p_business_unit_id: string | null
  p_from: string | null
  p_to: string | null
  p_sort: string
  p_sort_direction: string
  p_limit: number
}

function toEngineArgs(config: CustomReportConfig, parameters: ReportParameters): EngineArgs {
  // Registry lookups, not passthrough. A key that survived parsing but has no
  // registry entry would be a bug in the schema rather than an attack, and
  // sending null is the safe way to fail — run_custom_report() raises on a
  // null dimension_1 rather than quietly grouping by nothing.
  const dimensionToken = (index: number) =>
    config.dimensions[index]
      ? (findDimension(config.dataset, config.dimensions[index])?.token ?? null)
      : null
  const metricToken = (index: number) =>
    config.metrics[index]
      ? (findMetric(config.dataset, config.metrics[index])?.token ?? null)
      : null

  return {
    p_organization_id: parameters.organizationId,
    p_dataset: REPORT_DATASETS[config.dataset].key,
    p_dimension_1: dimensionToken(0),
    p_dimension_2: dimensionToken(1),
    p_metric_1: metricToken(0),
    p_metric_2: metricToken(1),
    p_metric_3: metricToken(2),
    p_metric_4: metricToken(3),
    p_branch_id: parameters.branchId,
    p_business_unit_id: parameters.businessUnitId,
    p_from: parameters.from,
    p_to: parameters.to,
    p_sort: config.sort,
    p_sort_direction: config.sortDirection,
    p_limit: Math.min(config.limit, parameters.limit),
  }
}

/**
 * Builds the column definitions for a custom result. The engine returns fixed
 * slot names (`dimension_1`, `metric_1`); the labels and number formats come
 * from the registry, so an exported custom report formats money the same way
 * a standard one does.
 */
function toColumns(config: CustomReportConfig): ReportColumnDef[] {
  const columns: ReportColumnDef[] = []

  config.dimensions.forEach((key, index) => {
    const definition = findDimension(config.dataset, key)
    columns.push({
      key: `dimension_${index + 1}`,
      header: definition?.label ?? key,
      type: 'text',
    })
  })

  config.metrics.forEach((key, index) => {
    const definition = findMetric(config.dataset, key)
    columns.push({
      key: `metric_${index + 1}`,
      header: definition?.label ?? key,
      type: definition?.type ?? 'number',
      // An average is not a sum, and a footer that added averages together
      // would print a meaningless number with the same authority as a real
      // total. Counts and amounts total; averages do not.
      total: definition?.key.startsWith('average_') ? false : true,
    })
  })

  return columns
}

function titleFor(config: CustomReportConfig): string {
  const dataset = REPORT_DATASETS[config.dataset]
  const dimensions = config.dimensions
    .map((key) => findDimension(config.dataset, key)?.label ?? key)
    .join(' and ')

  return `${dataset.label} by ${dimensions.toLowerCase()}`
}

export interface CustomReportInput {
  config: CustomReportConfig
  parameters: ReportParameters
}

export async function runCustomReport(input: CustomReportInput): Promise<ReportResult> {
  // Re-parsed rather than trusted, for the same reason
  // lib/reports/queries.ts re-parses its parameters: this is called from a
  // Server Action, so its argument crossed a network boundary.
  const config = customReportConfigSchema.parse(input.config)
  const parameters = reportParametersSchema.parse(input.parameters)

  const scope = {
    organizationId: parameters.organizationId,
    ...(parameters.branchId ? { branchId: parameters.branchId } : {}),
  }

  await requirePermission('reports.view', scope)
  for (const permission of requiredPermissionsFor(
    config.dataset,
    config.dimensions,
    config.metrics,
  )) {
    await requirePermission(permission, scope)
  }

  const startedAt = performance.now()
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.rpc('run_custom_report', toEngineArgs(config, parameters))
  if (error) throw error

  const columns = toColumns(config)

  return finishReport({
    id: 'custom',
    title: titleFor(config),
    columns,
    rows: ((data ?? []) as Record<string, unknown>[]).map((row) => {
      const mapped: Record<string, ReportCellValue> = {}
      for (const column of columns) {
        mapped[column.key] =
          column.type === 'text' ? toText(row[column.key]) : toNumber(row[column.key])
      }
      return mapped
    }),
    parameters: { ...parameters, limit: Math.min(config.limit, parameters.limit) },
    // Every field is already permission-checked above, so nothing needs
    // stripping here — unlike a standard report, a custom one cannot contain a
    // column the caller was not explicitly authorised for.
    grantedPermissions: requiredPermissionsFor(config.dataset, config.dimensions, config.metrics),
    startedAt,
  })
}
