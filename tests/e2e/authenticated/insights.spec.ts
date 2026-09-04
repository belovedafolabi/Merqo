import { expect, test } from '@playwright/test'

/**
 * Milestone 17 Part A — the Sales Insights page. The seeded fixture has little
 * sales history, so the assertions are on the page *shape*: the nav item, the
 * route rendering (not the error boundary), and either the three section cards
 * or the top-level "not enough history" empty state — whichever the data
 * warrants. The forecast arithmetic is covered by tests/integration/insights.test.ts.
 *
 * Desktop only: nothing here is viewport-specific.
 */

test.beforeEach(() => {
  test.skip(test.info().project.name !== 'desktop-auth', 'Not viewport-specific.')
})

test('the Insights nav item leads to a rendered page, not the error boundary', async ({ page }) => {
  await page.goto('/dashboard')

  // The sidebar renders as nested <ul>/<li>, not a <nav> landmark (see
  // limited/permission-boundaries.spec.ts) — scope by the link's own name.
  const navLink = page.getByRole('link', { name: 'Insights', exact: true })
  await expect(navLink).toBeVisible()
  await navLink.click()

  await expect(page).toHaveURL(/\/insights$/)
  await expect(page.getByText('Something went wrong')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible()
})

test('the page shows either the three sections or the not-enough-history state', async ({
  page,
}) => {
  await page.goto('/insights')

  const forecastCard = page.getByRole('heading', { name: 'Demand forecast' })
  const emptyState = page.getByText(/not enough sales history yet/i)

  // Exactly one of the two is on screen.
  await expect(forecastCard.or(emptyState).first()).toBeVisible()

  if (await forecastCard.isVisible()) {
    await expect(page.getByRole('heading', { name: 'Restock soon' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Slow movers' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Forecast horizon' })).toBeVisible()
  }
})

test('a slow-mover row, when present, links to Settings → Coupons', async ({ page }) => {
  await page.goto('/insights')

  const promoLink = page.getByRole('link', { name: 'Set up a promo' }).first()
  if ((await promoLink.count()) === 0) {
    test.skip(true, 'No slow movers in the seeded data — covered by the integration test.')
  }

  await promoLink.click()
  await expect(page).toHaveURL(/\/settings\/coupons/)
})
