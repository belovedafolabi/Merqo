import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '@/lib/logger'
import { createServerSupabaseClient } from '@/lib/supabase/server'

import { deliverNotificationEmails, type NotifyResult } from './service'

interface NotifyRoleAssignedRow {
  notification_id: string
  user_id: string
  email: string
  full_name: string
  email_enabled: boolean
  role_name: string
  organization_name: string
}

/**
 * The milestone's basic security trigger ("role/permission changed"). Calls
 * public.notify_role_assigned() — category `security`, non-disableable —
 * after lib/roles/mutations.ts's assignUserRole() has already committed the
 * role assignment and recorded its audit event. Same never-throws contract
 * as notifyLowStock(); see that file's header for the full reasoning.
 */
export async function notifyRoleAssigned(
  userRoleId: string,
  supabaseClient?: SupabaseClient,
): Promise<NotifyResult> {
  try {
    const supabase = supabaseClient ?? (await createServerSupabaseClient())

    const { data, error } = await supabase.rpc('notify_role_assigned', {
      p_user_role_id: userRoleId,
    })
    if (error) throw error

    const rows = (data ?? []) as NotifyRoleAssignedRow[]
    const emailable = rows.filter((row) => row.email_enabled)

    return await deliverNotificationEmails(
      emailable,
      (row) => ({
        type: 'employee.role_changed',
        data: {
          roleName: row.role_name,
          organizationName: row.organization_name,
          href: '/settings/organization',
        },
      }),
      rows.length,
    )
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    logger.error('notification.delivery_failed', {
      type: 'employee.role_changed',
      userRoleId,
      reason,
    })
    return { inAppCreated: 0, emailsSent: 0, emailsFailed: 0 }
  }
}
