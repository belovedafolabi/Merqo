import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { pool } from './helpers/db'
import { bootstrapOrganization, createTestUser, type TestUser } from './helpers/supabase'

/**
 * dashboard_sales_summary() / dashboard_sales_series() (20260908090200) were
 * flipped from SECURITY INVOKER to SECURITY DEFINER + an upfront
 * branch-membership check — under INVOKER the per-row sales_select RLS made
 * each ~2s over ~2000 sales, and the "Sales performance" widget fires eight
 * of them at once, tripping the 8s statement timeout and crashing the
 * /dashboard RSC render. This guards both halves: they stay DEFINER, and the
 * guard still returns an empty result (not an error, not another branch's
 * numbers) for a branch the caller can't reach.
 *
 * dashboard_sales_series_hourly() (20260908090600) is the hourly sibling for
 * the "Today" tab and carries the same guard — covered below.
 */

let owner: TestUser
let organizationId: string
let branchId: string

afterAll(async () => {
  await pool.end()
})

describe('dashboard_sales_* — SECURITY DEFINER + branch-access guard', () => {
  it('all three functions are SECURITY DEFINER', async () => {
    const { rows } = await pool.query<{ proname: string; prosecdef: boolean }>(
      `select proname, prosecdef from pg_proc
       where proname in ('dashboard_sales_summary', 'dashboard_sales_series',
                         'dashboard_sales_series_hourly')`,
    )
    expect(rows).toHaveLength(3)
    for (const row of rows) expect(row.prosecdef).toBe(true)
  })

  it('a member gets rows for their own branch and [] for an unreachable one', async () => {
    owner = await createTestUser()
    ;({ organizationId } = await bootstrapOrganization(owner, `Dash${randomUUID().slice(0, 8)}`))
    branchId = (
      await pool.query(
        `insert into public.branches (organization_id, name, slug) values ($1, 'B', $2) returning id`,
        [organizationId, `dash-b-${randomUUID().slice(0, 8)}`],
      )
    ).rows[0].id

    const from = new Date(Date.now() - 14 * 86_400_000).toISOString()
    const to = new Date().toISOString()

    const summary = await owner.client.rpc('dashboard_sales_summary', {
      p_branch_id: branchId,
      p_from: from,
      p_to: to,
    })
    expect(summary.error).toBeNull()
    // One aggregate row, all zeros — a reachable branch with no sales.
    expect(summary.data).toHaveLength(1)
    expect(Number(summary.data![0].sale_count)).toBe(0)

    const series = await owner.client.rpc('dashboard_sales_series', {
      p_branch_id: branchId,
      p_from: from,
      p_to: to,
      p_tz: 'Africa/Lagos',
    })
    expect(series.error).toBeNull()
    // 15 day buckets, every count 0.
    expect(series.data!.every((d: { sale_count: number }) => Number(d.sale_count) === 0)).toBe(true)

    // Hourly sibling: a single day's window, every bucket zero, ordered.
    const dayStart = new Date()
    dayStart.setUTCHours(0, 0, 0, 0)
    const hourly = await owner.client.rpc('dashboard_sales_series_hourly', {
      p_branch_id: branchId,
      p_from: dayStart.toISOString(),
      p_to: new Date().toISOString(),
      p_tz: 'Africa/Lagos',
    })
    expect(hourly.error).toBeNull()
    expect(hourly.data!.length).toBeGreaterThan(0)
    expect(hourly.data!.every((d: { sale_count: number }) => Number(d.sale_count) === 0)).toBe(true)

    const blockedHourly = await owner.client.rpc('dashboard_sales_series_hourly', {
      p_branch_id: randomUUID(),
      p_from: dayStart.toISOString(),
      p_to: new Date().toISOString(),
      p_tz: 'Africa/Lagos',
    })
    expect(blockedHourly.error).toBeNull()
    expect(blockedHourly.data).toEqual([])

    // A branch id the caller has no user_roles row for.
    const blocked = await owner.client.rpc('dashboard_sales_summary', {
      p_branch_id: randomUUID(),
      p_from: from,
      p_to: to,
    })
    expect(blocked.error).toBeNull()
    expect(blocked.data).toEqual([])
  })

  it('a user from another organization gets [] for this branch', async () => {
    const outsider = await createTestUser()
    await bootstrapOrganization(outsider, `Out${randomUUID().slice(0, 8)}`)

    const { data, error } = await outsider.client.rpc('dashboard_sales_series', {
      p_branch_id: branchId,
      p_from: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      p_to: new Date().toISOString(),
      p_tz: 'Africa/Lagos',
    })
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})
