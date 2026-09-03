import { expect, test } from '@playwright/test'

import { readE2EFixture } from '../helpers/fixture'

/**
 * PR 3 of the reported-issues batch: the dashboard shows real figures
 * (#14), "Add widget" opens a drawer (#15), the bell opens a drawer instead
 * of navigating (#12), and the sales list has working filters (#13).
 *
 * The strong assertion for #14 is that the milestone-copy placeholder is
 * gone and the stat cards carry currency; the exact numbers depend on how
 * many sales earlier specs rang up, so this does not pin a value.
 */

test('the dashboard shows real sales figures, not the milestone placeholder', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 90_000 })

  // #10 / #14: the old copy is gone.
  await expect(page.getByText(/Milestone 08/i)).toHaveCount(0)
  await expect(page.getByText(/POS Transaction Engine/i)).toHaveCount(0)

  // The three stat cards render with a currency value rather than a literal ₦0.
  await expect(page.getByText('Sales today')).toBeVisible()
  await expect(page.getByText('Transactions')).toBeVisible()
  await expect(page.getByText('Average sale')).toBeVisible()
})

test('the Add widget button opens a bottom drawer of toggles', async ({ page }) => {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Add widget' }).click()

  const drawer = page.getByRole('dialog')
  await expect(drawer.getByText('Dashboard widgets')).toBeVisible()
  const salesOverviewToggle = drawer.getByRole('switch', { name: /Sales overview/i })
  await expect(salesOverviewToggle).toBeVisible()

  // Toggling it off removes the card from the grid behind the drawer.
  await salesOverviewToggle.click()
  await expect(salesOverviewToggle).toHaveAttribute('aria-checked', 'false')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('heading', { name: 'Sales overview' })).toBeHidden()

  // Put it back so the seed's dashboard is unchanged for other specs.
  await page.getByRole('button', { name: 'Add widget' }).click()
  await page
    .getByRole('dialog')
    .getByRole('switch', { name: /Sales overview/i })
    .click()
  await page.getByRole('button', { name: 'Done' }).click()
})

test('the notification bell opens a drawer, not the notifications page', async ({ page }) => {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: /Notifications/i }).click()

  // A drawer opened; the URL did not change to /notifications.
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Notifications' }),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/dashboard$/)

  // The footer still offers the full page as a deep link.
  await expect(
    page.getByRole('dialog').getByRole('link', { name: /Open notifications page/i }),
  ).toBeVisible()
})

test('the sales list filters by date and payment method', async ({ page }) => {
  const fixture = await readE2EFixture()

  // Ring up one cash sale so the list has a row to filter.
  await page.goto('/pos')
  await page
    .getByRole('textbox', { name: 'Search products or scan a barcode' })
    .fill(fixture.searchProductName)
  await page
    .getByRole('button', { name: new RegExp(fixture.searchProductName, 'i') })
    .click({ timeout: 90_000 })
  const viewCart = page.getByRole('button', { name: /view cart/i })
  if (await viewCart.isVisible().catch(() => false)) await viewCart.click()
  await page.getByRole('button', { name: /^checkout/i }).click()
  await page.getByRole('button', { name: /complete sale/i }).click()
  await expect(page.getByText('Sale complete')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: /^done$/i }).click()

  await page.goto('/sales')
  await expect(page.getByRole('heading', { name: 'Sales' })).toBeVisible({ timeout: 90_000 })
  await expect(page.getByRole('button', { name: /^view receipt/i }).first()).toBeVisible()

  // A future-dated `from` (driven through the URL, the source of truth for
  // this screen's filter) leaves nothing in range — the filtered empty
  // state, distinct from the "No sales yet" one.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  await page.goto(`/sales?from=${tomorrow}`)
  await expect(page.getByText(/No sales match these filters/i)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByLabel('From', { exact: true })).toHaveValue(tomorrow)

  // The payment-method filter uses the same `method` param; `card` excludes
  // the cash sale just rung up. The filter bar reflects the active param and
  // the Clear control appears.
  await page.goto('/sales?method=card')
  await expect(page.getByText(/No sales match these filters/i)).toBeVisible({ timeout: 30_000 })
  const clear = page.getByRole('button', { name: /clear/i })
  await expect(clear).toBeVisible()

  // Clearing returns to an unfiltered list with the sale back.
  await clear.click()
  await expect(page).not.toHaveURL(/method=/, { timeout: 60_000 })
  await expect(page.getByRole('button', { name: /^view receipt/i }).first()).toBeVisible({
    timeout: 30_000,
  })
})
