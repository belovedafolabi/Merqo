import { DeploymentBrandStyle } from '@/components/branding/deployment-brand-style'

/**
 * Auth shell — previously absent (Milestone 03's auth pages rendered
 * directly under the root layout). Auth precedes shell selection (a
 * visitor hasn't reached the Admin or POS shell yet), so it borrows the
 * Admin shell's dark-canvas visual language rather than inventing a third
 * look — per this milestone's Restyle-auth-screens deliverable.
 *
 * <DeploymentBrandStyle> makes `--brand-primary` / `--brand-secondary` the
 * deployment's actual configured colours here, before any session — so the
 * auth card's brand glow and the sign-in shimmer match the branded app.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell bg-admin-canvas flex min-h-svh flex-1 items-center justify-center p-6">
      <DeploymentBrandStyle />
      {children}
    </div>
  )
}
