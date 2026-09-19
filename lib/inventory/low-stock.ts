/**
 * The single definition of "low stock", shared by every surface that shows it
 * so they can't drift apart (they had: the dashboard widget and
 * `notify_low_stock()` applied the org-wide default threshold, the Inventory
 * page's badge and stat tile did not).
 *
 * A balance is low when its available quantity is at or below its *effective*
 * threshold: the row's own `low_stock_threshold`, or — where that is null —
 * the organization's `default_low_stock_threshold` (migration 20260904090000).
 * When both are null the row is never low, matching the original behaviour.
 *
 * `availableQuantity`, not on-hand `quantity`: reserved stock is committed to a
 * layaway or an open order and can't be sold, so measuring against raw on-hand
 * would call a shelf healthy that has nothing sellable on it. Same rule as
 * `lib/inventory/queries.ts`'s `listLowStockBalances()` and
 * `public.notify_low_stock()`.
 *
 * Pure — no server imports — so it is safe in client bundles (the
 * `next/headers` trap).
 */

export function effectiveLowStockThreshold(
  rowThreshold: number | null,
  orgDefaultThreshold: number | null,
): number | null {
  return rowThreshold ?? orgDefaultThreshold
}

export function isLowStock(
  availableQuantity: number,
  rowThreshold: number | null,
  orgDefaultThreshold: number | null,
): boolean {
  const threshold = effectiveLowStockThreshold(rowThreshold, orgDefaultThreshold)
  return threshold !== null && availableQuantity <= threshold
}

export type StockStatus = 'in' | 'low' | 'out'

/** Filter buckets for the Inventory page and the low-stock report. */
export function stockStatus(
  availableQuantity: number,
  rowThreshold: number | null,
  orgDefaultThreshold: number | null,
): StockStatus {
  if (availableQuantity <= 0) return 'out'
  if (isLowStock(availableQuantity, rowThreshold, orgDefaultThreshold)) return 'low'
  return 'in'
}
