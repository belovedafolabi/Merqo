import type { ForecastRow, RestockRow, SlowMoverRow } from '@/lib/insights/types'

/**
 * Milestone 17 Part A — the plain-language "why" line under each insight row.
 * Templated here from the same numbers the row shows, server-side and in one
 * place, so the wording stays consistent and is translatable later. Never
 * assembled in the client from raw values.
 */

function perDay(velocity: number): string {
  if (velocity >= 1) return `~${Math.round(velocity)}/day`
  if (velocity <= 0) return 'no recent sales'
  return `~${velocity.toFixed(1)}/day`
}

const TREND_PHRASE: Record<ForecastRow['trend'], string> = {
  rising: 'trending up',
  falling: 'trending down',
  steady: 'steady',
}

export function forecastWhy(row: ForecastRow): string {
  if (row.confidence === 'LOW') {
    return 'Not enough sales history yet to forecast this one reliably.'
  }

  const parts = [`Sells ${perDay(row.baseVelocity)}`, TREND_PHRASE[row.trend]]
  if (row.daysOfCover !== null) {
    parts.push(`~${Math.round(row.daysOfCover)} days of stock left`)
  }
  return `${parts.join('; ')}.`
}

export function restockWhy(row: RestockRow, leadDays: number): string {
  const cover =
    row.daysOfCover === null
      ? 'stock is already out'
      : `~${Math.round(row.daysOfCover)} days of stock left`
  const order =
    row.suggestedOrderQty > 0
      ? `order about ${Math.ceil(row.suggestedOrderQty)} to cover the next ${leadDays} days`
      : `current stock covers the next ${leadDays} days`
  return `Sells ${perDay(row.baseVelocity)}; ${cover} — ${order}.`
}

export function slowMoverWhy(row: SlowMoverRow): string {
  const value = row.retailValue.toLocaleString('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  })
  return `${Math.round(row.onHand)} on hand, nothing sold in 30 days — about ${value} of stock tied up.`
}
