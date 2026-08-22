/**
 * WCAG contrast utility — the "computed contrast check with a safe fallback"
 * required by docs/milestones/04-design-system-and-app-shell.md (Scope,
 * Functional Requirements) and docs/UXUI_Design_System_Specification.md §5
 * ("Brand Color -> Contrast validation -> Generate usable shades -> Apply to
 * allowed tokens"). Pure, dependency-free, unit-tested in
 * tests/unit/branding/contrast.test.ts — no database, no React, no Next.js.
 *
 * A brand color is applied to two kinds of surface, so it must pass two
 * different WCAG checks before it's trusted:
 *   1. Self-contrast — as a *background* paired with its own readable
 *      foreground text (buttons, badges): normal-text AA, >= 4.5:1.
 *   2. Non-text contrast — as an accent sitting directly on an existing
 *      surface (focus rings, active nav highlight, borders): WCAG 2.1
 *      1.4.11, >= 3:1 against every surface it can appear on (light card
 *      surfaces and the always-dark sidebar surface).
 *
 * A color failing either check falls back to the known-good default,
 * matching the milestone's Risk note: "tune the threshold conservatively and
 * surface a clear warning rather than silently overriding wherever
 * feasible" — callers get `usedFallback` back to surface that warning
 * (Milestone 11 wires the actual UI warning once branding is editable).
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

const HEX_PATTERN = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i

export function hexToRgb(hex: string): Rgb | null {
  const match = HEX_PATTERN.exec(hex.trim())
  const value = match?.[1]
  if (!value) return null

  const expanded =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value

  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  }
}

function channelToLinear(channel: number): number {
  const normalized = channel / 255
  return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b)
}

/** WCAG contrast ratio between two colors, in the range [1, 21]. */
export function contrastRatio(hexA: string, hexB: string): number {
  const rgbA = hexToRgb(hexA)
  const rgbB = hexToRgb(hexB)
  if (!rgbA || !rgbB) return 1

  const lumA = relativeLuminance(rgbA)
  const lumB = relativeLuminance(rgbB)
  const lighter = Math.max(lumA, lumB)
  const darker = Math.min(lumA, lumB)
  return (lighter + 0.05) / (darker + 0.05)
}

const WHITE = '#ffffff'
const NEAR_BLACK = '#0a0a0a'
const NORMAL_TEXT_MIN_RATIO = 4.5
const NON_TEXT_MIN_RATIO = 3

/** Whichever of white/near-black reads better on `backgroundHex`. */
export function pickReadableForeground(backgroundHex: string): string {
  const whiteRatio = contrastRatio(backgroundHex, WHITE)
  const blackRatio = contrastRatio(backgroundHex, NEAR_BLACK)
  return whiteRatio >= blackRatio ? WHITE : NEAR_BLACK
}

export interface ResolvedBrandColor {
  background: string
  foreground: string
  usedFallback: boolean
}

/**
 * Validates `candidateHex` against both required checks (see file header)
 * and returns it with its best-contrast foreground, or falls back to
 * `fallbackHex`/`fallbackForegroundHex` (assumed pre-validated) if it fails
 * either. `surfaces` is every existing surface color the accent can land on
 * directly (e.g. the card background and the sidebar background) for the
 * non-text check.
 */
export function resolveBrandColor(
  candidateHex: string | null | undefined,
  fallbackHex: string,
  fallbackForegroundHex: string,
  surfaces: readonly string[],
): ResolvedBrandColor {
  const fallback: ResolvedBrandColor = {
    background: fallbackHex,
    foreground: fallbackForegroundHex,
    usedFallback: true,
  }

  if (!candidateHex || !hexToRgb(candidateHex)) return fallback

  const foreground = pickReadableForeground(candidateHex)
  const selfContrastOk = contrastRatio(candidateHex, foreground) >= NORMAL_TEXT_MIN_RATIO
  const nonTextContrastOk = surfaces.every(
    (surface) => contrastRatio(candidateHex, surface) >= NON_TEXT_MIN_RATIO,
  )

  if (!selfContrastOk || !nonTextContrastOk) return fallback

  return { background: candidateHex, foreground, usedFallback: false }
}
