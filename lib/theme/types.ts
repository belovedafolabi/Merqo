/**
 * Pure theme constants/types — no `next/*`, no supabase import — so a
 * 'use client' component (appearance-card.tsx, theme-sync.tsx) can pull
 * these without dragging lib/supabase/server (→ next/headers) into the
 * client bundle. lib/theme/preferences.ts re-exports everything here.
 */

export type ThemePreference = 'light' | 'dark' | 'system'

export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'] as const

/** The cookie the client writes with the RESOLVED theme ('light' | 'dark') so
 *  a 'system' user's first server paint matches their OS without a flash. */
export const THEME_COOKIE = 'merqo_theme'

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}
