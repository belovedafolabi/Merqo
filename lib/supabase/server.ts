import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

/**
 * The Supabase client for Server Components, Server Actions, and Route
 * Handlers. Uses the anon key and the caller's own session cookie, so every
 * query respects RLS as that signed-in user — this is the only Supabase
 * client the app uses server-side. No service-role client exists in this
 * milestone: the service-role key is never used from any client-reachable
 * code path (this milestone's Security Requirements), and nothing here
 * needs to bypass RLS — the SECURITY DEFINER Postgres functions
 * (supabase/migrations/2026082209*_create_*_functions.sql) are the
 * deliberate, narrow exceptions to that rule, not a general-purpose
 * escape hatch in application code.
 *
 * Must be called fresh per request (Server Components can't set cookies, so
 * `setAll` is a no-op there — middleware.ts is what actually refreshes the
 * session cookie on every request).
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Called from a Server Component render, where cookies are
            // read-only. middleware.ts refreshes the session on every
            // request, so this is safe to ignore here.
          }
        },
      },
    },
  )
}
