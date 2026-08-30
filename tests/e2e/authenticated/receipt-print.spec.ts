import { expect, test } from '@playwright/test'

/**
 * Milestone 14, Acceptance Criterion 2: "Receipts print correctly formatted
 * via the browser print flow."
 *
 * emulateMedia({ media: 'print' }) makes the browser apply the @media print
 * cascade for real, so this asserts against the actual print rendering rather
 * than the screen one. What it cannot see is the physical @page size — no
 * browser exposes that to script — so the paper-width plumbing is asserted in
 * tests/unit/receipts/receipt-print.test.tsx, and the Definition of Done's
 * real-printer session remains the only thing that proves the last mile.
 * That gap is recorded in the milestone doc rather than papered over.
 */

test.describe('receipt print view', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ media: 'print' })
  })

  for (const paper of [58, 80] as const) {
    test(`the sample receipt fits ${paper}mm paper without clipping`, async ({ page }) => {
      // No ?saleId= — the sample receipt needs only organizations.update,
      // which the seeded owner has, and it keeps this spec independent of
      // whether a sale happens to have been rung up first.
      await page.goto(`/receipts/preview?paper=${paper}`)

      await expect(page.getByText(/total/i).first()).toBeVisible()

      // The failure this guards: a receipt wider than its own container
      // silently clips its right-hand column — the prices — on a thermal roll.
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflows).toBe(false)
    })
  }

  test('the toaster never prints over a receipt', async ({ page }) => {
    await page.goto('/receipts/preview')

    // app/layout.tsx portals Sonner's toaster to <body>, so it is present on
    // every route including this one; app/globals.css hides it under print.
    const toaster = page.locator('[data-sonner-toaster]')
    if ((await toaster.count()) > 0) {
      await expect(toaster.first()).toBeHidden()
    }
  })
})
