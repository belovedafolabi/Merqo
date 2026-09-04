import { expect, test } from '@playwright/test'

/**
 * Milestone 17 Part A — insights.view is Owner + Branch Manager by default.
 * The seeded Cashier has neither, so the nav item is hidden and a direct
 * navigation to /insights lands on the route error boundary (the page's
 * requirePermission gate), never the content.
 */

test('the Insights nav item is hidden from a cashier', async ({ page }) => {
  await page.goto('/dashboard')
  // The sidebar is nested <ul>/<li>, not a <nav> landmark — match by name.
  await expect(page.getByRole('link', { name: 'Insights', exact: true })).toHaveCount(0)
})

test('a direct navigation to /insights is refused, not merely hidden', async ({ page }) => {
  await page.goto('/insights')

  await expect(page.getByText('Something went wrong')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Demand forecast' })).toHaveCount(0)
})
