import { expect, test } from '@playwright/test'

/**
 * Milestone 17 Part D. The product tour was Next / Back only. It now carries a
 * clickable list of every step in the current track inside the driver.js
 * popover; clicking one jumps there and the tour continues linearly. The
 * linear flow, the "Take a tour" FAB, and one-time completion are unchanged.
 *
 * Desktop only: the jump list renders inline there; on mobile it is a
 * collapsed <details>, and the popover-anchoring in a 375px viewport makes the
 * interaction fiddly to assert without adding value over the unit test.
 */

test.beforeEach(() => {
  test.skip(
    test.info().project.name !== 'desktop-auth',
    'The inline jump list is a desktop concern; the mobile disclosure is unit-tested.',
  )
})

test('the tour popover shows a jump list and clicking an entry moves the spotlight', async ({
  page,
}) => {
  await page.goto('/dashboard')

  await page.getByRole('button', { name: 'Take a tour' }).click()

  const popover = page.locator('.driver-popover.merqo-tour')
  await expect(popover).toBeVisible()

  const entries = popover.locator('.merqo-tour-steps__item')
  const count = await entries.count()
  expect(count).toBeGreaterThanOrEqual(2)

  // The first step is the active one on open.
  await expect(entries.first()).toHaveAttribute('aria-current', 'step')

  const firstTitle = await popover.locator('.driver-popover-title').textContent()

  // Jump to the last step.
  await entries.nth(count - 1).click()

  // The popover re-renders for the new step: its title changes and the active
  // marker moves.
  await expect(popover.locator('.driver-popover-title')).not.toHaveText(firstTitle ?? '')
  await expect(popover.locator('.merqo-tour-steps__item').nth(count - 1)).toHaveAttribute(
    'aria-current',
    'step',
  )

  // Linear flow still works from the jumped-to point — close it out.
  await page.locator('.driver-popover-close-btn').click()
  await expect(popover).toBeHidden()
})
