import { NextResponse } from 'next/server'

import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SupabaseCheck = 'ok' | 'unreachable' | 'not_configured'

/**
 * Liveness probe for Supabase. Deliberately does NOT use @supabase/supabase-js:
 * there is no schema to query until Milestone 02, and GoTrue's /auth/v1/health
 * endpoint is a real network round-trip that needs no tables.
 */
async function checkSupabase(): Promise<SupabaseCheck> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) return 'not_configured'

  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(2_000),
      cache: 'no-store',
    })
    return response.ok ? 'ok' : 'unreachable'
  } catch (error) {
    logger.warn('health.supabase_unreachable', {
      route: '/api/health',
      error: error instanceof Error ? error.message : String(error),
    })
    return 'unreachable'
  }
}

export async function GET() {
  const supabase = await checkSupabase()
  const healthy = supabase !== 'unreachable'

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      service: 'merqo',
      timestamp: new Date().toISOString(),
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      checks: { supabase },
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    },
  )
}
