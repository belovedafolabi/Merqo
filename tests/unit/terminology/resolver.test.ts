import { describe, expect, it } from 'vitest'

import { GENERIC_TERMS, makeT, resolveTerminology } from '@/lib/terminology/types'

/**
 * Milestone 17 Part B — the pure terminology resolver. Seeded rows overlay the
 * generic defaults; anything unseeded (or an unknown key) falls back cleanly.
 */

describe('resolveTerminology', () => {
  it('returns the generic map when there are no rows', () => {
    expect(resolveTerminology([])).toEqual(GENERIC_TERMS)
  })

  it('overlays a seeded row onto the generic map', () => {
    const map = resolveTerminology([{ termKey: 'sale', singular: 'Bill', plural: 'Bills' }])
    expect(map.sale).toEqual({ singular: 'Bill', plural: 'Bills' })
    // untouched keys stay generic
    expect(map.customer).toEqual(GENERIC_TERMS.customer)
  })

  it('ignores a row with an unknown term_key', () => {
    const map = resolveTerminology([
      { termKey: 'invoice', singular: 'Invoice', plural: 'Invoices' },
    ])
    expect(map).toEqual(GENERIC_TERMS)
  })
})

describe('makeT', () => {
  const t = makeT(
    resolveTerminology([
      { termKey: 'sale', singular: 'Bill', plural: 'Bills' },
      { termKey: 'customer', singular: 'Guest', plural: 'Guests' },
    ]),
  )

  it('returns the singular by default and the plural on request', () => {
    expect(t('sale')).toBe('Bill')
    expect(t('sale', { plural: true })).toBe('Bills')
    expect(t('customer', { plural: true })).toBe('Guests')
  })

  it('lowercases on request', () => {
    expect(t('sale', { lower: true })).toBe('bill')
    expect(t('customer', { plural: true, lower: true })).toBe('guests')
  })

  it('falls back to the generic term for an unseeded key', () => {
    expect(t('receipt')).toBe('Receipt')
    expect(t('product', { plural: true })).toBe('Products')
  })
})
