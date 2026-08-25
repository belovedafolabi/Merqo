/**
 * The locked-organization shell — deliberately its own route group, outside
 * app/(app). app/(app)/layout.tsx:30-33 redirects to /onboarding when
 * getOnboardingState() (RLS-gated) returns empty, which it will for any
 * locked-out user regardless of role — routing /subscription-locked through
 * that layout would produce an infinite redirect loop. This shell renders
 * from subscription_access_state() alone (see the page), so it stays
 * reachable no matter how thoroughly the lock has stripped this user's
 * grants. Borrows the auth shell's centered-card visual language
 * (app/(auth)/layout.tsx) rather than inventing a third look.
 */
export default function LockedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-admin-canvas flex min-h-svh flex-1 items-center justify-center p-6">
      {children}
    </div>
  )
}
