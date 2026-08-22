import { expect, test } from '@playwright/test'

/**
 * Responsive checks for the shared shell chrome
 * (docs/milestones/04-design-system-and-app-shell.md Testing Requirements:
 * "Playwright checks that the Admin shell and POS shell each render
 * correctly at desktop, tablet, and mobile viewport widths").
 *
 * The `e2e` CI job (.github/workflows/ci.yml) runs against a plain
 * `next build && next start` with no Supabase instance behind it — only
 * `db-migrations` provisions one, for the integration-test job. That's not
 * just "no session" — `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` are unset
 * entirely, and proxy.ts *deliberately* passes every request through
 * un-redirected when they're missing (its own comment: "keeps CI's e2e
 * smoke job... from failing on every request"). `/dashboard` and `/pos`
 * therefore reach their Server Component layouts, where
 * `requireUser()` → `createServerSupabaseClient()` constructs a Supabase
 * client from those same unset env vars and throws — a 500, not the
 * sign-in redirect one might expect. That's a pre-existing gap in
 * lib/supabase/server.ts (no proxy.ts-style "not configured" guard), out of
 * this milestone's scope to fix, so this spec doesn't assert redirect
 * behavior that can't actually hold here. What it does verify: the sign-in
 * screen — sharing the Admin shell's dark-canvas/card visual language, per
 * this milestone's auth-restyle deliverable — renders correctly at every
 * breakpoint. A later milestone with a seeded E2E test user (Milestone 05
 * onward typically needs one for its own flows) can extend this file with
 * the equivalent checks against the authenticated shells directly.
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
