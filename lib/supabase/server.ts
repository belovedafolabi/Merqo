import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

/**
 * Whether the Supabase env vars this module needs are present. Mirrors
 * proxy.ts's identical check (see its module doc): callers that can degrade
 * gracefully — currently lib/auth/context.ts, so an unauthenticated-looking
 * request redirects to /sign-in instead of crashing — should check this
 * before calling createServerSupabaseClient() rather than catching its
 * throw. Callers with no sensible fallback (e.g. the sign-in Server Action
 * itself) are fine letting createServerSupabaseClient() throw as-is.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

/**
 * The Supabase client for Server Components, Server Actions, and Route
 * Handlers. Uses the anon key and the caller's own session cookie, so every
 * query respects RLS as that signed-in user — this is the RLS-respecting
 * client the app uses server-side for everything except the two narrow
 * exceptions named below. Nothing here needs to bypass RLS — the SECURITY
 * DEFINER Postgres functions (supabase/migrations/2026082209*_create_*_functions.sql)
 * are the deliberate, narrow exceptions to that rule, not a general-purpose
 * escape hatch in application code.
 *
 * Milestone 13 adds the one genuine exception: lib/supabase/admin.ts's
 * service-role client, used only by lib/subscription/settlement.ts and
 * lib/subscription/sweep.ts, where there is no user session to authenticate
 * as (a Paystack webhook, a cron job) — see that file's doc comment for the
 * boundary each of its callers relies on instead of RLS.
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

/**
 * A plain, cookie-free anon-key client — for the rare server-side caller
 * that has no user session to speak of and isn't inside a Next.js request's
 * AsyncLocalStorage context, so `next/headers`'s `cookies()` would throw
 * ("called outside a request scope"). Milestone 13's Paystack webhook is the
 * first such caller: it authenticates as Paystack (via HMAC signature), not
 * as any signed-in user, so there is no session cookie to read in the first
 * place — reaching for createServerSupabaseClient() there would be reaching
 * for a mechanism this caller has no use for, not just one that happens not
 * to work under test.
 *
 * Still RLS-respecting (this is the anon key, not the service-role key) —
 * used only to call record_audit_event(), which is separately granted to
 * `anon` for exactly this "no session yet" case (20260822093500).
 */
export function createAnonSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
