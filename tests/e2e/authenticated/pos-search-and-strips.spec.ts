import { expect, test, type Locator, type Page } from '@playwright/test'

import { readE2EFixture } from '../helpers/fixture'

/**
 * The POS-fast-search batch: search-by-category (#18), the category filter
 * chips, the recently-sold / most-sold strips (#5), opening stock on product
 * create (#6), and the branch address on the printed receipt (#17).
 *
 * Search itself moved off a Server Action onto an abortable GET handler
 * (app/api/pos/products/search); if these searches return anything at all,
 * that path works end to end. pos-shell / pos-checkout / pos-barcode-scan are
 * the regression guard for the plain name search.
 *
 * The generous first-assertion timeouts are for a cold `next dev` compiling
 * the new route on first hit; a production build (what CI runs) has no such
 * pause.
 */

const search = (page: Page) =>
  page.getByRole('textbox', { name: 'Search products or scan a barcode' })

/** The strips duplicate a product NAME in up to three places (both strips +
 *  the cart), so "is it in the cart" scopes to the cart line's own remove
 *  button, which nothing else renders. */
function cartHas(page: Page, name: string): Locator {
  return page.getByRole('button', { name: new RegExp(`Remove ${name} from cart`, 'i') })
}

async function openCart(page: Page): Promise<void> {
  const viewCart = page.getByRole('button', { name: /view cart/i })
  if (await viewCart.isVisible().catch(() => false)) await viewCart.click()
}

async function sellSearchProduct(page: Page, name: string): Promise<void> {
  await page.goto('/pos')
  await search(page).fill(name)
  await page.getByRole('button', { name: new RegExp(name, 'i') }).click({ timeout: 90_000 })
  await openCart(page)
  await page.getByRole('button', { name: /^checkout/i }).click()
  await page.getByRole('button', { name: /complete sale/i }).click()
  await expect(page.getByText('Sale complete')).toBeVisible({ timeout: 20_000 })
}

test.describe('POS search', () => {
  test('finds a product by its category name, and the chips narrow results', async ({ page }) => {
    const fixture = await readE2EFixture()
    await page.goto('/pos')
    await expect(page).toHaveURL(/\/pos$/)

    // #18: the term is a CATEGORY name, not a product name. The old
    // name/sku/barcode `.or()` could not match this.
    await search(page).fill(fixture.searchCategoryName)
    await expect(
      page.getByRole('button', { name: new RegExp(fixture.searchProductName, 'i') }),
    ).toBeVisible({ timeout: 90_000 })

    // A broad term that spans both seeded categories surfaces the filter
    // chips (they only render when results span more than one category).
    await search(page).fill('E2E')
    const bakeryChip = page.getByRole('button', { name: fixture.searchCategoryName, exact: true })
    await expect(bakeryChip).toBeVisible({ timeout: 10_000 })

    await bakeryChip.click()
    await expect(bakeryChip).toHaveAttribute('aria-pressed', 'true')
    // The bakery product stays; the dairy one (E2E Scan Milk) is filtered out.
    await expect(
      page.getByRole('button', { name: new RegExp(fixture.searchProductName, 'i') }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: new RegExp(fixture.barcodeProductName, 'i') }),
    ).toBeHidden()
  })

  test('the recently-sold strip shows a product after it is sold', async ({ page }) => {
    const fixture = await readE2EFixture()

    await sellSearchProduct(page, fixture.searchProductName)
    await page.getByRole('button', { name: /^done$/i }).click()

    // Back at an empty search box, the strips are visible and the just-sold
    // product is in "Recently sold".
    await page.goto('/pos')
    const recent = page.getByRole('region', { name: 'Recently sold' })
    await expect(recent).toBeVisible({ timeout: 15_000 })
    const strippedProduct = recent.getByRole('button', {
      name: new RegExp(fixture.searchProductName, 'i'),
    })
    await expect(strippedProduct).toBeVisible()

    // Tapping a strip tile adds it to the cart, same as a grid tile.
    await strippedProduct.click()
    await openCart(page)
    await expect(cartHas(page, fixture.searchProductName)).toBeVisible()
  })
})

test('a new product can be given opening stock on the create form', async ({ page }) => {
  const productName = `E2E Opening Stock ${Date.now()}`

  await page.goto('/products')
  await page.getByRole('button', { name: 'New product' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(productName)
  await dialog.getByLabel('Base price').fill('500')
  // The field is gated on `inventory.adjust`; the fixture user is an Owner.
  const opening = dialog.getByLabel('Opening stock')
  await expect(opening).toBeVisible()
  await opening.fill('42')
  await dialog.getByRole('button', { name: 'Create product' }).click()
  // Longer than the default 5s: with opening stock the action also resolves
  // the branch and records an inventory movement (+ audit + low-stock check)
  // before it returns and the dialog's effect closes it.
  await expect(dialog).toBeHidden({ timeout: 30_000 })

  // The products list has no stock column — opening stock is a real
  // inventory movement, so it shows on the Inventory screen's Balances tab
  // (its default). Scoped to the product's row so the shared seed catalog
  // can't satisfy this by accident.
  //
  // The Inventory page fires six parallel queries; on a loaded local `next
  // dev` run one can trip the 8s `authenticated` statement_timeout and
  // render the route-error boundary. A fresh navigation re-runs them all, so
  // reload until the row shows rather than flaking. A production build (CI)
  // renders this first try.
  const inventoryRow = page.getByRole('row', { name: new RegExp(productName) })
  await expect(async () => {
    await page.goto('/inventory')
    await expect(inventoryRow).toContainText('42', { timeout: 10_000 })
  }).toPass({ timeout: 90_000 })
})

test('the branch address prints on the receipt', async ({ page }) => {
  const fixture = await readE2EFixture()

  await sellSearchProduct(page, fixture.searchProductName)

  // #17: the seeded branch has its own address_line, which the receipt prints
  // under the business name. Scoped to the visible (in-drawer) receipt copy —
  // ReceiptView also renders a hidden print-only copy.
  await expect(page.getByText(fixture.branchAddress).and(page.locator(':visible'))).toBeVisible()
})
