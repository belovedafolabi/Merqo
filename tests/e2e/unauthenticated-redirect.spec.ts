import { expect, test } from '@playwright/test'

/**
 * Regression coverage for the gap tests/e2e/responsive-shell.spec.ts used to
 * document: the `e2e` CI job (.github/workflows/ci.yml) runs against a plain
 * `next build && next start` with `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY`
 * entirely unset — no Supabase instance behind it at all (only
 * `db-migrations` provisions one). proxy.ts deliberately passes every
 * request through un-redirected in that state (its own "not configured"
 * guard), so protected routes reach their Server Component layouts, where
 * `requireUser()` → `getCurrentUserContext()` → `createServerSupabaseClient()`
 * used to construct a Supabase client from those same unset env vars and
 * throw — a 500 instead of the sign-in redirect a signed-out visitor should
 * see.
 *
 * lib/auth/context.ts now short-circuits on `isSupabaseConfigured()`
 * (lib/supabase/server.ts), mirroring proxy.ts's own guard, so
 * `getCurrentUserContext()` reports "no user" instead of throwing and
 * `requireUser()` redirects normally. This spec runs in the same
 * unconfigured state as the real `e2e` CI job — no env vars are set here or
 * in that job — so it's exercising the actual gap, not a mock of it.
 */
/**
 * Milestone 10 adds `/reports` and `/expenses`, and both are worth listing
 * here specifically. Every other protected route reaches `requireUser()`
 * through the shared layout; these two are the first to call
 * `requirePermission()` directly in their own page bodies, which throws rather
 * than redirecting (lib/auth/guard.ts). This spec pins down that a signed-out
 * visitor still gets the sign-in redirect from the layout *before* that throw
 * can happen — the ordering is what keeps a missing session from surfacing as
 * a 500.
 *
 * Note what is deliberately not tested here: the reports themselves. This CI
 * job has no Supabase behind it at all, so a test that signed in and asserted
 * on report figures could not run — that coverage lives in
 * tests/integration/reports.test.ts, which does have a database.
 */
const PROTECTED_PATHS = ['/dashboard', '/pos', '/reports', '/expenses']

for (const path of PROTECTED_PATHS) {
  test(`unauthenticated visit to ${path} redirects to /sign-in instead of erroring`, async ({
    page,
  }) => {
    const response = await page.goto(path)

    await expect(page).toHaveURL(/\/sign-in$/)
    expect(response?.status()).toBeLessThan(400)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })
}
