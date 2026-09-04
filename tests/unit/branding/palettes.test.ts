import { describe, expect, it } from 'vitest'

import { BRAND_PALETTES, findBrandPalette } from '@/lib/branding/palettes'
import { resolveBrandColor } from '@/lib/branding/contrast'

/**
 * Post-Milestone-17 UX fix: the branding editor's color dropdown replaces
 * two free-hex fields. Every preset must survive the exact WCAG check
 * lib/branding/contrast.ts#resolveBrandColor() runs on save (self-contrast
 * AA >= 4.5:1, and >= 3:1 against both a light card surface and the
 * always-dark sidebar) — mirrors components/settings/brand-color-field.tsx's
 * own constants so this test fails the moment a preset would silently fall
 * back to the gray default instead of applying as chosen.
 */
const FALLBACK_HEX = '#059669'
const SURFACES = ['#ffffff', '#10151a'] as const

describe('BRAND_PALETTES', () => {
  it('has at least 20 combinations', () => {
    expect(BRAND_PALETTES.length).toBeGreaterThanOrEqual(20)
  })

  it('every id is unique', () => {
    const ids = BRAND_PALETTES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every name is unique', () => {
    const names = BRAND_PALETTES.map((p) => p.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it.each(BRAND_PALETTES.map((p) => [p.name, p]))(
    '%s: primary color passes the contrast check unmodified',
    (_name, palette) => {
      const resolved = resolveBrandColor(palette.primary, FALLBACK_HEX, '#ffffff', SURFACES)
      expect(resolved.usedFallback).toBe(false)
      expect(resolved.background.toLowerCase()).toBe(palette.primary.toLowerCase())
    },
  )

  it.each(BRAND_PALETTES.map((p) => [p.name, p]))(
    '%s: secondary color passes the contrast check unmodified',
    (_name, palette) => {
      const resolved = resolveBrandColor(palette.secondary, FALLBACK_HEX, '#ffffff', SURFACES)
      expect(resolved.usedFallback).toBe(false)
      expect(resolved.background.toLowerCase()).toBe(palette.secondary.toLowerCase())
    },
  )

  it('no combination pairs a color with itself', () => {
    for (const palette of BRAND_PALETTES) {
      expect(palette.primary.toLowerCase()).not.toBe(palette.secondary.toLowerCase())
    }
  })
})

describe('findBrandPalette', () => {
  it('matches saved colors back to their preset, case-insensitively', () => {
    const target = BRAND_PALETTES[0]!
    expect(findBrandPalette(target.primary.toUpperCase(), target.secondary)).toEqual(target)
  })

  it('returns undefined for an unlisted combination', () => {
    expect(findBrandPalette('#123456', '#654321')).toBeUndefined()
  })

  it('returns undefined for null input', () => {
    expect(findBrandPalette(null, null)).toBeUndefined()
  })
})
