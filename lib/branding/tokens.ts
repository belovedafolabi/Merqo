import {
  pickReadableForeground,
  resolveBrandColor,
  type ResolvedBrandColor,
} from '@/lib/branding/contrast'

/**
 * Default/seed organization branding (docs/UXUI_Design_System_Specification.md's
 * emerald reference design) — used whenever an organization hasn't set a
 * value yet, and as the safe fallback a failing custom color is replaced
 * with. Computed once at module load via the same contrast utility real
 * branding values go through, so the seed can never itself be an invalid
 * fallback.
 */
const DEFAULT_PRIMARY_HEX = '#059669'
const DEFAULT_SECONDARY_HEX = '#34d399'

/**
 * Surfaces a brand accent can land on directly in the shipped shells (see
 * app/globals.css): the light card surface, and the sidebar, which is
 * always dark regardless of theme. Kept as a short, explicit list rather
 * than trying to enumerate every possible surface — these two are
 * representative of "lightest" and "darkest" surfaces in the system, so
 * passing the 3:1 non-text check against both is a good proxy for passing
 * it anywhere in between.
 */
const ACCENT_SURFACES = ['#ffffff', '#10151a'] as const

const DEFAULT_PRIMARY_FOREGROUND_HEX = pickReadableForeground(DEFAULT_PRIMARY_HEX)
const DEFAULT_SECONDARY_FOREGROUND_HEX = pickReadableForeground(DEFAULT_SECONDARY_HEX)

export interface OrganizationBrandingInput {
  primaryColor: string | null
  secondaryColor: string | null
}

export interface BrandTokens {
  primary: ResolvedBrandColor
  secondary: ResolvedBrandColor
}

/**
 * Runs an organization's raw branding fields through the contrast utility
 * and returns the resolved `--brand-*` CSS variable pairing (this is the
 * one place branding-to-CSS-variable mapping happens — components/branding/
 * brand-style.tsx just renders whatever this returns).
 */
export function resolveBrandTokens(branding: OrganizationBrandingInput): BrandTokens {
  return {
    primary: resolveBrandColor(
      branding.primaryColor,
      DEFAULT_PRIMARY_HEX,
      DEFAULT_PRIMARY_FOREGROUND_HEX,
      ACCENT_SURFACES,
    ),
    secondary: resolveBrandColor(
      branding.secondaryColor,
      DEFAULT_SECONDARY_HEX,
      DEFAULT_SECONDARY_FOREGROUND_HEX,
      ACCENT_SURFACES,
    ),
  }
}

/** CSS custom-property declarations for a `<style>` block — see brand-style.tsx. */
export function brandTokensToCssDeclarations(tokens: BrandTokens): string {
  return [
    `--brand-primary: ${tokens.primary.background};`,
    `--brand-primary-foreground: ${tokens.primary.foreground};`,
    `--brand-secondary: ${tokens.secondary.background};`,
    `--brand-secondary-foreground: ${tokens.secondary.foreground};`,
  ].join(' ')
}
