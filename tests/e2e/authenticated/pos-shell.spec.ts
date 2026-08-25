import { expect, test } from '@playwright/test'

import { readE2EFixture } from '../helpers/fixture'

/**
 * The smoke test for the whole authenticated harness: if this passes, the
 * seeding, the sign-in, the storageState, and all three viewport projects
 * are wired correctly. Milestone 14's substantive checkout/scanner/display
 * specs build on exactly this foundation.
 */
test('a signed-in cashier reaches the till and can search the seeded catalog', async ({ page }) => {
  const fixture = await readE2EFixture()

  await page.goto('/pos')

  // Proves the layout's onboarding gate passed — an incompletely seeded org
  // silently redirects to /onboarding instead of failing loudly.
  await expect(page).toHaveURL(/\/pos$/)

  const search = page.getByRole('textbox', { name: 'Search products or scan a barcode' })
  await expect(search).toBeVisible()

  await search.fill(fixture.searchProductName)
  await expect(page.getByText(fixture.searchProductName).first()).toBeVisible()

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(hasHorizontalOverflow).toBe(false)
})
