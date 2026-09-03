'use server'

import { revalidatePath } from 'next/cache'

import { toErrorMessage } from '@/lib/errors'
import { getCurrentOrganizationId } from '@/lib/auth/context'
import { setDashboardWidgetEnabled } from '@/lib/dashboard/layout'

export interface DashboardActionState {
  error: string | null
}

/**
 * Toggle a dashboard widget for the current user. Called from the
 * "Add widget" drawer's per-widget switch. Self-scoped end to end:
 * setDashboardWidgetEnabled resolves the user from the session and RLS ties
 * the row to auth.uid(), so nothing here trusts a caller-supplied user id.
 */
export async function toggleDashboardWidgetAction(
  _prev: DashboardActionState,
  formData: FormData,
): Promise<DashboardActionState> {
  const organizationId = await getCurrentOrganizationId()
  if (!organizationId) return { error: 'Not signed in.' }

  const widgetId = String(formData.get('widgetId') ?? '')
  const enabled = formData.get('enabled') === 'true'

  try {
    await setDashboardWidgetEnabled(organizationId, widgetId, enabled)
    revalidatePath('/dashboard')
    return { error: null }
  } catch (error) {
    return { error: toErrorMessage(error) }
  }
}
