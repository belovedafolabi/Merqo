import { expect, test } from '@playwright/test'

/**
 * Milestone 15: authorization boundaries, exercised as a real limited user
 * rather than asserted in the abstract.
 *
 * The seeded fixture's primary user is an Owner holding every permission, so
 * any "can this user do X" assertion written against it passes vacuously.
 * These specs run under the `limited-auth` project, whose storageState is
 * the seeded Cashier — a user who genuinely lacks products.view,
 * inventory.view, users.view and roles.view (supabase/seed.sql grants the
 * till roles only the POS + customer + reports.view set).
 *
 * Two layers are checked, because they are separate mechanisms:
 *   - the nav omits modules the user cannot enter (`<Can>` around each item)
 *   - a direct navigation to one of those routes hits the route's own
 *     requirePermission() and lands on the error boundary, not the content
 */

// The sidebar renders as nested <ul>/<li>, not a <nav> landmark, so scope by
// the link's own accessible name and require an exact match.
const navLink = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('link', { name, exact: true })

test('the cashier keeps the POS and the modules their role grants', async ({ page }) => {
  await page.goto('/dashboard')

  await expect(navLink(page, 'POS')).toBeVisible()
  await expect(navLink(page, 'Reports')).toBeVisible()
  await expect(navLink(page, 'Customers')).toBeVisible()
})

test('the nav hides every module the cashier has no permission for', async ({ page }) => {
  await page.goto('/dashboard')

  for (const label of ['Products', 'Inventory', 'Employees', 'Roles', 'Expenses']) {
    await expect(navLink(page, label)).toHaveCount(0)
  }
})

// Admin modules the seeded Cashier lacks the `.view` permission for.
// Milestone 15 audit finding 7: products / inventory / business-structure
// previously rendered their full management UI to any authenticated user who
// typed the URL — the `requirePermission()` gate was only in the nav and the
// mutations. They now guard the page like roles / employees / expenses /
// reports always did. `/customers` and `/layaways` are deliberately NOT here:
// the till roles hold `customers.view` and `layaway.view` (supabase/seed.sql),
// so a Cashier reaching those pages is correct, not a leak.
const REFUSED_ROUTES = [
  { path: '/roles', absentControl: 'Create role' },
  { path: '/products', absentControl: 'New product' },
  { path: '/inventory', absentControl: 'Adjust stock' },
  { path: '/business-structure', absentControl: 'New branch' },
]

for (const { path, absentControl } of REFUSED_ROUTES) {
  test(`a direct navigation to ${path} is refused, not merely hidden`, async ({ page }) => {
    // The nav gate is a convenience; requirePermission() inside the page is
    // the boundary. A Cashier who types the URL (or follows a stale
    // bookmark) gets the route error state, never the content. RouteError
    // renders its title as a <p>, not a heading.
    await page.goto(path)

    await expect(page.getByText('Something went wrong')).toBeVisible()
    await expect(page.getByRole('button', { name: absentControl })).toHaveCount(0)
  })
}

test('the cashier can still open the till and see the catalog', async ({ page }) => {
  // The point of least privilege is that it takes nothing away from the job
  // the role exists to do.
  await page.goto('/pos')
  await expect(page).toHaveURL(/\/pos$/)
  await expect(
    page.getByRole('textbox', { name: 'Search products or scan a barcode' }),
  ).toBeVisible()
})

test('the cashier reaches the modules their role does grant', async ({ page }) => {
  // The mirror image of the REFUSED_ROUTES check: a till role holds
  // customers.view and layaway.view, so these pages must render, not error.
  await page.goto('/customers')
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible()
  await expect(page.getByText('Something went wrong')).toHaveCount(0)

  await page.goto('/layaways')
  await expect(page.getByText('Something went wrong')).toHaveCount(0)
})
