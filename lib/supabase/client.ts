import { createBrowserClient } from '@supabase/ssr'

/**
 * The Supabase client for Client Components. Uses the anon key only —
 * same RLS-respecting posture as lib/supabase/server.ts, just for the
 * browser. Not needed by this milestone's own forms (they use Server
 * Actions), kept available for later milestones' genuinely interactive UI.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
