import { requireUser } from '@/lib/auth/guard'
import { AccountSecurityForm } from '@/components/settings/account-security-form'

/**
 * Milestone 17 Part C. No requirePermission() — a user's own password and
 * their own sessions are not an organizational resource, exactly like the
 * notification preferences screen next door. Supabase Auth is the entire
 * boundary: every action behind this page acts on `auth.uid()` and cannot
 * reach another user's sessions regardless of role.
 */
export default async function AccountSettingsPage() {
  const user = await requireUser()

  return <AccountSecurityForm email={user.email ?? ''} />
}
