import { expect, test } from '@playwright/test'

test('root page renders in a real browser', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Merqo', level: 1 })).toBeVisible()
})

test('health endpoint reports the app is up', async ({ request }) => {
  const response = await request.get('/api/health')

  expect(response.status()).toBe(200)
  await expect(response.json()).resolves.toMatchObject({
    status: 'ok',
    service: 'merqo',
    // Milestone 16: GoTrue liveness alone is not enough — the probe also
    // checks PostgREST, and the E2E job runs against a live local stack, so
    // both must read 'ok'.
    checks: { supabase: 'ok', postgrest: 'ok' },
  })
})
