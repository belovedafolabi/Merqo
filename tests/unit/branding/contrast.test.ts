import { describe, expect, it } from 'vitest'

import {
  contrastRatio,
  hexToRgb,
  pickReadableForeground,
  relativeLuminance,
  resolveBrandColor,
} from '@/lib/branding/contrast'

describe('hexToRgb', () => {
  it('parses 6-digit and 3-digit hex, with or without a leading #', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(hexToRgb('000000')).toEqual({ r: 0, g: 0, b: 0 })
    expect(hexToRgb('#0f0')).toEqual({ r: 0, g: 255, b: 0 })
  })

  it('returns null for an invalid value', () => {
    expect(hexToRgb('not-a-color')).toBeNull()
    expect(hexToRgb('#12345')).toBeNull()
  })
})

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5)
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5)
  })
})

describe('contrastRatio', () => {
  it('is 21:1 between pure black and white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })

  it('is 1:1 for identical colors', () => {
    expect(contrastRatio('#059669', '#059669')).toBeCloseTo(1, 5)
  })

  it('is symmetric regardless of argument order', () => {
    expect(contrastRatio('#059669', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#059669'), 5)
  })
})

describe('pickReadableForeground', () => {
  it('picks near-black text on a light background', () => {
    expect(pickReadableForeground('#ffffff')).toBe('#0a0a0a')
  })

  it('picks white text on a dark background', () => {
    expect(pickReadableForeground('#0a0a0a')).toBe('#ffffff')
  })
})

describe('resolveBrandColor', () => {
  const fallback = '#059669'
  const fallbackForeground = '#ffffff'
  const surfaces = ['#ffffff', '#10151a']

  it('accepts a candidate that passes both the self-contrast and non-text checks', () => {
    // A strong blue — readable with white text, and distinguishable against
    // both a white card and the always-dark sidebar surface.
    const result = resolveBrandColor('#2563eb', fallback, fallbackForeground, surfaces)
    expect(result.usedFallback).toBe(false)
    expect(result.background).toBe('#2563eb')
    expect(result.foreground).toBe('#ffffff')
    expect(contrastRatio(result.background, result.foreground)).toBeGreaterThanOrEqual(4.5)
  })

  it('falls back when the candidate fails the self-contrast check (too close to both text colors)', () => {
    // The classic "impossible gray" (~WCAG luminance 0.184): too light for
    // black text to reach 4.5:1, too dark for white text to reach it either.
    const result = resolveBrandColor('#777777', fallback, fallbackForeground, surfaces)
    expect(result.usedFallback).toBe(true)
    expect(result.background).toBe(fallback)
  })

  it('falls back when the candidate fails the non-text check against a surface (near-white on a white card)', () => {
    const result = resolveBrandColor('#f8f8f8', fallback, fallbackForeground, surfaces)
    expect(result.usedFallback).toBe(true)
  })

  it('falls back for a missing or malformed candidate', () => {
    expect(resolveBrandColor(null, fallback, fallbackForeground, surfaces).usedFallback).toBe(true)
    expect(
      resolveBrandColor('bright yellow', fallback, fallbackForeground, surfaces).usedFallback,
    ).toBe(true)
  })
})
