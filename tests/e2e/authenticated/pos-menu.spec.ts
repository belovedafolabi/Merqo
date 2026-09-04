import { expect, test } from '@playwright/test'

import { readE2EFixture } from '../helpers/fixture'

/**
 * Milestone 17 Part D. The POS header's menu button was dead markup — no
 * onClick, no drawer. It now opens a right-side sheet that is, on a phone, the
 * only route to Returns and the customer display (the compact header drops
 * both below `sm`), and at any width the POS shell's first sign-out control.
 *
 * Pinned to one phone project: the sheet's phone-only section is the point,
 * and on desktop those actions already sit in the header.
 */

test.beforeEach(() => {
  test.skip(
    test.info().project.name !== 'phone-auth',
    'The sheet phone-section only matters below sm; one project keeps the sign-out test from re-signing-in on every viewport.',
  )
})

test('the menu button opens the sheet with the phone-hidden actions', async ({ page }) => {
  await page.goto('/pos')
  await expect(page).toHaveURL(/\/pos$/)

  const menu = page.getByRole('button', { name: 'Menu' })
  await expect(menu).toBeVisible()
  // Radix Dialog.Trigger reflects state here; once open, the trigger is inert
  // behind the dialog and drops out of the a11y tree, so the open state is
  // asserted via the dialog itself.
  await expect(menu).toHaveAttribute('aria-expanded', 'false')

  await menu.click()

  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()

  // Actions the compact header hides below `sm`.
  await expect(sheet.getByRole('link', { name: 'Returns' })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Open customer display' })).toBeVisible()
  // Always-present ones.
  await expect(sheet.getByRole('link', { name: /Back to Admin dashboard/i })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Sign out' })).toBeVisible()
})

test('Returns in the sheet navigates to the POS returns screen', async ({ page }) => {
  await page.goto('/pos')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('dialog').getByRole('link', { name: 'Returns' }).click()
  await expect(page).toHaveURL(/\/pos\/returns$/)
})

test('Sign out from the sheet ends the session', async ({ browser, baseURL }) => {
  // A fresh context: signOut() revokes the session globally, which would
  // poison the shared storageState for every other phone-project spec.
  const fixture = await readE2EFixture()
  const context = await browser.newContext({ baseURL, storageState: undefined })
  try {
    const page = await context.newPage()
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(fixture.email)
    await page.getByLabel('Password').fill(fixture.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/dashboard', { timeout: 30_000 })

    await page.goto('/pos')
    await page.getByRole('button', { name: 'Menu' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/sign-in/)
  } finally {
    await context.close()
  }
})
