import { describe, expect, it } from 'vitest'

import { unitInputSchema } from '@/lib/units/schemas'

describe('unitInputSchema', () => {
  it('accepts a name and abbreviation, trimming both', () => {
    const result = unitInputSchema.safeParse({ name: '  Half carton ', abbreviation: ' ½ctn ' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('Half carton')
      expect(result.data.abbreviation).toBe('½ctn')
    }
  })

  it('rejects a blank name or abbreviation', () => {
    expect(unitInputSchema.safeParse({ name: '', abbreviation: 'x' }).success).toBe(false)
    expect(unitInputSchema.safeParse({ name: 'Box', abbreviation: '   ' }).success).toBe(false)
  })

  it('enforces length caps', () => {
    expect(
      unitInputSchema.safeParse({ name: 'x'.repeat(41), abbreviation: 'x' }).success,
    ).toBe(false)
    expect(
      unitInputSchema.safeParse({ name: 'Box', abbreviation: 'x'.repeat(13) }).success,
    ).toBe(false)
  })
})
