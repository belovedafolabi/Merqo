import { requireUser } from '@/lib/auth/guard'
import { fetchPermissionGrants } from '@/lib/auth/context'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PermissionsProvider } from '@/lib/auth/permissions-context'
import { signOut } from '@/app/(auth)/actions'

/**
 * The minimal authenticated shell (docs/milestones/03-authentication-and-rbac-foundation.md
 * Frontend Changes) — real navigation/branding arrives with Milestone 04's
 * design system. requireUser() is the actual gate; middleware.ts's redirect
 * is only a UX head start, never relied on as the security boundary.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  const supabase = await createServerSupabaseClient()
  const grants = await fetchPermissionGrants(supabase)

  return (
    <PermissionsProvider grants={grants}>
      <div className="flex min-h-full flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-6 py-4">
          <span className="font-semibold">Merqo</span>
          <form action={signOut}>
            <button type="submit" className="text-sm underline underline-offset-4">
              Sign out
            </button>
          </form>
        </header>
        <div className="flex-1">{children}</div>
      </div>
    </PermissionsProvider>
  )
}
