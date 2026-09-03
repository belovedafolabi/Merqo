import { expect, test } from '@playwright/test'

import { readE2EFixture } from '../helpers/fixture'

/**
 * PR 3 of the reported-issues batch: the dashboard shows real figures
 * (#14), "Add widget" opens a drawer (#15), the bell opens a drawer instead
 * of navigating (#12), and the sales list has working filters (#13).
 *
 * These deliberately avoid asserting on the "Sales overview" chart's own
 * contents: whether it draws bars or its own "no sales in this period" empty
 * state depends on how many sales the surrounding specs happened to ring up
 * in the last 14 days, which is not this suite's concern.
 *
 * NOTE on the `getByRole('main')` scoping below. These routes have a
 * `loading.tsx`, so their content is inside a Suspense boundary and React
 * streams it in out of order: for ~100ms during hydration a copy of the page
 * also exists in React's `<div hidden id="S:n">` streaming buffer parked at
 * the end of <body> (the window is widest on the phone viewport, where
 * useIsMobile()'s post-hydration re-render of the shell delays the buffer's
 * promotion). It is inert, hidden, removed almost immediately, and there is
 * only ever one real <main> — but an unscoped getByText briefly matches both
 * copies and trips strict mode. Scoping to `main` sidesteps it because the
 * buffer copy is not inside <main>.
 */

test('the dashboard shows real sales figures, not the milestone placeholder', async ({ page }) => {
  await page.goto('/dashboard')
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 90_000 })

  // #10 / #14: the old placeholder copy is gone.
  await expect(page.getByText(/Milestone 08/i)).toHaveCount(0)
  await expect(page.getByText(/POS Transaction Engine/i)).toHaveCount(0)
  await expect(page.getByText(/starts recording sales/i)).toHaveCount(0)

  // #14: the summary widget (on by default) is wired up — its three cards
  // render where the static "₦0" placeholders used to be. The figures
  // themselves depend on file ordering (this spec may run before any sale is
  // rung up), so this checks the widget is present, not a value.
  await expect(main.getByText('Sales today')).toBeVisible()
  await expect(main.getByText('Transactions')).toBeVisible()
  await expect(main.getByText('Average sale')).toBeVisible()
})

test('the Add widget button opens a bottom drawer of widget toggles', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 90_000 })

  // #15: the button — decorative since Milestone 04 — now opens a drawer.
  await page.getByRole('button', { name: 'Add widget' }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByText('Dashboard widgets')).toBeVisible()

  // The drawer lists the widgets as switches. Toggling one flips it
  // optimistically and the Server Action behind it resolves without error
  // (an error reverts the switch and raises a toast). State-agnostic about
  // the starting position and restored to it, so the shared seed dashboard
  // is left exactly as found.
  const recentSales = drawer.getByRole('switch', { name: /Recent sales/i })
  await expect(recentSales).toBeVisible()
  const wasChecked = await recentSales.isChecked()

  // Flip it: the switch updates optimistically and stays flipped once the
  // Server Action resolves — a failure would revert it inside the poll.
  await recentSales.click()
  await expect(recentSales).toBeChecked({ checked: !wasChecked })

  // Flip it back, so the shared seed dashboard is left exactly as found.
  await recentSales.click()
  await expect(recentSales).toBeChecked({ checked: wasChecked })
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(drawer).toBeHidden()
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

  // Scoped to `main` throughout — see the file header note on the streaming
  // buffer that otherwise makes an unscoped locator match twice at mobile
  // widths.
  const main = page.getByRole('main')
  await page.goto('/sales')
  await expect(main.getByRole('heading', { name: 'Sales' })).toBeVisible({ timeout: 90_000 })
  const anyReceiptButton = main.getByRole('button', { name: /^view receipt/i }).first()
  await expect(anyReceiptButton).toBeVisible()

  const filteredEmpty = main.getByText(/No sales match these filters/i)

  // A future-dated `from` (driven through the URL, the source of truth for
  // this screen's filter) leaves nothing in range — the filtered empty
  // state, distinct from the "No sales yet" one.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  await page.goto(`/sales?from=${tomorrow}`)
  await expect(filteredEmpty).toBeVisible({ timeout: 30_000 })
  await expect(main.getByLabel('From', { exact: true })).toHaveValue(tomorrow)

  // The payment-method filter uses the same `method` param; `card` excludes
  // the cash sale just rung up. The filter bar reflects the active param and
  // the Clear control appears.
  await page.goto('/sales?method=card')
  await expect(filteredEmpty).toBeVisible({ timeout: 30_000 })
  await expect(main.getByRole('button', { name: /clear/i })).toBeVisible()

  // Clearing returns to an unfiltered list with the sale back.
  await main.getByRole('button', { name: /clear/i }).click()
  await expect(page).not.toHaveURL(/method=/, { timeout: 60_000 })
  await expect(anyReceiptButton).toBeVisible({ timeout: 30_000 })
})
