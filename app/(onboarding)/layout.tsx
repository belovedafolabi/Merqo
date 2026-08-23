import { requireUser } from '@/lib/auth/guard'

/**
 * The onboarding wizard's shell — structurally separate from app/(app) and
 * app/(pos) (own route group, own layout) since a user without a Branch/
 * Business Unit yet has nothing for the Admin sidebar to navigate to. Reuses
 * the Admin/auth shells' dark-canvas backdrop token rather than inventing a
 * fourth visual language (app/(auth)/layout.tsx is the direct precedent).
 *
 * requireUser() only — the "has onboarding already been completed"
 * redirect-away lives in page.tsx, since deciding that requires the same
 * getOnboardingState() call the page needs anyway for step resolution.
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireUser()

  return (
    <div className="bg-admin-canvas flex min-h-svh flex-1 items-center justify-center p-6">
      {children}
    </div>
  )
}
