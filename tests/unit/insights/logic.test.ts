import { describe, expect, it } from 'vitest'

import {
  forecastFor,
  forecastRowSchema,
  insightsAreStale,
  STALENESS_MS,
  type ForecastRow,
} from '@/lib/insights/types'
import { forecastWhy, restockWhy, slowMoverWhy } from '@/lib/insights/why'

/**
 * Milestone 17 Part A. The forecast arithmetic itself lives in
 * compute_sales_insights() and is covered by tests/integration/insights.test.ts;
 * this file covers the pure TS around it — the staleness gate, the horizon
 * accessor, defensive payload parsing, and the templated "why" strings.
 */

const forecastRow = (over: Partial<ForecastRow> = {}): ForecastRow => ({
  productId: 'p1',
  name: 'Widget',
  forecastNextDay: 5,
  forecastNext7d: 34,
  forecastNext30d: 150,
  trend: 'steady',
  confidence: 'OK',
  baseVelocity: 5,
  daysOfCover: 11,
  ...over,
})

describe('insightsAreStale', () => {
  const now = Date.UTC(2026, 8, 5, 12, 0, 0)
  const fresh = new Date(now - 60_000).toISOString()
  const rows = (computedAt: string) => [
    { section: 'forecast', computedAt },
    { section: 'restock', computedAt },
    { section: 'slow_movers', computedAt },
  ]

  it('is not stale when all three sections are present and recent', () => {
    expect(insightsAreStale(rows(fresh), now)).toBe(false)
  })

  it('is stale when a section is missing', () => {
    expect(insightsAreStale(rows(fresh).slice(0, 2), now)).toBe(true)
  })

  it('is stale once the newest row is past the window', () => {
    const old = new Date(now - STALENESS_MS - 1).toISOString()
    expect(insightsAreStale(rows(old), now)).toBe(true)
  })

  it('is not stale exactly at the window edge', () => {
    const edge = new Date(now - STALENESS_MS).toISOString()
    expect(insightsAreStale(rows(edge), now)).toBe(false)
  })
})

describe('forecastFor', () => {
  it('returns the value for the requested horizon', () => {
    const row = forecastRow()
    expect(forecastFor(row, 'next_day')).toBe(5)
    expect(forecastFor(row, 'next_7d')).toBe(34)
    expect(forecastFor(row, 'next_30d')).toBe(150)
  })
})

describe('forecastRowSchema', () => {
  it('accepts a well-formed row', () => {
    expect(() => forecastRowSchema.parse(forecastRow())).not.toThrow()
  })

  it('rejects an unknown trend', () => {
    expect(() => forecastRowSchema.parse(forecastRow({ trend: 'plummeting' as never }))).toThrow()
  })

  it('accepts null forecast fields (a LOW-confidence row)', () => {
    expect(() =>
      forecastRowSchema.parse(
        forecastRow({
          confidence: 'LOW',
          forecastNextDay: null,
          forecastNext7d: null,
          forecastNext30d: null,
        }),
      ),
    ).not.toThrow()
  })
})

describe('why strings', () => {
  it('a LOW-confidence forecast says so instead of quoting a rate', () => {
    expect(forecastWhy(forecastRow({ confidence: 'LOW' }))).toMatch(/not enough sales history/i)
  })

  it('an OK forecast quotes the rate, the trend, and days of cover', () => {
    const why = forecastWhy(forecastRow({ baseVelocity: 4, trend: 'rising', daysOfCover: 11 }))
    expect(why).toMatch(/~4\/day/)
    expect(why).toMatch(/trending up/)
    expect(why).toMatch(/11 days of stock/)
  })

  it('restockWhy names the order quantity and the lead window', () => {
    const why = restockWhy(
      {
        productId: 'p',
        name: 'W',
        onHand: 3,
        daysOfCover: 2,
        suggestedOrderQty: 25,
        baseVelocity: 4,
      },
      14,
    )
    expect(why).toMatch(/order about 25/)
    expect(why).toMatch(/next 14 days/)
  })

  it('slowMoverWhy names the units on hand and the value tied up', () => {
    const why = slowMoverWhy({ productId: 'p', name: 'W', onHand: 12, retailValue: 4800 })
    expect(why).toMatch(/12 on hand/)
    expect(why).toMatch(/nothing sold in 30 days/)
    expect(why).toMatch(/4,800|4800/)
  })
})
