import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'

/**
 * Milestone 15's cross-milestone journey suite, part 1: a genuinely fresh
 * account walking the onboarding wizard end to end.
 *
 * This is the ONE leg the seeded fixture cannot cover by construction —
 * seedE2EFixture() bootstraps its organizations directly through
 * create_organization_with_owner() and the branch/unit/config inserts, so
 * the wizard UI itself (Milestone 05) is never exercised by the other
 * specs. Here it is, from `/sign-up` through to a usable dashboard.
 *
 * Sheds the stored Owner session entirely — this account must not exist
 * before the test starts.
 */
test.use({ storageState: { cookies: [], origins: [] } })

test.describe.configure({ mode: 'serial' })

// Every step is a Server Action round trip against Supabase; on a loaded CI
// runner or local machine each can take several seconds. Assertions that
// wait on a step transition use this explicitly rather than the 5s default.
const STEP_TIMEOUT = 30_000

test('a new account can sign up and complete onboarding to a working dashboard', async ({
  page,
}) => {
  test.setTimeout(150_000)

  const runId = randomUUID()
  const email = `e2e-onboarding-${runId}@example.com`
  const password = `E2E-${runId}`

  // --- Sign up -----------------------------------------------------------
  await page.goto('/sign-up')
  await page.getByLabel('Organization name').fill(`Onboarding Co ${runId.slice(0, 8)}`)
  await page.getByLabel('Your full name').fill('Onboarding Tester')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()

  // Local config disables email confirmation, so signUp() returns a session
  // and create_organization_with_owner() runs inline — but the branch,
  // business unit, POS config and onboarding_completed_at do not exist yet,
  // so (app)/layout.tsx bounces straight to the wizard.
  await page.waitForURL('**/onboarding', { timeout: STEP_TIMEOUT })

  // --- Step 1: Branch --------------------------------------------------
  await expect(page.getByRole('heading', { name: 'Create your first branch' })).toBeVisible({
    timeout: STEP_TIMEOUT,
  })
  await page.getByLabel('Branch name').fill('Head Office')
  await page.getByRole('button', { name: 'Continue' }).click()

  // --- Step 2: Business unit -----------------------------------------
  await expect(page.getByRole('heading', { name: 'Set up your business unit' })).toBeVisible({
    timeout: STEP_TIMEOUT,
  })
  // The picker is a Radix RadioGroup of labelled cards, not a combobox.
  await page.getByRole('radio', { name: /supermarket/i }).click()
  await page.getByLabel('Business unit name').fill('Front Store')
  await page.getByRole('button', { name: 'Continue' }).click()

  // --- Step 3: Configure POS --------------------------------------
  await expect(page.getByRole('heading', { name: 'Configure your business unit' })).toBeVisible({
    timeout: STEP_TIMEOUT,
  })
  // The defaults the business type pre-filled are acceptable as-is; the
  // point of this leg is that the wizard advances, not that every field is
  // re-typed.
  await page.getByRole('button', { name: 'Continue' }).click()

  // --- Step 4: Finish ---------------------------------------------
  await expect(page.getByRole('heading', { name: "You're all set" })).toBeVisible({
    timeout: STEP_TIMEOUT,
  })
  await page.getByRole('button', { name: 'Start adding products' }).click()

  // Onboarding complete → the real dashboard, no longer the wizard. Landing
  // here rather than bouncing back to /onboarding is itself the proof that
  // onboarding produced a usable state (the (app) layout redirects to the
  // wizard whenever onboarding_completed_at is null), so the dashboard
  // heading is a sufficient, viewport-independent assertion — the branch
  // name lives in the sidebar, which is collapsed on a phone.
  await page.waitForURL('**/dashboard', { timeout: STEP_TIMEOUT })
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})
