import { z } from 'zod'

/**
 * Milestone 17 Part A — pure types + Zod schemas for the Sales Insights
 * payloads. No server imports: the /insights client components import from
 * here, and reaching lib/supabase/server transitively would break the build
 * (the client-bundle next/headers trap).
 *
 * The numbers are computed and cached by compute_sales_insights()
 * (20260905090300). This module validates the jsonb on the way back out and
 * gives the "why" strings (lib/insights/why.ts) something typed to read.
 */

export const INSIGHTS_SECTIONS = ['forecast', 'restock', 'slow_movers'] as const
export type InsightsSection = (typeof INSIGHTS_SECTIONS)[number]

/** How long a cache row is served before the next load recomputes it. */
export const STALENESS_MS = 6 * 60 * 60 * 1000

/** The forecast section's per-horizon toggle. */
export const INSIGHTS_HORIZONS = ['next_day', 'next_7d', 'next_30d'] as const
export type InsightsHorizon = (typeof INSIGHTS_HORIZONS)[number]

const trendSchema = z.enum(['rising', 'falling', 'steady'])
export type Trend = z.infer<typeof trendSchema>

const confidenceSchema = z.enum(['OK', 'LOW'])
export type Confidence = z.infer<typeof confidenceSchema>

export const forecastRowSchema = z.object({
  productId: z.string(),
  name: z.string(),
  /** null when confidence is LOW — "not enough history yet", never a fabricated number. */
  forecastNextDay: z.number().nullable(),
  forecastNext7d: z.number().nullable(),
  forecastNext30d: z.number().nullable(),
  trend: trendSchema,
  confidence: confidenceSchema,
  baseVelocity: z.number(),
  daysOfCover: z.number().nullable(),
})
export type ForecastRow = z.infer<typeof forecastRowSchema>

export const restockRowSchema = z.object({
  productId: z.string(),
  name: z.string(),
  onHand: z.number(),
  daysOfCover: z.number().nullable(),
  suggestedOrderQty: z.number(),
  baseVelocity: z.number(),
})
export type RestockRow = z.infer<typeof restockRowSchema>

export const slowMoverRowSchema = z.object({
  productId: z.string(),
  name: z.string(),
  onHand: z.number(),
  /** on_hand × products.base_price — retail value tied up, never cost. */
  retailValue: z.number(),
})
export type SlowMoverRow = z.infer<typeof slowMoverRowSchema>

export const PAYLOAD_SCHEMAS = {
  forecast: z.array(forecastRowSchema),
  restock: z.array(restockRowSchema),
  slow_movers: z.array(slowMoverRowSchema),
} as const

export interface SalesInsights {
  forecast: ForecastRow[]
  restock: RestockRow[]
  slowMovers: SlowMoverRow[]
  /** ISO timestamp of the most recent recompute, or null if never computed. */
  computedAt: string | null
}

/**
 * Whether the cached rows need recomputing: any section missing, or the
 * newest row older than the staleness window. Pure so the read path's
 * "recompute or serve" decision is unit-testable without a request context.
 */
export function insightsAreStale(
  rows: { section: string; computedAt: string }[],
  now: number = Date.now(),
): boolean {
  const sections = new Set(rows.map((row) => row.section))
  if (INSIGHTS_SECTIONS.some((section) => !sections.has(section))) return true

  const newest = Math.max(...rows.map((row) => new Date(row.computedAt).getTime()))
  return now - newest > STALENESS_MS
}

export function forecastFor(row: ForecastRow, horizon: InsightsHorizon): number | null {
  switch (horizon) {
    case 'next_day':
      return row.forecastNextDay
    case 'next_7d':
      return row.forecastNext7d
    case 'next_30d':
      return row.forecastNext30d
  }
}
