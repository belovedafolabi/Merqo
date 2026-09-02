import { describe, expect, it } from 'vitest'

import { generateSku } from '@/lib/products/sku'

describe('generateSku', () => {
  it('builds a slug from the name plus a random suffix', () => {
    const sku = generateSku('Coca-Cola 1L')
    expect(sku).toMatch(/^COCACOLA1L-[0-9A-Z]{4}$/)
  })

  it('caps the name stem and stays within the 64-char column limit', () => {
    const sku = generateSku('A ridiculously long product name that keeps going and going')
    expect(sku.length).toBeLessThanOrEqual(64)
    expect(sku.split('-')[0]!.length).toBeLessThanOrEqual(12)
  })

  it('falls back to a stem when the name has no alphanumerics', () => {
    expect(generateSku('———')).toMatch(/^SKU-[0-9A-Z]{4}$/)
  })

  it('is practically unique across many calls', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateSku('Milk')))
    expect(seen.size).toBeGreaterThan(490)
  })
})
