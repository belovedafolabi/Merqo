/**
 * Curated primary/secondary brand color combinations for the branding
 * editor's palette dropdown (post-Milestone-17 UX fix — the old two
 * independent free-hex/native-color-picker fields were replaced with a
 * single guided choice, because most operators don't know their own brand's
 * hex code and picking two colors independently makes it easy to land on a
 * combination that clashes or fails contrast).
 *
 * Every entry here is checked, in tests/unit/branding/palettes.test.ts,
 * against the exact same lib/branding/contrast.ts#resolveBrandColor() the
 * server applies on save — so nothing in this list can silently fall back to
 * the gray default the way a hand-typed hex could. Pure data, no React or
 * server import (this file is imported from a 'use client' component).
 */

export interface BrandPalette {
  id: string
  name: string
  primary: string
  secondary: string
}

export const BRAND_PALETTES: readonly BrandPalette[] = [
  { id: 'forest-stone', name: 'Forest & Stone', primary: '#059669', secondary: '#64748b' },
  { id: 'ocean-teal', name: 'Ocean & Teal', primary: '#2563eb', secondary: '#0d9488' },
  { id: 'teal-stone', name: 'Teal & Stone', primary: '#0f766e', secondary: '#64748b' },
  { id: 'sky-violet', name: 'Sky & Violet', primary: '#0369a1', secondary: '#7c3aed' },
  { id: 'violet-berry', name: 'Violet & Berry', primary: '#7c3aed', secondary: '#db2777' },
  { id: 'plum-berry', name: 'Plum & Berry', primary: '#9333ea', secondary: '#be185d' },
  { id: 'rose-stone', name: 'Rose & Stone', primary: '#e11d48', secondary: '#64748b' },
  { id: 'crimson-amber', name: 'Crimson & Amber', primary: '#dc2626', secondary: '#d97706' },
  { id: 'tangerine-teal', name: 'Tangerine & Teal', primary: '#ea580c', secondary: '#0f766e' },
  { id: 'amber-forest', name: 'Amber & Forest', primary: '#d97706', secondary: '#059669' },
  { id: 'lagoon-rose', name: 'Lagoon & Rose', primary: '#0e7490', secondary: '#e11d48' },
  { id: 'forest-bronze', name: 'Forest & Bronze', primary: '#047857', secondary: '#b45309' },
  { id: 'ocean-rust', name: 'Ocean & Rust', primary: '#2563eb', secondary: '#c2410c' },
  { id: 'teal-amber', name: 'Teal & Amber', primary: '#0d9488', secondary: '#d97706' },
  { id: 'meadow-stone', name: 'Meadow & Stone', primary: '#16a34a', secondary: '#64748b' },
  { id: 'sky-rose', name: 'Sky & Rose', primary: '#0369a1', secondary: '#e11d48' },
  { id: 'plum-bronze', name: 'Plum & Bronze', primary: '#9333ea', secondary: '#b45309' },
  { id: 'berry-teal', name: 'Berry & Teal', primary: '#db2777', secondary: '#0f766e' },
  { id: 'olive-forest', name: 'Olive & Forest', primary: '#4d7c0f', secondary: '#047857' },
  { id: 'stone-ocean', name: 'Stone & Ocean', primary: '#64748b', secondary: '#2563eb' },
  { id: 'rose-amber', name: 'Rose & Amber', primary: '#e11d48', secondary: '#d97706' },
  { id: 'violet-forest', name: 'Violet & Forest', primary: '#7c3aed', secondary: '#059669' },
  { id: 'lagoon-tangerine', name: 'Lagoon & Tangerine', primary: '#0e7490', secondary: '#ea580c' },
  { id: 'ruby-teal', name: 'Ruby & Teal', primary: '#be185d', secondary: '#0d9488' },
] as const

/** Matches saved colors back to a preset (case-insensitive), for the editor's initial selection. */
export function findBrandPalette(
  primary: string | null,
  secondary: string | null,
): BrandPalette | undefined {
  if (!primary || !secondary) return undefined
  const p = primary.toLowerCase()
  const s = secondary.toLowerCase()
  return BRAND_PALETTES.find(
    (palette) => palette.primary.toLowerCase() === p && palette.secondary.toLowerCase() === s,
  )
}
