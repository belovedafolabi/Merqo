import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/context'

/**
 * Whether the signed-in user has already run (or dismissed) the in-app
 * product tour — read from users.tour_completed_at (20260902090100).
 *
 * `null` user or any read error → treat as "tour already done", so a
 * transient failure never forces the tour on someone. The tour is still
 * replayable on demand from the user menu regardless.
 */
export async function hasCompletedTour(): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) return true

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('users')
    .select('tour_completed_at')
    .eq('id', user.id)
    .maybeSingle<{ tour_completed_at: string | null }>()

  if (error || !data) return true
  return data.tour_completed_at !== null
}
