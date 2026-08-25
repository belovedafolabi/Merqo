import { expect, test } from '@playwright/test'

/**
 * Responsive checks for the shared shell chrome
 * (docs/milestones/04-design-system-and-app-shell.md Testing Requirements:
 * "Playwright checks that the Admin shell and POS shell each render
 * correctly at desktop, tablet, and mobile viewport widths").
 *
 * This spec runs in the unauthenticated `chromium` project, so it verifies
 * the sign-in screen itself — sharing the Admin shell's dark-canvas/card
 * visual language, per that milestone's auth-restyle deliverable — renders
 * correctly at every breakpoint.
 *
 * The equivalent checks against the *authenticated* shells, which this file
 * used to defer "to a later milestone with a seeded E2E test user", now
 * exist: Milestone 14 added tests/e2e/auth.setup.ts and the tablet/phone
 * projects in playwright.config.ts, and the POS-side responsive coverage
 * lives in tests/e2e/authenticated/. This file stays focused on the
 * signed-out surface, which those projects never visit.
 */

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
] as const

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('sign-in screen renders without horizontal overflow', async ({ page }) => {
      await page.goto('/sign-in')

      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      await expect(page.getByLabel('Email')).toBeVisible()
      await expect(page.getByLabel('Password')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()

      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(hasHorizontalOverflow).toBe(false)
    })
  })
}
