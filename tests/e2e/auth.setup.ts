import { expect, test as setup } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

import { AUTH_DIR, FIXTURE_FILE, STORAGE_STATE } from './helpers/fixture'
import { seedE2EFixture } from './helpers/seed'

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
 */

setup('seed an organization and sign in', async ({ page }) => {
  // Playwright's 30s default is a per-assertion budget, and this step is not
  // an assertion — it is a signup, an org bootstrap, ~24 product inserts,
  // the matching stock movements, and a full sign-in navigation, against a
  // local Supabase that may be sharing a machine with a Next.js production
  // build. Timing out here fails the entire authenticated suite, so the
  // budget is generous on purpose.
  setup.setTimeout(180_000)

  const fixture = await seedE2EFixture()

  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(fixture.email)
  await page.getByLabel('Password').fill(fixture.password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await page.waitForURL('**/dashboard', { timeout: 30_000 })
  await expect(page).toHaveURL(/\/dashboard/)

  await mkdir(AUTH_DIR, { recursive: true })
  await page.context().storageState({ path: STORAGE_STATE })

  // A file, not process.env: Playwright runs each project's specs in
  // separate worker processes, which never see env vars set here.
  await writeFile(FIXTURE_FILE, JSON.stringify(fixture, null, 2), 'utf8')
})
