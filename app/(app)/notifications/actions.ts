'use server'

import { toErrorMessage } from '@/lib/errors'

import { revalidatePath } from 'next/cache'

import { markAllNotificationsRead, markNotificationRead } from '@/lib/notifications/mutations'
import { getCurrentOrganizationId } from '@/lib/auth/context'
import { listNotifications, type NotificationSummary } from '@/lib/notifications/queries'

/**
 * Thin Server Action layer — same shape as every domain since Milestone 10.
 * Both actions revalidate '/notifications' AND '/', 'layout': the bell
 * (components/notifications/notification-bell.tsx) renders inside
 * AdminTopbar, which every app/(app)/** page mounts, so a narrower
 * revalidatePath would leave a stale unread badge visible everywhere except
 * the inbox page itself — same reasoning app/(app)/settings/actions.ts's
 * updateBrandingAction already applies to branding.
 */
export interface NotificationActionState {
  error: string | null
}

const initialState: NotificationActionState = { error: null }

function errorMessage(error: unknown): string {
  return toErrorMessage(error)
}

/**
 * The bell's drawer loads the inbox on first open through this rather than
 * navigating to /notifications. RLS (notifications_select_self) scopes the
 * rows to the caller; there is no organizational resource to gate, same as
 * the /notifications page itself.
 */
export async function getNotificationsAction(): Promise<NotificationSummary[]> {
  const organizationId = await getCurrentOrganizationId()
  if (!organizationId) return []
  return listNotifications(organizationId, { limit: 30 })
}

export async function markReadAction(
  _prevState: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const notificationId = String(formData.get('notificationId') ?? '')

  try {
    await markNotificationRead(notificationId)
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/notifications')
  revalidatePath('/', 'layout')
  return initialState
}

export async function markAllReadAction(
  _prevState: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')

  try {
    await markAllNotificationsRead(organizationId)
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/notifications')
  revalidatePath('/', 'layout')
  return initialState
}
