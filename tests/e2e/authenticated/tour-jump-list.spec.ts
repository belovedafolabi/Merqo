import { expect, test } from '@playwright/test'

/**
 * Milestone 17 Part D. The product tour was Next / Back only. It now carries a
 * clickable list of every step in the current track inside the driver.js
 * popover; clicking one jumps there and the tour continues linearly. The
 * linear flow, the "Take a tour" FAB, and one-time completion are unchanged.
 *
 * Milestone 17 Part E item 8: on a phone the popover is portalled outside the
 * mobile nav Sheet, and a tap on a jump-list entry used to register as an
 * outside-press and close the menu — hiding the very nav item the tour was
 * pointing at. The mobile test below guards that.
 */

test('the tour popover shows a jump list and clicking an entry moves the spotlight', async ({
  page,
}) => {
  test.skip(
    test.info().project.name !== 'desktop-auth',
    'The inline jump list is a desktop concern; the mobile path has its own test below.',
  )

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

test('jumping steps on a phone does not close the mobile nav menu', async ({ page }) => {
  test.skip(
    !['phone-auth', 'phone-auth-webkit'].includes(test.info().project.name),
    'Exercises the mobile nav Sheet ↔ tour popover interaction.',
  )

  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Take a tour' }).click()

  const popover = page.locator('.driver-popover.merqo-tour')
  await expect(popover).toBeVisible()

  // The tour opens the mobile nav Sheet so its links have targets.
  const navSheet = page.locator('[data-slot="sidebar"][data-mobile="true"]')
  await expect(navSheet).toBeVisible()

  // Open the collapsed "Jump to a step" disclosure, then jump.
  await popover.locator('.merqo-tour-steps__disclosure > summary').click()
  const entries = popover.locator('.merqo-tour-steps__item')
  const count = await entries.count()
  expect(count).toBeGreaterThanOrEqual(2)
  await entries.nth(count - 1).click()

  // The regression: the tap fell through to Radix's DismissableLayer and
  // closed the Sheet. It must stay open.
  await expect(navSheet).toBeVisible()
  await expect(popover.locator('.merqo-tour-steps__item').nth(count - 1)).toHaveAttribute(
    'aria-current',
    'step',
  )
})
