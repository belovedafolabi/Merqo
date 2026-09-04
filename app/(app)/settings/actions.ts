'use server'

import { toErrorMessage } from '@/lib/errors'

import { revalidatePath } from 'next/cache'

import {
  removeOrganizationLogo,
  updateBranding,
  uploadOrganizationLogo,
} from '@/lib/branding/mutations'
import { updateNotificationPreference } from '@/lib/notifications/mutations'
import type { NotificationCategory } from '@/lib/notifications/types'
import { updateOrganizationProfile } from '@/lib/organization/mutations'
import { updateReceiptSettings } from '@/lib/receipts/settings'

/**
 * Thin Server Action layer for the /settings hub — same shape as every
 * domain since Milestone 10. Every write here revalidates '/', not just the
 * settings path it belongs to: branding renders in the sidebar
 * (components/shell/admin-sidebar.tsx) and the POS shell via <BrandStyle>
 * mounted in both app/(app)/layout.tsx and app/(pos)/layout.tsx, so a
 * narrower revalidatePath would leave stale branding visible everywhere
 * except the settings page itself.
 */
export interface SettingsActionState {
  error: string | null
  logoUrl?: string
}

const initialState: SettingsActionState = { error: null }

function errorMessage(error: unknown): string {
  return toErrorMessage(error)
}

export async function updateOrganizationProfileAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')

  try {
    const rawThreshold = String(formData.get('defaultLowStockThreshold') ?? '').trim()
    await updateOrganizationProfile(organizationId, {
      contactPhone: (formData.get('contactPhone') as string) || undefined,
      contactEmail: (formData.get('contactEmail') as string) || undefined,
      addressLine: (formData.get('addressLine') as string) || undefined,
      defaultLowStockThreshold: rawThreshold === '' ? null : Number(rawThreshold),
      insightsLeadDays: Number(formData.get('insightsLeadDays')),
      insightsReorderThresholdDays: Number(formData.get('insightsReorderThresholdDays')),
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/settings/organization')
  return initialState
}

export async function updateBrandingAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')

  try {
    await updateBranding(organizationId, {
      brandName: (formData.get('brandName') as string) || undefined,
      primaryColor: (formData.get('primaryColor') as string) || null,
      secondaryColor: (formData.get('secondaryColor') as string) || null,
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/', 'layout')
  return initialState
}

export async function uploadLogoAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const file = formData.get('logo')

  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose an image file.' }
  }

  try {
    const logoUrl = await uploadOrganizationLogo(organizationId, file)
    revalidatePath('/', 'layout')
    return { error: null, logoUrl }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}

export async function removeLogoAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')

  try {
    await removeOrganizationLogo(organizationId)
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/', 'layout')
  return initialState
}

export async function updateReceiptSettingsAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')

  try {
    await updateReceiptSettings(organizationId, {
      templateId: String(formData.get('templateId') ?? 'classic') as
        'classic' | 'compact' | 'detailed',
      headerText: (formData.get('headerText') as string) || undefined,
      footerText: (formData.get('footerText') as string) || undefined,
      // Radix's <Switch> submits the native default "on" when checked
      // (unchecked fields are absent from FormData entirely), same
      // convention app/(app)/business-structure/actions.ts uses for its own
      // Switch fields.
      showLogo: formData.get('showLogo') === 'on',
      showCashier: formData.get('showCashier') === 'on',
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/settings/receipts')
  return initialState
}

export async function updateNotificationPreferencesAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    await updateNotificationPreference({
      // Same trust-then-validate cast updateReceiptSettingsAction's
      // templateId uses above — updateNotificationPreferenceInputSchema's
      // z.enum() inside the mutation is the actual validation.
      category: String(formData.get('category') ?? '') as NotificationCategory,
      // Radix's <Switch> submits "on" when checked, and is absent from
      // FormData entirely when unchecked — same convention as
      // updateReceiptSettingsAction's showLogo/showCashier above.
      inAppEnabled: formData.get('inAppEnabled') === 'on',
      emailEnabled: formData.get('emailEnabled') === 'on',
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  // The bell (components/notifications/notification-bell.tsx) renders in
  // AdminTopbar, mounted on every app/(app)/** page — same reasoning as
  // updateBrandingAction's revalidatePath above, though a preference change
  // does not itself move the unread count; kept for consistency with the
  // notifications domain's other revalidation calls.
  revalidatePath('/settings/notifications')
  return initialState
}
