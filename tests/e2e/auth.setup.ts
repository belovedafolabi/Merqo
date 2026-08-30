import { expect, test as setup } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

import { AUTH_DIR, FIXTURE_FILE, LIMITED_STORAGE_STATE, STORAGE_STATE } from './helpers/fixture'
import { seedE2EFixture, type E2EFixture } from './helpers/seed'

/**
 * The dependency every project under tests/e2e/authenticated/ waits on
 * (see playwright.config.ts): seed one disposable organization, sign into it
 * through the real form, and leave behind the two files the specs read.
 *
 * A setup PROJECT, not globalSetup. globalSetup has no ordering guarantee
 * against `webServer` — it can start before the Next.js server is listening,
 * and this step must drive a real sign-in against that server to get
 * @supabase/ssr's chunked auth cookies written correctly. As an ordinary
 * test file it runs only once the server is healthy, gets baseURL/tracing/
 * reporting for free, and a failure here shows up in the HTML report instead
 * of as an opaque process crash.
 *
 * Signing in through the form rather than injecting cookies is deliberate
 * for the same reason: @supabase/ssr splits a session across several
 * numbered cookies whose exact names and chunking are its own private
 * concern, and hand-rolling them would break silently on any upgrade.
 *
 * Milestone 15 adds a SECOND sign-in — the limited Cashier user — done in
 * the same test via a second browser context rather than a second `setup`
 * test. `fullyParallel` is on globally, so two setup tests in one file would
 * have no ordering guarantee and could race on the shared seed; one test
 * with two contexts sidesteps that with no `serial` annotation needed.
 */

async function signInAndSaveState(
  browser: import('@playwright/test').Browser,
  baseURL: string | undefined,
  credentials: { email: string; password: string },
  storageStatePath: string,
): Promise<void> {
  const context = await browser.newContext({ baseURL })
  try {
    const page = await context.newPage()
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(credentials.email)
    await page.getByLabel('Password').fill(credentials.password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await page.waitForURL('**/dashboard', { timeout: 30_000 })
    await expect(page).toHaveURL(/\/dashboard/)

    await context.storageState({ path: storageStatePath })
  } finally {
    await context.close()
  }
}

setup('seed an organization and sign in', async ({ browser, baseURL }) => {
  // Playwright's 30s default is a per-assertion budget, and this step is not
  // an assertion — it is two org bootstraps, ~25 product inserts, the
  // matching stock movements, a role grant, and two full sign-in
  // navigations, against a local Supabase that may be sharing a machine with
  // a Next.js production build. Timing out here fails the entire
  // authenticated suite, so the budget is generous on purpose. Raised from
  // 180s for Milestone 15's second organization and second sign-in.
  setup.setTimeout(240_000)

  const fixture: E2EFixture = await seedE2EFixture()

  await mkdir(AUTH_DIR, { recursive: true })

  // Owner session — the one Milestone 14's five specs already use.
  await signInAndSaveState(
    browser,
    baseURL,
    { email: fixture.email, password: fixture.password },
    STORAGE_STATE,
  )

  // Cashier session — used only by tests/e2e/authenticated/limited/.
  await signInAndSaveState(browser, baseURL, fixture.limited, LIMITED_STORAGE_STATE)

  // A file, not process.env: Playwright runs each project's specs in
  // separate worker processes, which never see env vars set here.
  await writeFile(FIXTURE_FILE, JSON.stringify(fixture, null, 2), 'utf8')
})
