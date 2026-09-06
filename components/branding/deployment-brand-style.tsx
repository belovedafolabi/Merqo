import { getDeploymentBrandTokens } from '@/lib/branding/queries'
import { brandTokensToCssDeclarations } from '@/lib/branding/tokens'

/**
 * The auth-shell counterpart of components/branding/brand-style.tsx. The
 * sign-in / sign-up / password-reset screens render before any session, so
 * BrandStyle (which resolves the org from the caller's grants) would emit
 * only the built-in defaults there. This reads the deployment's one
 * organization via the anon-safe deployment_branding() RPC instead, so the
 * auth card's brand glow and the "Signing you in…" shimmer are the same
 * colour as the rest of the app.
 *
 * A server component for the same reason BrandStyle is one — the
 * contrast-fallback check runs server-side, no client fetch.
 */
export async function DeploymentBrandStyle() {
  const tokens = await getDeploymentBrandTokens()
  return <style>{`:root { ${brandTokensToCssDeclarations(tokens)} }`}</style>
}
