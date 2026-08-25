'use server'

import { revalidatePath } from 'next/cache'

import { markAllNotificationsRead, markNotificationRead } from '@/lib/notifications/mutations'

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
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
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
