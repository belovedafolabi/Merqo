import { expect, test, type Page } from '@playwright/test'

import { readE2EFixture } from '../helpers/fixture'

/**
 * Milestone 14, Acceptance Criterion 4: "The POS checkout flow is fully
 * usable on tablet and phone viewport sizes (automated responsive tests
 * pass)."
 *
 * This spec runs unchanged under all three projects in playwright.config.ts —
 * desktop, tablet (1024x768) and phone (Pixel 7) — which is what makes it
 * responsive coverage rather than three copies of a desktop test. The two
 * viewport-dependent behaviours are handled by openCart() below; everything
 * else must work identically or the layout is broken.
 *
 * It also carries the client-side half of the performance bar. The server-side
 * half lives in tests/integration/pos-search-performance.test.ts.
 */

/** Generous: covers the 250ms search debounce plus a cold Server Action on a CI runner. */
const SEARCH_RENDER_BUDGET_MS = 3_000

/**
 * Reveals the cart. Below `lg` it lives behind MobileCartBar's drawer; at and
 * above `lg` CartPanel is already on screen. This is the ONE branch the spec
 * allows itself — everything after it is asserted identically at every width.
 */
async function openCart(page: Page) {
  const drawerTrigger = page.getByRole('button', { name: /view cart/i })
  if (await drawerTrigger.isVisible().catch(() => false)) {
    await drawerTrigger.click()
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)
}

test('a cashier can search, add to cart and complete a sale at this viewport', async ({ page }) => {
  const fixture = await readE2EFixture()

  await page.goto('/pos')
  await expect(page).toHaveURL(/\/pos$/)
  await expectNoHorizontalOverflow(page)

  // Search latency tripwire — docs/PRD.md §42 lists product search among the
  // priority interactions. Measured from keystroke to the tile being visible.
  const search = page.getByRole('textbox', { name: 'Search products or scan a barcode' })
  const startedAt = Date.now()
  await search.fill(fixture.searchProductName)
  const tile = page.getByRole('button', { name: new RegExp(fixture.searchProductName, 'i') })
  await expect(tile).toBeVisible({ timeout: SEARCH_RENDER_BUDGET_MS })
  expect(Date.now() - startedAt).toBeLessThan(SEARCH_RENDER_BUDGET_MS)

  await tile.click()

  await openCart(page)

  const checkoutButton = page.getByRole('button', { name: /^checkout/i })
  await expect(checkoutButton).toBeVisible()
  await checkoutButton.click()

  // The acceptance criterion is about REACHABILITY, not just presence: a
  // button that exists but sits below the fold behind the on-screen keyboard
  // is the failure this is written to catch. toBeInViewport is the assertion
  // that distinguishes them.
  const submit = page.getByRole('button', { name: /complete sale/i })
  await expect(submit).toBeVisible()
  await expect(submit).toBeInViewport()
  await expect(submit).toBeEnabled()
  await expectNoHorizontalOverflow(page)

  await submit.click()

  await expect(page.getByText('Sale complete')).toBeVisible({ timeout: 20_000 })

  // Milestone 14's printing deliverable reaching the UI: before this
  // milestone the success state offered only "Done".
  await expect(page.getByRole('button', { name: /print receipt/i })).toBeVisible()

  // The receipt is rendered in the drawer, not fetched by a popup on click.
  // .and(':visible') because ReceiptView also renders a second, print-only
  // copy portalled to <body> — the same double-mount idiom CartLines needs.
  await expect(page.getByText(/Receipt #/).and(page.locator(':visible'))).toBeVisible()

  // --- printing is isolated to the receipt -----------------------------
  //
  // Asserts the @media print cascade rather than calling window.print(),
  // which would block on a native dialog. Printing used to open
  // /receipts/preview in a popup — a whole second document load through the
  // (app) layout — so the printed page was trivially just the receipt. Now
  // the entire POS is still in the document when the dialog opens, and
  // app/globals.css is what narrows the printout. This is the assertion that
  // catches that CSS regressing into "print the whole till".
  await page.evaluate(() => document.body.classList.add('printing-receipt'))
  await page.emulateMedia({ media: 'print' })

  const printedReceipt = page.locator('.receipt-print-portal')
  await expect(printedReceipt).toBeVisible()
  await expect(printedReceipt.getByText(/Receipt #/)).toBeVisible()
  // The cart panel / drawer is chrome, and must not reach the paper.
  await expect(page.getByRole('button', { name: /^checkout/i })).toBeHidden()
  await expect(page.getByRole('button', { name: /print receipt/i })).toBeHidden()

  await page.emulateMedia({ media: 'screen' })
  await page.evaluate(() => document.body.classList.remove('printing-receipt'))

  // --- the sale is in the record BEFORE Print or Done is touched -------
  //
  // checkoutAction() commits through create_sale() when the form submits, so
  // neither footer button is what "processes" the order. Proving that here is
  // what distinguishes a genuinely recorded sale from one that only looks
  // complete on screen.
  await page.goto('/sales')
  await expect(page.getByRole('button', { name: /^view/i }).first()).toBeVisible()
})

test('the cart is reachable and readable at this viewport', async ({ page }) => {
  const fixture = await readE2EFixture()

  await page.goto('/pos')
  const search = page.getByRole('textbox', { name: 'Search products or scan a barcode' })
  await search.fill(fixture.barcodeProductName)
  await page.getByRole('button', { name: new RegExp(fixture.barcodeProductName, 'i') }).click()

  await openCart(page)

  // .and(':visible'), not .first(): CartLines is mounted twice at once (once
  // inside the desktop CartPanel, once inside MobileCartBar's Drawer), and
  // only one copy is the one actually on screen — DOM order between the two
  // does not reliably put the visible copy first.
  const visibleName = page.getByText(fixture.barcodeProductName).and(page.locator(':visible'))
  await expect(visibleName).toBeVisible()

  // The quantity stepper is the tightest touch target on the screen and the
  // one Milestone 14 resized to 44px below `lg`. Assert it is operable, not
  // merely present.
  const increase = page
    .getByRole('button', { name: /increase quantity/i })
    .and(page.locator(':visible'))
  await expect(increase).toBeVisible()
  await increase.click()

  // The quantity is now a field rather than a read-only <span>, so this reads
  // its VALUE. Deliberately not getByText('2'): that also matched a "2"
  // anywhere else on the till, and it silently stopped matching at all once
  // the span became an <input>.
  const quantity = page
    .getByRole('textbox', { name: /^quantity of /i })
    .and(page.locator(':visible'))
  await expect(quantity).toHaveValue('2')

  // Typing a quantity is the point of the field — tapping + eleven times is
  // what it replaces — so exercise that path, not only the stepper.
  await quantity.fill('12')
  await expect(quantity).toHaveValue('12')

  await expectNoHorizontalOverflow(page)
})
