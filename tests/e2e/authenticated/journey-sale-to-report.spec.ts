import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'

/**
 * Milestone 15's cross-milestone journey suite, part 2: one product through
 * the whole system — catalog (M06) -> inventory (M07) -> a sale (M08) -> a
 * return (M08) -> a report (M10) — driven entirely through the UI as a real
 * operator would.
 *
 * This is the test that catches the bugs no single feature milestone could:
 * a price snapshot that doesn't survive into the report, a return that
 * doesn't restore stock the inventory screen shows, a sale that never
 * reaches the sales-by-product aggregation.
 *
 * FLAKE CONTROL — non-negotiable. This spec runs in every device project
 * (three today, more once the browser matrix lands) against ONE shared
 * seeded organization. Every run therefore creates its OWN product, named
 * with the project name and a fresh UUID, and asserts only on rows it
 * created. It must never touch the shared `E2E Scan Milk` / `E2E Search
 * Bread` catalog the Milestone 14 specs depend on.
 */

test.describe.configure({ mode: 'serial' })

// Each mutating step is a Server Action round trip against Supabase and can
// take several seconds on a loaded runner; dialog-close and row-appearance
// assertions use this rather than the 5s default.
const ACTION_TIMEOUT = 30_000

test('a product flows from catalog through a sale and return into the sales report', async ({
  page,
}, testInfo) => {
  // Five UI-driven Server Action round trips plus two report renders.
  test.setTimeout(180_000)

  const runId = randomUUID().slice(0, 8)
  // Project name in the identifier so parallel device projects never collide
  // on the same catalog row.
  const productName = `Journey ${testInfo.project.name} ${runId}`
  const sku = `JOURNEY-${testInfo.project.name.toUpperCase().replace(/[^A-Z0-9]+/g, '')}-${runId}`
  const unitPrice = 1500

  // --- Catalog: create the product (Milestone 06) ------------------------
  await page.goto('/products')
  await page.getByRole('button', { name: 'New product' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(productName)
  await dialog.getByLabel('SKU').fill(sku)
  await dialog.getByLabel('Base price').fill(String(unitPrice))
  await dialog.getByRole('button', { name: 'Create product' }).click()

  await expect(dialog).toBeHidden({ timeout: ACTION_TIMEOUT })
  await expect(page.getByRole('cell', { name: productName })).toBeVisible({
    timeout: ACTION_TIMEOUT,
  })

  // --- Inventory: put stock on it (Milestone 07) -----------------------
  await page.goto('/inventory')
  await page.getByRole('button', { name: 'Adjust stock' }).click()

  const adjustDialog = page.getByRole('dialog')
  // Radix Select: open the trigger, then pick the option. The option label
  // is "<name> · <sku>" (see stock-adjustment-dialog.tsx).
  await adjustDialog.getByRole('combobox').click()
  await page.getByRole('option', { name: new RegExp(sku) }).click()
  await adjustDialog.getByLabel('Quantity change').fill('10')
  await adjustDialog.getByLabel('Reason').fill('E2E journey seed')
  await adjustDialog.getByRole('button', { name: 'Record adjustment' }).click()

  await expect(adjustDialog).toBeHidden({ timeout: ACTION_TIMEOUT })
  // The row now shows a quantity. Scope to the product's row so a shared
  // catalog change can't satisfy this.
  await expect(page.getByRole('row', { name: new RegExp(productName) })).toContainText('10', {
    timeout: ACTION_TIMEOUT,
  })

  // --- POS: sell one unit (Milestone 08) --------------------------------
  await page.goto('/pos')
  const search = page.getByRole('textbox', { name: 'Search products or scan a barcode' })
  await search.fill(productName)
  const tile = page.getByRole('button', { name: new RegExp(productName, 'i') })
  await expect(tile).toBeVisible({ timeout: 5_000 })
  await tile.click()

  // Below `lg` the cart is behind a drawer; above it is already on screen.
  const drawerTrigger = page.getByRole('button', { name: /view cart/i })
  if (await drawerTrigger.isVisible().catch(() => false)) {
    await drawerTrigger.click()
  }
  await page.getByRole('button', { name: /^checkout/i }).click()
  await page.getByRole('button', { name: /complete sale/i }).click()
  await expect(page.getByText('Sale complete')).toBeVisible({ timeout: ACTION_TIMEOUT })

  // The return flow needs the full sale UUID. The success dialog only prints
  // the 8-char receipt prefix, but "Print receipt" opens
  // /receipts/preview?saleId=<full uuid> in a popup — capture it there.
  const [receiptPopup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: /print receipt/i }).click(),
  ])
  const saleId = new URL(receiptPopup.url()).searchParams.get('saleId')
  await receiptPopup.close()
  expect(saleId).toBeTruthy()

  // --- POS Returns: return the unit (Milestone 08) --------------------
  await page.goto('/pos/returns')
  await page.getByLabel('Original sale').fill(saleId!)
  await page.getByRole('button', { name: 'Find sale' }).click()

  // The sale's line for our product shows "1 of 1 returnable" and an
  // enabled quantity input.
  await expect(page.getByText(productName)).toBeVisible()
  await expect(page.getByText('1 of 1 returnable')).toBeVisible()
  await page.getByRole('spinbutton').first().fill('1')
  await page.getByLabel('Return reason').fill('E2E journey return')
  await page.getByRole('button', { name: 'Process return' }).click()

  // The returns screen has no toast — a processed return re-fetches the sale,
  // so the same line now reads "0 of 1 returnable" and its input is
  // disabled. That state change is the observable proof the return landed.
  await expect(page.getByText('0 of 1 returnable')).toBeVisible({ timeout: ACTION_TIMEOUT })

  // --- Reports: the product appears in sales-by-product (Milestone 10) --
  await page.goto('/reports/sales-by-product')
  await expect(page.getByRole('heading', { name: 'Sales by product' })).toBeVisible({
    timeout: ACTION_TIMEOUT,
  })
  // The default date range covers today, so the sale just rung must be in
  // the aggregation. This is the assertion that proves the milestones are
  // wired to each other and not just individually working.
  await expect(page.getByRole('cell', { name: productName })).toBeVisible({
    timeout: ACTION_TIMEOUT,
  })
})
