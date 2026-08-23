import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DATASET_KEYS,
  MAX_DIMENSIONS,
  MAX_METRICS,
  REPORT_DATASETS,
  findDimension,
  findMetric,
  requiredPermissionsFor,
  type DatasetKey,
} from '@/lib/reports/registry'

/**
 * The registry and `run_custom_report()`'s SQL whitelist are two copies of the
 * same list, deliberately — see lib/reports/registry.ts's header for why the
 * SQL copy cannot be dropped. Two copies drift, so this suite makes them drift
 * loudly: adding a dimension or metric in TypeScript without adding the
 * matching `when` branch in SQL fails CI here, rather than failing at runtime
 * with "unknown dimension" for whoever picks it in the builder first.
 */

const CUSTOM_REPORT_SQL = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260823141100_create_custom_report_function.sql'),
  'utf8',
)

/**
 * Reads the `v_dimensions := array[...]` / `v_metrics := array[...]` literals
 * out of the migration's per-dataset branch. Parsing the migration rather than
 * hand-maintaining a fixture is the whole point: a fixture is a third copy,
 * and a third copy drifts too.
 */
function sqlTokensFor(dataset: DatasetKey, kind: 'dimensions' | 'metrics'): string[] {
  const branch = CUSTOM_REPORT_SQL.split(`p_dataset = '${dataset}' then`)[1]
  if (!branch) throw new Error(`no whitelist branch for dataset ${dataset}`)

  const assignment = branch.split(`v_${kind} := array[`)[1]?.split('];')[0]
  if (!assignment) throw new Error(`no v_${kind} array for dataset ${dataset}`)

  return [...assignment.matchAll(/'([^']+)'/g)].map((match) => match[1] as string)
}

describe('the registry is internally consistent', () => {
  it.each(DATASET_KEYS)('%s has unique dimension and metric keys and tokens', (dataset) => {
    const { dimensions, metrics } = REPORT_DATASETS[dataset]

    expect(new Set(dimensions.map((d) => d.key)).size).toBe(dimensions.length)
    expect(new Set(dimensions.map((d) => d.token)).size).toBe(dimensions.length)
    expect(new Set(metrics.map((m) => m.key)).size).toBe(metrics.length)
    expect(new Set(metrics.map((m) => m.token)).size).toBe(metrics.length)
  })

  it.each(DATASET_KEYS)('%s offers enough fields to fill its slots', (dataset) => {
    expect(REPORT_DATASETS[dataset].dimensions.length).toBeGreaterThanOrEqual(MAX_DIMENSIONS)
    expect(REPORT_DATASETS[dataset].metrics.length).toBeGreaterThanOrEqual(1)
  })

  it('caps complexity at the slots run_custom_report actually has', () => {
    // These are not UI preferences — they are the number of dimension_N /
    // metric_N columns the SQL function declares. If they diverge, the builder
    // can compose a report the engine cannot execute.
    expect(MAX_DIMENSIONS).toBe(2)
    expect(MAX_METRICS).toBe(4)
    expect(CUSTOM_REPORT_SQL).toContain('p_dimension_2 text default null')
    expect(CUSTOM_REPORT_SQL).toContain('p_metric_4 text default null')
  })
})

describe('the TypeScript whitelist matches the SQL whitelist exactly', () => {
  it.each(DATASET_KEYS)('%s dimensions', (dataset) => {
    const registryTokens = REPORT_DATASETS[dataset].dimensions.map((d) => d.token).sort()
    expect(registryTokens).toEqual(sqlTokensFor(dataset, 'dimensions').sort())
  })

  it.each(DATASET_KEYS)('%s metrics', (dataset) => {
    const registryTokens = REPORT_DATASETS[dataset].metrics.map((m) => m.token).sort()
    expect(registryTokens).toEqual(sqlTokensFor(dataset, 'metrics').sort())
  })

  it('every dataset the registry offers is one the engine recognises', () => {
    for (const dataset of DATASET_KEYS) {
      expect(CUSTOM_REPORT_SQL).toContain(`p_dataset = '${dataset}'`)
    }
  })
})

describe('the engine contains no dynamic SQL', () => {
  it('never builds a query by concatenation or format()', () => {
    // The single property docs/Security _Architecture_And_Authorization.md §68
    // actually demands. Asserted as a test rather than left to code review,
    // because "someone will notice in review" is not a control.
    //
    // Comments are stripped first: the migration's own header *discusses*
    // `execute format(...)` at length to explain why it is absent, and a naive
    // grep over the raw file would fail on the explanation rather than on any
    // actual dynamic SQL.
    const executable = CUSTOM_REPORT_SQL.split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')

    expect(executable).not.toMatch(/execute\s+format/i)
    expect(executable).not.toMatch(/\bexecute\s+['"]/i)
    expect(executable).not.toMatch(/\bquote_ident\b/i)
  })

  it('validates every token before running the query', () => {
    expect(CUSTOM_REPORT_SQL).toContain('unknown dimension % for dataset %')
    expect(CUSTOM_REPORT_SQL).toContain('unknown metric % for dataset %')
    expect(CUSTOM_REPORT_SQL).toContain('unknown custom report dataset %')
  })
})

describe('cost-bearing fields are gated behind reports.view_financials', () => {
  it.each(['cogs', 'gross_profit'])('sales.%s requires the financials permission', (key) => {
    expect(findMetric('sales', key)?.permission).toBe('reports.view_financials')
  })

  it.each(['cogs', 'gross_profit'])('sale_items.%s requires the financials permission', (key) => {
    expect(findMetric('sale_items', key)?.permission).toBe('reports.view_financials')
  })

  it('every expense metric is gated — what a business spends is management information', () => {
    for (const metric of REPORT_DATASETS.expenses.metrics) {
      expect(metric.permission).toBe('reports.view_financials')
    }
  })

  it('ordinary sales metrics are not gated, so a till role can still see its own day', () => {
    expect(findMetric('sales', 'net_sales')?.permission).toBeUndefined()
    expect(findMetric('sales', 'sale_count')?.permission).toBeUndefined()
    expect(findDimension('sales', 'day')?.permission).toBeUndefined()
  })
})

describe('requiredPermissionsFor', () => {
  it('collects the permissions of every selected field, without duplicates', () => {
    expect(requiredPermissionsFor('sales', ['day'], ['cogs', 'gross_profit'])).toEqual([
      'reports.view_financials',
    ])
  })

  it('returns nothing when no selected field is sensitive', () => {
    expect(requiredPermissionsFor('sales', ['day', 'branch'], ['net_sales'])).toEqual([])
  })

  it('ignores keys that are not in the registry rather than throwing', () => {
    // Unknown keys are rejected upstream by customReportConfigSchema; this
    // function's job is permissions, and a second error path here would just
    // produce a worse message than the schema's.
    expect(requiredPermissionsFor('sales', ['nonsense'], ['also_nonsense'])).toEqual([])
  })
})
