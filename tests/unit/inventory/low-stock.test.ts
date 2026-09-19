import { describe, expect, it } from 'vitest'

import { effectiveLowStockThreshold, isLowStock, stockStatus } from '@/lib/inventory/low-stock'

/**
 * This module is the one definition of "low stock" — the Inventory page's
 * badge/stat tile and filter, the dashboard widget, and (in SQL) the report
 * RPC and notify_low_stock() all have to agree with it. The Inventory page
 * used to ignore the org-wide default threshold; these lock in that it no
 * longer does.
 */

describe('effectiveLowStockThreshold', () => {
  it('prefers the row threshold over the org default', () => {
    expect(effectiveLowStockThreshold(5, 10)).toBe(5)
  })

  it('falls back to the org default when the row has none', () => {
    expect(effectiveLowStockThreshold(null, 10)).toBe(10)
  })

  it('is null when neither is set', () => {
    expect(effectiveLowStockThreshold(null, null)).toBeNull()
  })
})

describe('isLowStock', () => {
  it('is low when available is at or below the row threshold', () => {
    expect(isLowStock(5, 5, null)).toBe(true)
    expect(isLowStock(4, 5, null)).toBe(true)
    expect(isLowStock(6, 5, null)).toBe(false)
  })

  it('applies the org default when the row has no threshold', () => {
    expect(isLowStock(3, null, 4)).toBe(true)
    expect(isLowStock(9, null, 4)).toBe(false)
  })

  it('is never low when no threshold applies, even at zero stock', () => {
    expect(isLowStock(0, null, null)).toBe(false)
  })
})

describe('stockStatus', () => {
  it('reports out of stock at or below zero regardless of threshold', () => {
    expect(stockStatus(0, 5, null)).toBe('out')
    expect(stockStatus(-2, null, null)).toBe('out')
  })

  it('reports low between zero and the effective threshold', () => {
    expect(stockStatus(3, 5, null)).toBe('low')
    expect(stockStatus(3, null, 5)).toBe('low')
  })

  it('reports in stock above the threshold', () => {
    expect(stockStatus(20, 5, null)).toBe('in')
  })

  it('reports in stock when nothing is low and there is no threshold', () => {
    expect(stockStatus(1, null, null)).toBe('in')
  })
})
