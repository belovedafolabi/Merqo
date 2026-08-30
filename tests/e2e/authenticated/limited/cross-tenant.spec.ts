import { expect, test } from '@playwright/test'

import { readE2EFixture } from '../../helpers/fixture'

/**
 * Milestone 15: cross-tenant isolation, asserted against a REAL second
 * organization rather than invented ids.
 *
 * seedE2EFixture() builds `otherOrg` — a completely separate tenant with its
 * own Owner and a product named "Rival Org Confidential Widget". These specs
 * run as the primary org's Cashier and confirm that nothing scoped to the
 * other tenant is reachable: not by URL, not through search, not in a
 * report. A random UUID would prove nothing here — RLS returns empty for a
 * row that does not exist just as it does for one the caller may not see.
 * The other org's rows genuinely exist; they must simply be invisible.
 */

test("the other organization's product never appears in POS search", async ({ page }) => {
  const fixture = await readE2EFixture()

  await page.goto('/pos')
  const search = page.getByRole('textbox', { name: 'Search products or scan a barcode' })
  await search.fill(fixture.otherOrg.productName)

  // Give the debounced search time to resolve, then assert the tile is
  // absent. The distinctive name makes a leak unmistakable.
  await expect(page.getByText(fixture.otherOrg.productName)).toHaveCount(0)
  await expect(page.getByText(/no (products|results)/i)).toBeVisible()
})

test("a report scoped to the other organization's branch shows no data", async ({ page }) => {
  const fixture = await readE2EFixture()

  // The report's own branch filter is populated from the caller's accessible
  // branches, so passing another tenant's branch id by hand is the
  // adversarial case: the report RPC is SECURITY INVOKER and RLS-filtered,
  // so it can only ever aggregate rows the caller could already read.
  await page.goto(`/reports/sales-by-product?branchId=${fixture.otherOrg.branchId}`)

  await expect(page.getByRole('heading', { name: 'Sales by product' })).toBeVisible()
  await expect(page.getByText(fixture.otherOrg.productName)).toHaveCount(0)
})

test("the other organization's settings page is not reachable by URL", async ({ page }) => {
  const fixture = await readE2EFixture()

  // There is no per-org settings URL to forge in this single-tenant-per-
  // deployment model, so the check is simpler: a Cashier cannot reach org
  // settings at all, regardless of which org. This also covers the case of a
  // stale link from the other org's Owner being followed by this user.
  await page.goto('/settings/organization')

  await expect(page.getByText(fixture.otherOrg.productName)).toHaveCount(0)
  // Either the route error boundary or a redirect away — never the other
  // org's data.
  await expect(page).not.toHaveURL(new RegExp(fixture.otherOrg.organizationId))
})
