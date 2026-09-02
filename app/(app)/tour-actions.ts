'use server'

import { toErrorMessage } from '@/lib/errors'

import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Marks the in-app product tour finished for the current user via the
 * mark_tour_completed() RPC (20260902090100), which can only ever stamp the
 * caller's own users row. Called by components/tour/product-tour.tsx when
 * the tour is completed or dismissed. Never throws to the client — a failed
 * write just means the tour may auto-start again next session, which the
 * client also guards against with a localStorage flag.
 */
export async function completeTourAction(): Promise<{ error: string | null }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.rpc('mark_tour_completed')
    if (error) throw error
    return { error: null }
  } catch (error) {
    return { error: toErrorMessage(error) }
  }
}
