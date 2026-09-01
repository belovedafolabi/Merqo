import { NextResponse } from 'next/server'

import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Check = 'ok' | 'unreachable' | 'not_configured'

/**
 * Liveness probe for Supabase Auth (GoTrue). Deliberately does NOT use
 * @supabase/supabase-js: GoTrue's /auth/v1/health endpoint is a real network
 * round-trip that needs no tables.
 */
async function checkAuth(url: string, anonKey: string): Promise<Check> {
  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(2_000),
      cache: 'no-store',
    })
    return response.ok ? 'ok' : 'unreachable'
  } catch (error) {
    logger.warn('health.auth_unreachable', {
      route: '/api/health',
      error: error instanceof Error ? error.message : String(error),
    })
    return 'unreachable'
  }
}

/**
 * Milestone 16: GoTrue being up does not mean the app is up. A broken grant, a
 * stale PostgREST schema cache, or a paused project leaves Auth answering while
 * every data read fails — the monitor stays green through a real outage. This
 * hits PostgREST's root, which returns the OpenAPI spec: no table grants, no
 * schema dependency, just "is the Data API serving".
 */
async function checkPostgrest(url: string, anonKey: string): Promise<Check> {
  try {
    const response = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(2_000),
      cache: 'no-store',
    })
    return response.ok ? 'ok' : 'unreachable'
  } catch (error) {
    logger.warn('health.postgrest_unreachable', {
      route: '/api/health',
      error: error instanceof Error ? error.message : String(error),
    })
    return 'unreachable'
  }
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  let supabase: Check = 'not_configured'
  let postgrest: Check = 'not_configured'

  if (url && anonKey) {
    ;[supabase, postgrest] = await Promise.all([
      checkAuth(url, anonKey),
      checkPostgrest(url, anonKey),
    ])
  }

  // 'not_configured' is not a failure — it is the expected local/pre-deploy
  // state (see README.md). Only an actual 'unreachable' degrades the probe.
  const healthy = supabase !== 'unreachable' && postgrest !== 'unreachable'

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      service: 'merqo',
      timestamp: new Date().toISOString(),
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      checks: { supabase, postgrest },
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    },
  )
}
