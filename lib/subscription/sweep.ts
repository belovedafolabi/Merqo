import {
  notifySubscriptionExpired,
  notifySubscriptionExpiring,
} from '@/lib/notifications/subscription'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/admin'

/**
 * The daily sweep's application-layer entry point, called only from
 * app/api/cron/subscriptions/route.ts — CRON_SECRET is the boundary at that
 * caller; there is no user session here to authorize against, hence the
 * service-role client (see lib/supabase/admin.ts's doc comment).
 *
 * run_subscription_daily_sweep() (20260825100700) does the status
 * transitions, audits each newly expired org, and returns which
 * organizations need a notification — it deliberately does NOT fire the
 * notifications itself (see that function's comment: `perform`ing a
 * notify_*() call there would discard its return value, which is the email
 * worklist). This function is what turns that list into actual emails, via
 * the same TS wrappers (lib/notifications/subscription.ts) every other
 * event in this codebase uses — insert the in-app row AND send the email,
 * never throwing.
 */
export interface SubscriptionSweepResult {
  expiringMarked: number
  expiredMarked: number
  notificationsCreated: number
  emailsSent: number
  emailsFailed: number
  notificationsPurged: number
}

export async function runSubscriptionSweep(): Promise<SubscriptionSweepResult> {
  const supabase = createServiceRoleSupabaseClient()
  const { data, error } = await supabase.rpc('run_subscription_daily_sweep').single<{
    expiring_organization_ids: string[] | null
    expired_organization_ids: string[] | null
    notifications_purged: number
  }>()
  if (error) throw error

  const expiringIds = data.expiring_organization_ids ?? []
  const expiredIds = data.expired_organization_ids ?? []

  let notificationsCreated = 0
  let emailsSent = 0
  let emailsFailed = 0

  for (const organizationId of expiringIds) {
    const result = await notifySubscriptionExpiring(organizationId, supabase)
    notificationsCreated += result.inAppCreated
    emailsSent += result.emailsSent
    emailsFailed += result.emailsFailed
  }

  for (const organizationId of expiredIds) {
    const result = await notifySubscriptionExpired(organizationId, supabase)
    notificationsCreated += result.inAppCreated
    emailsSent += result.emailsSent
    emailsFailed += result.emailsFailed
  }

  return {
    expiringMarked: expiringIds.length,
    expiredMarked: expiredIds.length,
    notificationsCreated,
    emailsSent,
    emailsFailed,
    notificationsPurged: data.notifications_purged,
  }
}
