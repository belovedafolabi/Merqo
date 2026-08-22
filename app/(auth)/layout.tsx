/**
 * Auth shell — previously absent (Milestone 03's auth pages rendered
 * directly under the root layout). Auth precedes shell selection (a
 * visitor hasn't reached the Admin or POS shell yet), so it borrows the
 * Admin shell's dark-canvas visual language rather than inventing a third
 * look — per this milestone's Restyle-auth-screens deliverable.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-admin-canvas flex min-h-svh flex-1 items-center justify-center p-6">
      {children}
    </div>
  )
}
