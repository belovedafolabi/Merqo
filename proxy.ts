import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import {
  SESSION_COOKIES,
  absoluteCapMs,
  evaluateSession,
  type SessionPolicy,
} from '@/lib/auth/session-policy'
import { logger } from '@/lib/logger'

/**
 * Session refresh + route gating, per docs/milestones/03-authentication-and-rbac-foundation.md
 * Frontend Changes: "redirect unauthenticated users to sign-in; redirect
 * authenticated users away from auth screens." This is a UX convenience
 * only — it is NOT the security boundary. Every Server Action/Route Handler
 * still calls lib/auth/guard.ts independently (this milestone's Security
 * Requirements: "there is no code path where the frontend is trusted as the
 * security boundary"), and RLS enforces the same thing again at the
 * database layer regardless of what this proxy does.
 *
 * Named proxy.ts, not middleware.ts: Next.js 16 renamed the file convention
 * (the old name still works but is deprecated and warns on every build).
 */
const PUBLIC_PATHS = ['/', '/sign-in', '/sign-up', '/forgot-password', '/reset-password']

/**
 * The locked screen itself must stay reachable by a locked-out user — see
 * the subscription-lock check below.
 */
const LOCK_EXEMPT_PATHS = ['/subscription-locked']

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true
  if (pathname.startsWith('/auth/')) return true
  if (pathname.startsWith('/api/')) return true
  // Milestone 11: an invite link must work for a visitor with no session at
  // all (they haven't signed up yet) as well as one who is already signed in
  // under a different account — both are legitimate entrants to
  // /invite/[token], so this is public rather than gated like every other
  // (auth) route.
  if (pathname.startsWith('/invite/')) return true
  return false
}

/**
 * Milestone 17 Part C. `httpOnly` so page JS cannot extend a session by
 * rewriting `merqo_last_seen`; `Secure` off in dev only because localhost is
 * plain http. A `maxAge` is written for `long` sessions only — omitting it
 * makes the browser treat the cookie as a session cookie, which is what
 * actually delivers "signed out when the browser closes" for `short`.
 */
function writeSessionCookies(
  response: NextResponse,
  policy: SessionPolicy,
  startedAt: number,
  lastSeen: number,
): void {
  const options = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    ...(policy === 'long' ? { maxAge: Math.floor(absoluteCapMs(policy) / 1000) } : {}),
  } as const

  response.cookies.set(SESSION_COOKIES.policy, policy, options)
  response.cookies.set(SESSION_COOKIES.start, String(startedAt), options)
  response.cookies.set(SESSION_COOKIES.lastSeen, String(lastSeen), options)
}

