import { expect, test, type Browser, type BrowserContext } from '@playwright/test'

import { readE2EFixture } from '../helpers/fixture'

/**
 * Milestone 17 Part C. Exercises proxy.ts's bounded-session check by backdating
 * the session cookies rather than by shortening the window with an env override
 * and then really waiting.
 *
 * Backdating is the better lever here: the env overrides in
 * lib/auth/session-policy.ts are inlined at build time, and playwright.config's
 * webServer builds once for the whole run — so a window short enough to expire
 * inside a test would also expire every other authenticated spec mid-flight.
 * Rewriting the cookie exercises exactly the same production code path with no
 * blast radius. (The env overrides are still covered, in the unit tests.)
 *
 * Three structural points, each learned from a real flake:
 *
 * 1. Every test signs in FRESH instead of reusing the shared storageState.
 *    These tests destroy the session they run against, and signOut revokes that
 *    refresh token server-side — so a shared token poisons whichever test runs
 *    next, surfacing as an unrelated-looking "/sign-in?next=" failure.
 * 2. The backdate is applied to a SAVED storage state, and a second context is
 *    built from it. Editing cookies on a live context races the sign-in page's
 *    still-in-flight responses, each of which carries a Set-Cookie that
 *    refreshes the very timestamps under test. (`waitForLoadState('networkidle')`
 *    is not a fix — it never settles on this app.)
 * 3. Requests go through a page, not context.request: the APIRequestContext
 *    keeps its own view of the cookie jar and does not reliably observe an
 *    edit made after it has been used.
 */

test.beforeEach(() => {
  // One project only. Session lifetime has nothing to do with viewport, and
  // this is the only authenticated spec that signs in for real — four times.
  // Left unrestricted it would run on desktop/tablet/phone (and again per
  // browser in the cross-browser workflow), pushing a single IP past the app's
  // own `login` limit of 20 per 15 minutes (lib/rate-limit/config.ts). That
  // surfaces as a sign-in that never redirects, which reads like a flake rather
  // than the app correctly defending itself.
  test.skip(
    test.info().project.name !== 'desktop-auth',
    'Session lifetime is viewport-independent; runs once to stay under the login rate limit.',
  )
})

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>

/** Signs in for real and returns the resulting cookie jar, closing the context. */
async function signedInState(browser: Browser, baseURL: string | undefined): Promise<StorageState> {
  const fixture = await readE2EFixture()
  // storageState: undefined overrides the project-level state — a clean jar.
  const context = await browser.newContext({ baseURL, storageState: undefined })
  try {
    const page = await context.newPage()
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(fixture.email)
    await page.getByLabel('Password').fill(fixture.password)

    const remember = page.getByRole('switch', { name: 'Remember me for 30 days' })
    await remember.click()
    await expect(remember).toBeChecked()

    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/dashboard', { timeout: 30_000 })

    return await context.storageState()
  } finally {
    await context.close()
  }
}

/** Rewrites one `merqo_sess_*` cookie's value in a saved state. */
function backdate(state: StorageState, name: string, msAgo: number): StorageState {
  const target = state.cookies.find((cookie) => cookie.name === name)
  expect(target, `${name} should have been set at sign-in`).toBeTruthy()

  return {
    ...state,
    cookies: state.cookies.map((cookie) =>
      cookie.name === name ? { ...cookie, value: String(Date.now() - msAgo) } : cookie,
    ),
  }
}

test('a session idle past the 24h window is signed out with an inactivity notice', async ({
  browser,
  baseURL,
}) => {
  const state = backdate(await signedInState(browser, baseURL), 'merqo_last_seen', 25 * HOUR_MS)
  const context = await browser.newContext({ baseURL, storageState: state })
  const page = await context.newPage()

  await page.goto('/dashboard')

  await expect(page).toHaveURL(/\/sign-in\?reason=timeout/)
  // Matched by text, not getByRole('alert'): Next renders its own always-present
  // route announcer with role="alert", so the role alone trips strict mode.
  await expect(page.getByText(/signed out after a period of inactivity/i)).toBeVisible()

  // The sign-out must clear the Supabase auth cookies too, not just the policy
  // cookies — otherwise the next request re-bootstraps a fresh window and the
  // timeout becomes something the user can simply navigate past.
  expect(await context.cookies()).toHaveLength(0)

  await context.close()
})

test('activity inside the window keeps the session alive and slides it forward', async ({
  browser,
  baseURL,
}) => {
  const state = backdate(await signedInState(browser, baseURL), 'merqo_last_seen', 23 * HOUR_MS)
  const context = await browser.newContext({ baseURL, storageState: state })
  const page = await context.newPage()

  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/dashboard/)

  // The visit itself must have refreshed last_seen — otherwise the window
  // would not be rolling, and a user working daily would still be evicted.
  const refreshed = (await context.cookies()).find((cookie) => cookie.name === 'merqo_last_seen')
  expect(Date.now() - Number(refreshed?.value)).toBeLessThan(5 * 60 * 1000)

  await context.close()
})

test('a session past its absolute cap is signed out however recently it was used', async ({
  browser,
  baseURL,
}) => {
  // last_seen stays current: only the start timestamp is aged, so this can
  // only be the cap firing, not the idle window.
  const state = backdate(await signedInState(browser, baseURL), 'merqo_sess_start', 31 * DAY_MS)
  const context = await browser.newContext({ baseURL, storageState: state })
  const page = await context.newPage()

  await page.goto('/dashboard')

  await expect(page).toHaveURL(/\/sign-in\?reason=timeout/)

  await context.close()
})

test('an expired session cannot be laundered through an authenticated API route', async ({
  browser,
  baseURL,
}) => {
  const fixture = await readE2EFixture()
  const url = `/api/pos/products/search?businessUnitId=${fixture.businessUnitId}&q=${encodeURIComponent(
    fixture.searchProductName,
  )}`

  const live = await signedInState(browser, baseURL)

  // Baseline: the route answers a live session.
  const liveContext = await browser.newContext({ baseURL, storageState: live })
  const livePage = await liveContext.newPage()
  expect((await livePage.goto(url))?.status()).toBe(200)
  await liveContext.close()

  // proxy.ts's isPublicPath() returns true for everything under /api/, which is
  // why the timeout check is deliberately NOT gated on it — otherwise this call
  // would keep working forever, and polling it would keep a dead session warm.
  const expiredContext = await browser.newContext({
    baseURL,
    storageState: backdate(live, 'merqo_last_seen', 25 * HOUR_MS),
  })
  const expiredPage = await expiredContext.newPage()

  const expired = await expiredPage.goto(url)
  expect(expired?.status()).toBe(401)
  // JSON, not a 302 to an HTML sign-in page a fetch() caller cannot use.
  expect(expired?.headers()['content-type']).toContain('application/json')

  await expiredContext.close()
})
