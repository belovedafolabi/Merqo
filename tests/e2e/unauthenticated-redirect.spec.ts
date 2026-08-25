import { expect, test } from '@playwright/test'

/**
 * A signed-out visitor to a protected route must land on /sign-in, never on
 * a 500. Two independent mechanisms produce that redirect, and this spec
 * covers whichever one is live:
 *
 * - With Supabase configured (the `e2e` CI job since Milestone 14 — see that
 *   job in .github/workflows/ci.yml), proxy.ts sees no session and redirects
 *   to `/sign-in?next=<pathname>`.
 * - With it unconfigured (a bare clone, `pnpm test:e2e` with no `db:start`),
 *   proxy.ts deliberately passes every request through via its own
 *   "not configured" guard, so protected routes reach their Server Component
 *   layouts instead. `createServerSupabaseClient()` used to throw there,
 *   turning a signed-out visit into a 500; lib/auth/context.ts now
 *   short-circuits on `isSupabaseConfigured()` (lib/supabase/server.ts) so
 *   `requireUser()` redirects cleanly. That regression is what this spec was
 *   originally written to pin down, and it still guards it.
 *
 * Hence the deliberately loose URL match: the proxy path carries a `?next=`
 * query string, the layout path does not.
 *
 * `/reports` and `/expenses` are listed specifically (Milestone 10). Every
 * other protected route reaches `requireUser()` through the shared layout;
 * these two are the first to call `requirePermission()` directly in their own
 * page bodies, which throws rather than redirects (lib/auth/guard.ts). This
 * spec pins down that the sign-in redirect happens *before* that throw can —
 * the ordering is what keeps a missing session from surfacing as a 500.
 *
 * Note what is deliberately not tested here: the reports themselves. This
 * project runs unauthenticated by design; authenticated coverage lives in
 * tests/e2e/authenticated/ (Milestone 14) and tests/integration/reports.test.ts.
 */
const PROTECTED_PATHS = ['/dashboard', '/pos', '/reports', '/expenses']

for (const path of PROTECTED_PATHS) {
  test(`unauthenticated visit to ${path} redirects to /sign-in instead of erroring`, async ({
    page,
  }) => {
    const response = await page.goto(path)

    await expect(page).toHaveURL(/\/sign-in(\?|$)/)
    expect(response?.status()).toBeLessThan(400)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })
}
