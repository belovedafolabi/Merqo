import { expect, test } from '@playwright/test'

import { readE2EFixture } from '../helpers/fixture'

/**
 * Milestone 14, Acceptance Criterion 3: "The customer-facing display shows
 * only appropriate cart/total information, live."
 *
 * Both clauses are covered — the live mirroring, and the "only appropriate"
 * half, which is the milestone's Security Requirement ("it must not, for
 * example, allow completing a sale or reveal any authenticated-user data").
 *
 * The second page is opened in the SAME browser context on purpose: same
 * cookies (so /display authenticates without any public-route exemption) and
 * same origin (so BroadcastChannel reaches it). That is exactly the
 * arrangement a real till has — a second window on the counter's
 * customer-facing monitor.
 */

/**
 * Every interactive element the APPLICATION renders.
 *
 * The two :not()s exclude the Next.js dev-tools launcher, which `next dev`
 * injects into every page (inside a <nextjs-portal>) and `next build` never
 * emits. Without them this spec passes in CI — which builds for production —
 * and fails against a local dev server, for a button no user will ever see.
 * A test whose answer depends on which server you pointed it at teaches you
 * to ignore it, so the exclusion is narrow and named rather than the budget
 * being loosened to "at most one".
 *
 * The security claim is untouched: anything the app itself renders still
 * counts, and both exclusions key off framework-owned markers no application
 * component sets.
 */
const APP_INTERACTIVE =
  ':is(button, a, input, select, textarea, [role="button"])' +
  ':not([data-nextjs-dev-tools-button]):not(nextjs-portal *)'

test('the display mirrors the cart live and exposes nothing else', async ({ page, context }) => {
  const fixture = await readE2EFixture()

  await page.goto('/pos')
  await expect(page).toHaveURL(/\/pos$/)

  const display = await context.newPage()
  await display.goto('/display')
  await expect(display.getByText('Welcome')).toBeVisible()

  // Ring up an item on the till.
  const search = page.getByRole('textbox', { name: 'Search products or scan a barcode' })
  await search.fill(fixture.searchProductName)
  await page.getByRole('button', { name: new RegExp(fixture.searchProductName, 'i') }).click()

  // …and it appears on the customer's screen without either page reloading.
  await expect(display.getByText(fixture.searchProductName)).toBeVisible()
  // exact: true — otherwise this substring-matches "Subtotal" too and
  // Playwright's strict mode rejects the ambiguity.
  await expect(display.getByText('Total', { exact: true })).toBeVisible()

  // The security assertion. Not "no sale button" — NO interactive element of
  // any kind, which is a claim that cannot rot as the screen gains features.
  await expect(display.locator(APP_INTERACTIVE)).toHaveCount(0)

  // Nothing identifying the cashier, the sale, or the catalog row.
  const body = (await display.locator('body').innerText()).toLowerCase()
  expect(body).not.toContain(fixture.email.toLowerCase())
  expect(body).not.toContain('cashier')
  expect(body).not.toContain('cost')

  await display.close()
})

test('a display opened mid-sale catches up instead of showing an empty cart', async ({
  page,
  context,
}) => {
  const fixture = await readE2EFixture()

  await page.goto('/pos')
  const search = page.getByRole('textbox', { name: 'Search products or scan a barcode' })
  await search.fill(fixture.searchProductName)
  await page.getByRole('button', { name: new RegExp(fixture.searchProductName, 'i') }).click()

  // Opened only AFTER the item was added — BroadcastChannel retains nothing,
  // so this only passes because of the request-snapshot handshake.
  const display = await context.newPage()
  await display.goto('/display')

  await expect(display.getByText(fixture.searchProductName)).toBeVisible()

  await display.close()
})
