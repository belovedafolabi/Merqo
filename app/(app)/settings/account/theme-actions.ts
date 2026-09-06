'use server'

import { toErrorMessage } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isThemePreference } from '@/lib/theme/preferences'

/**
 * Persists the Admin-shell theme choice to users.theme_preference via
 * set_theme_preference() (20260908090500) — server-stored so it follows the
 * user across devices, not a browser-local setting. Same never-throw shape
 * as completeTourAction(): a failed write just means the choice isn't
 * remembered next session.
 */
export async function setThemePreferenceAction(value: string): Promise<{ error: string | null }> {
  try {
    if (!isThemePreference(value)) throw new Error('Unknown theme option.')
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.rpc('set_theme_preference', { p_value: value })
    if (error) throw error
    return { error: null }
  } catch (error) {
    return { error: toErrorMessage(error) }
  }
}
