import { expect, test } from '@playwright/test'

import { readE2EFixture } from '../helpers/fixture'

/**
 * Milestone 14, Acceptance Criterion 1: "Barcode scans reliably add the
 * correct product without misfiring on normal typing."
 *
 * Both halves are asserted, and neither needs hardware — a keyboard-emulating
 * scanner IS a keyboard, so page.keyboard.type() with a small delay is not a
 * simulation of a scan, it is the same event stream a real scanner produces.
 * The `delay` is the entire difference between the two cases.
 */

const SCANNER_DELAY_MS = 10
const HUMAN_DELAY_MS = 200

test.beforeEach(async ({ page }) => {
  await page.goto('/pos')
  await expect(page).toHaveURL(/\/pos$/)
})

/**
 * Moves focus off the search box, so the document-level hook is what has to
 * catch the burst. This is the whole point of the feature: mid-shift, focus
 * sits wherever the cashier last tapped.
 *
 * A real click, not an evaluate()+blur(): ProductGrid focuses the search box
 * itself on mount (on a pointer-fine device — see focusSearchIfKeyboardDevice
 * in product-grid.tsx), and blurring via page.evaluate() can lose that race
 * if it runs before that effect has committed, since nothing then re-blurs
 * it. Clicking a real, stable, non-focusable element is immune to the race
 * and matches how a cashier would actually move focus away.
 *
 * Clicks a fixed point in <header>, not a named element inside it — the
 * "Cart" heading only exists in the accessibility tree once CartPanel is
 * visible (desktop/tablet) or the mobile drawer has been opened, so it isn't
 * present at all on the phone project in its default state. The header
 * itself is the one region every viewport renders unconditionally, and the
 * offset is chosen to land clear of any button in it.
 */
async function blurSearch(page: import('@playwright/test').Page) {
  const search = page.getByRole('textbox', { name: 'Search products or scan a barcode' })
  await page.locator('header').click({ position: { x: 12, y: 12 } })
  await expect(search).not.toBeFocused()
}

/**
 * Reveals the cart, matching pos-checkout.spec.ts's openCart(): below `lg`
 * the line items live behind MobileCartBar's drawer (and, confirmed by
 * inspection, that drawer's content is lazy-mounted — it does not exist in
 * the DOM at all until first opened, not merely hidden), so a scanned
 * product's NAME is correctly invisible everywhere on a phone until the
 * cashier opens the cart. The mobile bar's own live item-count/total is the
 * visible confirmation at that viewport; the name is a drawer-only detail by
 * design, not a bug this spec should flag.
 */
async function openCart(page: import('@playwright/test').Page) {
  const drawerTrigger = page.getByRole('button', { name: /view cart/i })
  if (await drawerTrigger.isVisible().catch(() => false)) {
    await drawerTrigger.click()
  }
}

test('a fast burst with nothing focused adds the scanned product', async ({ page }) => {
  const fixture = await readE2EFixture()
  await blurSearch(page)

  await page.keyboard.type(fixture.barcode, { delay: SCANNER_DELAY_MS })
  await page.keyboard.press('Enter')

  await openCart(page)

  // .and(':visible') as defense in depth: CartLines is mounted in both
  // CartPanel and MobileCartBar's drawer, and only one copy is ever the one
  // actually on screen — DOM order between the two does not reliably put the
  // visible copy first.
  await expect(
    page.getByText(fixture.barcodeProductName).and(page.locator(':visible')),
  ).toBeVisible()
})

test('the same characters typed at human speed do not add anything', async ({ page }) => {
  const fixture = await readE2EFixture()
  await blurSearch(page)

  await page.keyboard.type(fixture.barcode, { delay: HUMAN_DELAY_MS })
  await page.keyboard.press('Enter')

  // The control case for "does not misfire on normal typing". Nothing may
  // reach the cart — the product name must not appear anywhere on the page.
  await expect(page.getByText(fixture.barcodeProductName)).toHaveCount(0)
})

test('a scan that matches nothing says so instead of failing silently', async ({ page }) => {
  await blurSearch(page)

  await page.keyboard.type('0000000000000', { delay: SCANNER_DELAY_MS })
  await page.keyboard.press('Enter')

  await expect(page.getByText(/No product matches barcode/i)).toBeVisible()
})
