import { requireUser } from '@/lib/auth/guard'
import { getThemePreference } from '@/lib/theme/preferences'
import { AccountSecurityForm } from '@/components/settings/account-security-form'
import { AppearanceCard } from '@/components/settings/appearance-card'

/**
 * Milestone 17 Part C. No requirePermission() — a user's own password, their
 * own sessions, and their own theme are not an organizational resource,
 * exactly like the notification preferences screen next door. Supabase Auth
 * is the entire boundary: every action behind this page acts on `auth.uid()`
 * and cannot reach another user's data regardless of role.
 */
export default async function AccountSettingsPage() {
  const user = await requireUser()
  const themePreference = await getThemePreference()

  return (
    <div className="flex flex-col gap-6">
      <AccountSecurityForm email={user.email ?? ''} />
      <AppearanceCard current={themePreference} />
    </div>
  )
}
