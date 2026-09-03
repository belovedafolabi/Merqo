import { NextResponse, type NextRequest } from 'next/server'

import { getCurrentUserContext } from '@/lib/auth/context'
import { posSearchProducts } from '@/lib/pos/catalog'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POS search-as-you-type, as a GET Route Handler rather than the Server
 * Action it replaces (searchProductsAction).
 *
 * The reason is not that a Server Action is slow per call — it is that React
 * SERIALIZES them: only one action runs at a time per client, and a newer one
 * does not abort an in-flight older one. For a box the cashier types into,
 * that means "brea" is still resolving when "bread" is queued behind it, and
 * the stale result paints last. A fetch() to this handler is cancellable
 * (components/pos/product-grid.tsx aborts the previous request on each
 * keystroke) and concurrent, so the latest query always wins.
 *
 * proxy.ts treats everything under /api/ as public, so this skips the two
 * session-gating RPCs — but it is NOT unauthenticated: the session check
 * below plus pos_search_products's SECURITY INVOKER RLS scoping mean a caller
 * only ever searches a business unit they can already see. A bogus
 * businessUnitId returns an empty list, not another tenant's catalog.
 */
export async function GET(request: NextRequest) {
  const { user } = await getCurrentUserContext()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const businessUnitId = searchParams.get('businessUnitId')?.trim()
  const term = searchParams.get('q')?.trim() ?? ''

  if (!businessUnitId) {
    return NextResponse.json({ error: 'businessUnitId is required.' }, { status: 400 })
  }
  if (!term) {
    return NextResponse.json({ products: [] }, { headers: { 'cache-control': 'no-store' } })
  }

  try {
    const products = await posSearchProducts(businessUnitId, term)
    return NextResponse.json({ products }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    logger.error('pos.search_failed', {
      route: '/api/pos/products/search',
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Search failed.' }, { status: 500 })
  }
}
