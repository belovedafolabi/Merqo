import { cache } from 'react'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/context'
import type { ThemePreference } from '@/lib/theme/types'

export {
  THEME_COOKIE,
  THEME_PREFERENCES,
  isThemePreference,
  type ThemePreference,
} from '@/lib/theme/types'

/**
 * The signed-in user's stored Admin-shell theme choice — users.theme_preference
 * (20260908090500), where NULL means "system". A null user or any read error
 * degrades to 'system', so a transient failure never locks someone into a
 * theme. Admin shell only; the POS and auth shells are always light.
 *
 * Server-only (reaches next/headers via createServerSupabaseClient) — client
 * components import the constants from lib/theme/types.ts instead.
 */
export const getThemePreference = cache(async (): Promise<ThemePreference> => {
  const user = await getCurrentUser()
  if (!user) return 'system'

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('users')
    .select('theme_preference')
    .eq('id', user.id)
    .maybeSingle<{ theme_preference: ThemePreference | null }>()

  if (error || !data) return 'system'
  return data.theme_preference ?? 'system'
})