function clearSessionCookies(response: NextResponse): void {
  for (const name of Object.values(SESSION_COOKIES)) {
    response.cookies.delete(name)
  }
}

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Mirrors app/api/health/route.ts's "not_configured" graceful-degradation
  // stance: without these, there's no session to refresh or gate on, so
  // pass every request through rather than throwing (@supabase/ssr's
  // createServerClient throws on a missing url/key). This keeps `/` and
  // `/api/health` usable with zero setup (Milestone 01's "clone, install,
  // run" requirement) and keeps CI's e2e smoke job — which never starts a
  // Supabase instance — from failing on every request.
  if (!supabaseUrl || !supabaseAnonKey) {
    logger.warn('proxy.supabase_not_configured', { pathname: request.nextUrl.pathname })
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // Required even though the result isn't used directly below: this is what
  // actually refreshes an expiring session's cookies via the setAll hook
  // above, on every request that passes through here.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isAuthScreen = ['/sign-in', '/sign-up', '/forgot-password'].includes(pathname)

  // RSC prefetches fire on every link hover. They are speculative — the real
  // navigation re-runs this proxy without the prefetch header — so the two
  // gating RPCs below (both documented as UX-only, never the security
  // boundary; RLS denies a deactivated/locked user regardless) are pure
  // waste on a prefetch. Session refresh (getUser above) and the cheap
  // unauthenticated redirect still run.
  const isPrefetch =
    request.headers.get('next-router-prefetch') === '1' ||
    request.headers.get('purpose') === 'prefetch'

  if (!user && !isPublicPath(pathname)) {
    const redirectUrl = new URL('/sign-in', request.url)
    redirectUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  if (user && isAuthScreen) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Milestone 17 Part C: bounded sessions. Runs BEFORE the two RPCs below —
  // there is no point spending them on a session we are about to kill.
  //
  // Gated on `!isAuthScreen`, deliberately NOT on `!isPublicPath()`: that
  // helper returns true for every `/api/` path, so reusing it here would leave
  // an authenticated API route as a way to keep a long-idle session alive
  // indefinitely — the exact bypass this part exists to close. Prefetches are
  // excluded so a link hover never counts as activity.
  //
  // The write itself is deferred to just before the final `return`: the RPCs
  // below can trigger a token refresh, and the setAll hook above rebuilds
  // `response` from scratch when that happens — cookies set on the old object
  // would be silently dropped roughly once per jwt_expiry.
  let pendingSessionCookies: { policy: SessionPolicy; startedAt: number; lastSeen: number } | null =
    null

  if (user && !isAuthScreen && !isPrefetch) {
    const now = Date.now()
    const rawPolicy = request.cookies.get(SESSION_COOKIES.policy)?.value

    if (rawPolicy === undefined) {
      // No cookie yet: a session that predates this feature, or one just
      // established by the recovery/invite flows rather than by signIn().
      // Treat it as starting now — the alternative, treating "unknown" as
      // "expired", would sign out every live user the moment this deploys.
      // The Supabase-side timebox still bounds these from the server.
      pendingSessionCookies = { policy: 'long', startedAt: now, lastSeen: now }
    } else {
      const verdict = evaluateSession({
        policy: rawPolicy,
        startedAt: request.cookies.get(SESSION_COOKIES.start)?.value,
        lastSeen: request.cookies.get(SESSION_COOKIES.lastSeen)?.value,
        now,
      })

      // The locked screen is exempt from expiry but not from the clock: an
      // Owner sitting on /subscription-locked long enough to arrange payment
      // must not be signed out mid-flow (Milestone 13), yet their session
      // still has to age normally once they leave it.
      if (verdict.status === 'expired' && !LOCK_EXEMPT_PATHS.includes(pathname)) {
        const lastSeen = Number(request.cookies.get(SESSION_COOKIES.lastSeen)?.value)
        logger.info('auth.session_timeout', {
          policy: rawPolicy,
          reason: verdict.reason,
          pathname,
          idleMs: Number.isFinite(lastSeen) ? now - lastSeen : null,
        })

        // `scope: 'local'` — this device only. The default is 'global', which
        // would revoke the refresh token everywhere: a laptop left idle
        // overnight would silently sign the user out of the till they are
        // standing at. An idle timeout is a statement about THIS device, not
        // about the account. Deactivation below keeps the global signOut(),
        // where killing every session is exactly the point.
        await supabase.auth.signOut({ scope: 'local' })

        // An expired session on an API route gets JSON, not a 302 to an HTML
        // login page a fetch() caller cannot do anything useful with.
        const expiredResponse = pathname.startsWith('/api/')
          ? NextResponse.json({ error: 'session_expired' }, { status: 401 })
          : NextResponse.redirect(
              (() => {
                const url = new URL('/sign-in', request.url)
                url.searchParams.set('reason', 'timeout')
                return url
              })(),
            )
        // signOut() clears the Supabase auth cookies through the setAll hook
        // above, which writes them onto `response` — an object we are about to
        // throw away. Without carrying them over, the browser keeps a valid
        // auth cookie, the next request re-bootstraps a fresh window, and the
        // timeout becomes a redirect the user can simply navigate past.
        for (const cookie of response.cookies.getAll()) {
          expiredResponse.cookies.set(cookie)
        }
        clearSessionCookies(expiredResponse)
        return expiredResponse
      }

      // Still alive: slide the idle window forward. `startedAt` is never
      // rewritten — that is what makes the absolute cap absolute.
      const startedAt = Number(request.cookies.get(SESSION_COOKIES.start)?.value)
      pendingSessionCookies = {
        policy: rawPolicy === 'short' ? 'short' : 'long',
        startedAt: Number.isFinite(startedAt) && startedAt > 0 ? startedAt : now,
        lastSeen: now,
      }
    }
  }

  // Milestone 11's Security Requirement: deactivation "immediately
  // invalidates their active session(s), not just future logins." The real
  // boundary is the database — user_is_active() (20260824090100) makes every
  // RLS-protected query return nothing the instant deactivated_at is set,
  // regardless of what this proxy does. This check exists only so a
  // deactivated user sees an explicit sign-out instead of every page
  // rendering empty, which would look like a bug rather than a revoked
  // account. Scoped to a signed-in user on a private path — no session, no
  // RPC to make.
  //
  // The subscription-lock check (Milestone 13) shares this block. Its real
  // boundary is organization_access_permitted() (20260825100500); this only
  // routes a locked-out user to an explicit "renew to continue" screen
  // instead of every page rendering empty. Deliberately NO signOut() for a
  // lock, unlike deactivation: an Owner needs a live session to pay.
  //
  // Both RPCs are independent, so they are dispatched together (before the
  // first await) and resolve concurrently rather than serially.
  if (user && !isPublicPath(pathname) && !isPrefetch) {
    const activePromise = supabase.rpc('user_is_active')
    const accessPromise = LOCK_EXEMPT_PATHS.includes(pathname)
      ? null
      : supabase.rpc('subscription_access_state').maybeSingle<{ locked: boolean }>()

    const { data: active } = await activePromise
    if (active === false) {
      await supabase.auth.signOut()
      const redirectUrl = new URL('/sign-in', request.url)
      redirectUrl.searchParams.set('reason', 'deactivated')
      return NextResponse.redirect(redirectUrl)
    }

    if (accessPromise) {
      const { data: accessState } = await accessPromise
      if (accessState?.locked) {
        return NextResponse.redirect(new URL('/subscription-locked', request.url))
      }
    }
  }

  // Applied last, against whatever `response` object the cookie adapter left
  // behind — see the comment on pendingSessionCookies above.
  if (pendingSessionCookies) {
    writeSessionCookies(
      response,
      pendingSessionCookies.policy,
      pendingSessionCookies.startedAt,
      pendingSessionCookies.lastSeen,
    )
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Skip static assets and image optimization files — session refresh has
     * nothing to do there.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
