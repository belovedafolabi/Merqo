import { describe, expect, it } from 'vitest'

import { MAX_RANGE_DAYS, MAX_ROW_LIMIT } from '@/lib/reports/registry'
import {
  customReportConfigSchema,
  reportParametersSchema,
  savedReportInputSchema,
} from '@/lib/reports/schemas'

/**
 * Milestone 10's Testing Requirements: "the custom report builder rejects any
 * attempt to inject raw SQL or access a non-whitelisted dimension/metric".
 *
 * This suite tests the *first* of the three layers described in
 * lib/reports/registry.ts's header. The third layer — the SQL function's own
 * whitelist, which is what protects a caller who never touches this code — is
 * exercised in tests/integration/reports-security.test.ts against a real
 * database. Both matter; neither substitutes for the other.
 */

// A real v4 uuid — zod's uuid check enforces the version and variant nibbles,
// so the tempting all-1s placeholder is not actually a uuid and would make
// these tests pass for the wrong reason.
const ORG = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

function config(overrides: Record<string, unknown> = {}) {
  return {
    dataset: 'sales',
    dimensions: ['day'],
    metrics: ['net_sales'],
    ...overrides,
  }
}

describe('injection attempts', () => {
  it.each([
    "day'; drop table sales; --",
    'day UNION SELECT password FROM users',
    '(select 1)',
    'day/**/or/**/1=1',
    '"day"',
  ])('rejects %s as a dimension', (dimension) => {
    const result = customReportConfigSchema.safeParse(config({ dimensions: [dimension] }))
    expect(result.success).toBe(false)
  })

  it.each(["net_sales'; delete from expenses; --", 'sum(cost_price)', '*'])(
    'rejects %s as a metric',
    (metric) => {
      const result = customReportConfigSchema.safeParse(config({ metrics: [metric] }))
      expect(result.success).toBe(false)
    },
  )

  it('rejects an unknown dataset', () => {
    expect(customReportConfigSchema.safeParse(config({ dataset: 'users' })).success).toBe(false)
    expect(customReportConfigSchema.safeParse(config({ dataset: 'products' })).success).toBe(false)
  })
})

describe('cross-dataset field access', () => {
  it('rejects a field that is valid on another dataset but not this one', () => {
    // The probe an attacker would actually try: `employee` is a perfectly
    // real sales dimension, and completely absent from expenses. A check that
    // only asked "is this a known key somewhere" would let it through.
    expect(
      customReportConfigSchema.safeParse(
        config({ dataset: 'expenses', dimensions: ['employee'], metrics: ['total_amount'] }),
      ).success,
    ).toBe(false)
  })

  it('rejects a metric borrowed from another dataset', () => {
    expect(
      customReportConfigSchema.safeParse(
        config({ dataset: 'expenses', dimensions: ['category'], metrics: ['net_sales'] }),
      ).success,
    ).toBe(false)
  })

  it('accepts the same key where the dataset genuinely offers it', () => {
    // `day` and `branch` legitimately exist on both — the check is per
    // dataset, not a blanket denylist.
    expect(
      customReportConfigSchema.safeParse(
        config({ dataset: 'expenses', dimensions: ['day'], metrics: ['approved_amount'] }),
      ).success,
    ).toBe(true)
  })
})

describe('complexity limits', () => {
  it('rejects more than two grouping dimensions', () => {
    expect(
      customReportConfigSchema.safeParse(config({ dimensions: ['day', 'branch', 'employee'] }))
        .success,
    ).toBe(false)
  })

  it('rejects more than four metrics', () => {
    expect(
      customReportConfigSchema.safeParse(
        config({ metrics: ['net_sales', 'sale_count', 'tax', 'total', 'gross_sales'] }),
      ).success,
    ).toBe(false)
  })

  it('requires at least one dimension and one metric', () => {
    expect(customReportConfigSchema.safeParse(config({ dimensions: [] })).success).toBe(false)
    expect(customReportConfigSchema.safeParse(config({ metrics: [] })).success).toBe(false)
  })

  it('rejects a repeated dimension or metric', () => {
    expect(customReportConfigSchema.safeParse(config({ dimensions: ['day', 'day'] })).success).toBe(
      false,
    )
    expect(
      customReportConfigSchema.safeParse(config({ metrics: ['net_sales', 'net_sales'] })).success,
    ).toBe(false)
  })

  it('rejects a row limit above the cap rather than silently clamping it', () => {
    // Silently returning 1000 rows for a request of 10,000 would leave the
    // caller believing they had a complete result.
    expect(customReportConfigSchema.safeParse(config({ limit: MAX_ROW_LIMIT + 1 })).success).toBe(
      false,
    )
    expect(customReportConfigSchema.safeParse(config({ limit: 0 })).success).toBe(false)
  })

  it('rejects an unknown sort slot or direction', () => {
    expect(customReportConfigSchema.safeParse(config({ sort: 'metric_9' })).success).toBe(false)
    expect(customReportConfigSchema.safeParse(config({ sort: 'cost_price' })).success).toBe(false)
    expect(customReportConfigSchema.safeParse(config({ sortDirection: 'random' })).success).toBe(
      false,
    )
  })
})

describe('report parameters', () => {
  function parameters(overrides: Record<string, unknown> = {}) {
    return { organizationId: ORG, limit: 100, ...overrides }
  }

  it('accepts an unbounded range', () => {
    expect(reportParametersSchema.safeParse(parameters()).success).toBe(true)
  })

  it('rejects a range that ends before it starts', () => {
    const result = reportParametersSchema.safeParse(
      parameters({ from: '2026-08-01T00:00:00Z', to: '2026-07-01T00:00:00Z' }),
    )
    expect(result.success).toBe(false)
  })

  it(`rejects a range longer than ${MAX_RANGE_DAYS} days`, () => {
    const result = reportParametersSchema.safeParse(
      parameters({ from: '2024-01-01T00:00:00Z', to: '2026-01-01T00:00:00Z' }),
    )
    expect(result.success).toBe(false)
  })

  it('accepts a range at the limit', () => {
    const result = reportParametersSchema.safeParse(
      parameters({ from: '2026-01-01T00:00:00Z', to: '2026-12-01T00:00:00Z' }),
    )
    expect(result.success).toBe(true)
  })

  it('rejects a non-uuid organization or branch', () => {
    expect(reportParametersSchema.safeParse(parameters({ organizationId: 'all' })).success).toBe(
      false,
    )
    expect(reportParametersSchema.safeParse(parameters({ branchId: "' or 1=1 --" })).success).toBe(
      false,
    )
  })

  it('normalises an absent branch or business unit to null', () => {
    const result = reportParametersSchema.parse(parameters())
    expect(result.branchId).toBeNull()
    expect(result.businessUnitId).toBeNull()
  })
})

describe('saved report input', () => {
  it('validates the embedded config, not just the name', () => {
    const result = savedReportInputSchema.safeParse({
      name: 'Monthly sales',
      visibility: 'branch',
      config: config({ dimensions: ['nonsense'] }),
    })
    expect(result.success).toBe(false)
  })

  it('defaults to private visibility', () => {
    const result = savedReportInputSchema.parse({ name: 'Mine', config: config() })
    expect(result.visibility).toBe('private')
  })

  it('rejects an unknown visibility tier', () => {
    expect(
      savedReportInputSchema.safeParse({ name: 'Mine', visibility: 'public', config: config() })
        .success,
    ).toBe(false)
  })
})
