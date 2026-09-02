import { expect, test } from '@playwright/test'

/**
 * Regression cover for the mobile Admin nav, which had none: this file's
 * namesake bug shipped because tests/e2e/responsive-shell.spec.ts only ever
 * visits the signed-out /sign-in page, and no authenticated spec opened the
 * sidebar.
 *
 * The bug: <SidebarCloseOnNavigate /> was rendered inside <Sidebar>, whose
 * children on mobile live in a Radix Sheet that only mounts while it is
 * open. Opening the menu mounted the component, its "close on navigate"
 * mount effect fired, and the menu shut in the same commit — so the
 * hamburger looked completely dead. It now lives in app/(app)/layout.tsx,
 * outside the Sheet.
 *
 * Only meaningful below components/ui/sidebar.tsx's 768px breakpoint, above
 * which the sidebar is a permanent column with no Sheet at all — so the
 * desktop and tablet projects skip.
 */
const MOBILE_BREAKPOINT = 768

test.describe('Admin shell — mobile navigation', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const width = testInfo.project.use.viewport?.width ?? 0
    test.skip(width >= MOBILE_BREAKPOINT, 'The sidebar is a permanent column at this width.')
    await page.goto('/dashboard')
  })

  test('the hamburger opens the nav and it stays open', async ({ page }) => {
    const trigger = page.getByRole('button', { name: 'Toggle Sidebar' })
    await expect(trigger).toBeVisible()

    await trigger.click()

    const nav = page.getByRole('dialog')
    await expect(nav).toBeVisible()

    // The regression was a same-commit reopen-then-close, which a bare
    // toBeVisible() can race past. Re-asserting after the sheet's open
    // animation has settled is what actually catches it.
    await page.waitForTimeout(500)
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Products' })).toBeVisible()
  })

  test('tapping a nav item navigates and closes the nav', async ({ page }) => {
    await page.getByRole('button', { name: 'Toggle Sidebar' }).click()

    const nav = page.getByRole('dialog')
    await expect(nav).toBeVisible()
    await nav.getByRole('link', { name: 'Products' }).click()

    await page.waitForURL(/\/products$/)
    await expect(nav).toBeHidden()
  })
})
