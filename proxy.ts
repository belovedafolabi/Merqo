import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

  if (!user && !isPublicPath(pathname)) {
    const redirectUrl = new URL('/sign-in', request.url)
    redirectUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  if (user && isAuthScreen) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
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
  if (user && !isPublicPath(pathname)) {
    const { data: active } = await supabase.rpc('user_is_active')
    if (active === false) {
      await supabase.auth.signOut()
      const redirectUrl = new URL('/sign-in', request.url)
      redirectUrl.searchParams.set('reason', 'deactivated')
      return NextResponse.redirect(redirectUrl)
    }
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
