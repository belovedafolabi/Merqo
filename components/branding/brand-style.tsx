import { getResolvedBrandTokens } from '@/lib/branding/queries'
import { brandTokensToCssDeclarations } from '@/lib/branding/tokens'

/**
 * Mounted once per shell layout (app/(app)/layout.tsx, app/(pos)/layout.tsx)
 * to satisfy the milestone's functional requirement: "Switching an
 * organization's branding values immediately reflects across the Admin
 * Dashboard and POS shells without a code change." A plain `<style>` tag
 * overriding `--brand-*` at `:root` is enough — every color token that
 * matters (`--primary`, `--ring`, `--sidebar-primary`, …) already references
 * `--brand-primary`/`--brand-secondary` in app/globals.css, so this is the
 * single place a branding change fans out from.
 *
 * A server component (not a layout-level inline style prop) so the color
 * resolution — including the contrast-fallback check — happens server-side,
 * per this milestone's "no client-side fetch" pattern already established
 * by lib/auth/permissions-context.tsx.
 */
export async function BrandStyle() {
  const tokens = await getResolvedBrandTokens()
  const declarations = brandTokensToCssDeclarations(tokens)

  return <style>{`:root { ${declarations} }`}</style>
}
