import { expect, test } from '@playwright/test'

/**
 * Milestone 17 Part E item 4. Branch Manager already holds refund.approve /
 * expense.approve, but the only place to act on a pending refund was the POS
 * returns screen — unreachable from the Admin shell. The seeded Owner holds
 * refund.approve, so /approvals must render for them and appear in the nav.
 * The negative case (a Cashier is refused) lives in
 * tests/e2e/authenticated/limited/permission-boundaries.spec.ts.
 */

test('the Approvals page renders for a user who can approve refunds', async ({ page }) => {
  await page.goto('/approvals')

  await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible()
  await expect(page.getByText('Something went wrong')).toHaveCount(0)
  // No sale has been refunded in the fixture, so the queue shows its empty state.
  await expect(page.getByText('Pending refunds')).toBeVisible()
  await expect(page.getByText('Nothing to approve')).toBeVisible()
})

test('the Approvals nav entry is present for a user who can approve refunds', async ({ page }) => {
  test.skip(
    test.info().project.name !== 'desktop-auth',
    'The sidebar nav is only always-visible on desktop.',
  )

  await page.goto('/dashboard')
  await expect(page.getByRole('link', { name: 'Approvals' })).toBeVisible()
})
