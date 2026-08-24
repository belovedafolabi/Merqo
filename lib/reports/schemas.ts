import { z } from 'zod'

import {
  DATASET_KEYS,
  DEFAULT_ROW_LIMIT,
  MAX_DIMENSIONS,
  MAX_METRICS,
  MAX_RANGE_DAYS,
  MAX_ROW_LIMIT,
  REPORT_DATASETS,
  type DatasetKey,
} from '@/lib/reports/registry'

/**
 * Validation for report parameters and custom-report configurations — the
 * first of the three layers described in lib/reports/registry.ts's header.
 *
 * The property that matters here is a negative one: **there is no free-text
 * field anywhere in a custom report config.** Every string a caller can send
 * is either a uuid, an ISO timestamp, a bounded integer, or a key that must
 * appear in REPORT_DATASETS. That is what makes "the builder only composes
 * queries from a fixed, permission-checked set of dimensions and metrics"
 * (Milestone 10's Functional Requirements) checkable by reading this file,
 * rather than a claim about how carefully the query builder was written.
 *
 * `customReportConfigSchema` is used in two places, and the second is the
 * important one: lib/reports/custom.ts parses an incoming request with it,
 * and lib/reports/saved.ts parses a *stored* `saved_reports.config` with it
 * again on load. A stored config is untrusted input exactly like a request
 * body — it is jsonb, Postgres never type-checked it, and a row edited by
 * hand or written by a client that skipped the builder must not be trusted
 * because it once passed validation. See
 * supabase/migrations/20260823140400_create_saved_reports.sql's header.
 */

const uuidSchema = z.uuid('Expected a valid id.')

/**
 * Bounded on both ends. The upper bound mirrors run_custom_report()'s own
 * `least(coalesce(p_limit, ...), 1000)` rather than trusting it: a caller
 * asking for 10,000 rows should be told no here, not silently handed 1,000
 * and left to think the report was complete.
 */
const rowLimitSchema = z.coerce
  .number()
  .int('Row limit must be a whole number.')
  .min(1, 'Row limit must be at least 1.')
  .max(MAX_ROW_LIMIT, `Row limit cannot exceed ${MAX_ROW_LIMIT}.`)
  .default(DEFAULT_ROW_LIMIT)

const isoTimestampSchema = z.iso.datetime({ offset: true }).or(z.iso.datetime())

export const reportParametersSchema = z
  .object({
    organizationId: uuidSchema,
    branchId: uuidSchema.nullish().transform((value) => value ?? null),
    businessUnitId: uuidSchema.nullish().transform((value) => value ?? null),
    from: isoTimestampSchema.nullish().transform((value) => value ?? null),
    to: isoTimestampSchema.nullish().transform((value) => value ?? null),
    groupBy: z.string().trim().min(1).max(40).nullish(),
    limit: rowLimitSchema,
  })
  .superRefine(assertDateRange)
export type ReportParametersInput = z.input<typeof reportParametersSchema>

/**
 * Two range rules, both of which exist to stop a single request from becoming
 * an accidental denial of service against a shared database:
 * `from` must precede `to`, and the window is capped at
 * docs/Reporting_Analytics_and_Custom_Reports.md §46's complexity limit. An
 * unbounded range is still allowed — "everything, ever" is a legitimate
 * question, and the row cap already bounds what comes back.
 */
function assertDateRange(
  value: { from: string | null; to: string | null },
  ctx: z.RefinementCtx,
): void {
  if (!value.from || !value.to) return

  const from = new Date(value.from).getTime()
  const to = new Date(value.to).getTime()

  if (to <= from) {
    ctx.addIssue({
      code: 'custom',
      path: ['to'],
      message: 'The end of the range must be after its start.',
    })
    return
  }

  const days = (to - from) / 86_400_000
  if (days > MAX_RANGE_DAYS) {
    ctx.addIssue({
      code: 'custom',
      path: ['to'],
      message: `A report can cover at most ${MAX_RANGE_DAYS} days at a time.`,
    })
  }
}

const sortDirectionSchema = z.enum(['asc', 'desc'])

/**
 * The sort key is a *slot* name, not a field name — 'metric_1' rather than
 * 'net_sales'. That is deliberate: the slot is what run_custom_report()'s
 * static ORDER BY can address, so the set of legal values is closed by
 * construction and cannot grow as the registry does.
 */
const sortKeySchema = z.enum([
  'dimension_1',
  'dimension_2',
  'metric_1',
  'metric_2',
  'metric_3',
  'metric_4',
])

export const customReportConfigSchema = z
  .object({
    dataset: z.enum(DATASET_KEYS),
    dimensions: z
      .array(z.string().trim().min(1))
      .min(1, 'Choose at least one thing to group by.')
      .max(MAX_DIMENSIONS, `Group by at most ${MAX_DIMENSIONS} fields.`),
    metrics: z
      .array(z.string().trim().min(1))
      .min(1, 'Choose at least one figure to measure.')
      .max(MAX_METRICS, `Choose at most ${MAX_METRICS} figures.`),
    sort: sortKeySchema.default('metric_1'),
    sortDirection: sortDirectionSchema.default('desc'),
    limit: rowLimitSchema,
  })
  .superRefine(assertKnownFields)
export type CustomReportConfig = z.infer<typeof customReportConfigSchema>

/**
 * The whitelist check itself. Every dimension and metric key must exist in
 * *this dataset's* lists — not merely somewhere in the registry. That
 * distinction is the one an attacker would probe: `employee` is a perfectly
 * valid sales dimension and a completely invalid expense one, and a check
 * that only asked "is this a known key anywhere" would let it through to a
 * query that has no such column.
 *
 * Duplicates are rejected too. Grouping by the same field twice is
 * meaningless, and permitting it would let a caller quietly consume both
 * dimension slots to no effect.
 */
function assertKnownFields(
  value: { dataset: DatasetKey; dimensions: string[]; metrics: string[] },
  ctx: z.RefinementCtx,
): void {
  const dataset = REPORT_DATASETS[value.dataset]

  value.dimensions.forEach((key, index) => {
    if (!dataset.dimensions.some((dimension) => dimension.key === key)) {
      ctx.addIssue({
        code: 'custom',
        path: ['dimensions', index],
        message: `"${key}" is not a grouping available on ${dataset.label}.`,
      })
    }
  })

  value.metrics.forEach((key, index) => {
    if (!dataset.metrics.some((metric) => metric.key === key)) {
      ctx.addIssue({
        code: 'custom',
        path: ['metrics', index],
        message: `"${key}" is not a figure available on ${dataset.label}.`,
      })
    }
  })

  if (new Set(value.dimensions).size !== value.dimensions.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['dimensions'],
      message: 'Each grouping can only be used once.',
    })
  }
  if (new Set(value.metrics).size !== value.metrics.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['metrics'],
      message: 'Each figure can only be used once.',
    })
  }
}

/** A custom report request: what to compute, plus the scope to compute it over. */
export const customReportRequestSchema = z.object({
  config: customReportConfigSchema,
  parameters: reportParametersSchema,
})
export type CustomReportRequest = z.infer<typeof customReportRequestSchema>

export const savedReportInputSchema = z.object({
  name: z.string().trim().min(1, 'Give the report a name.').max(120),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => (value ? value : undefined)),
  visibility: z.enum(['private', 'branch', 'organization']).default('private'),
  branchId: uuidSchema.nullish().transform((value) => value ?? null),
  businessUnitId: uuidSchema.nullish().transform((value) => value ?? null),
  config: customReportConfigSchema,
})
export type SavedReportInput = z.infer<typeof savedReportInputSchema>
