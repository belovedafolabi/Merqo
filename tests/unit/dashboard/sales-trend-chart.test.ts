import { describe, expect, it } from 'vitest'

import { formatSeriesLabel } from '@/components/charts/sales-trend-chart'

/**
 * MS17 Part E item 3: the "Sales performance" card's "Today" tab now charts
 * hourly buckets, so a point's `day` field carries either a calendar date or
 * an hour timestamp and the axis label has to switch with it. Formatting is
 * pinned to Africa/Lagos (the dashboard's fixed zone) so it doesn't drift with
 * the viewer's browser timezone.
 *
 * The date branch's assertion checks shape, not the exact month spelling,
 * which varies by ICU build; the hour branch is pinned to a 24-hour clock so
 * it is deterministic.
 */

describe('formatSeriesLabel', () => {
  it('formats a calendar date as a day number plus a month name', () => {
    const label = formatSeriesLabel('2026-09-08', 'day')
    expect(label).toMatch(/^8\s+\p{L}+/u)
    expect(label).not.toMatch(/[AP]M/i)
  })

  it('formats an hour bucket as HH:00 in Africa/Lagos, not UTC', () => {
    // 09:00 UTC is 10:00 in Lagos (UTC+1, no DST).
    expect(formatSeriesLabel('2026-09-08T09:00:00.000Z', 'hour')).toBe('10:00')
  })

  it('rolls an hour bucket into the correct Lagos day', () => {
    // 23:00 UTC on the 7th is 00:00 Lagos on the 8th.
    expect(formatSeriesLabel('2026-09-07T23:00:00.000Z', 'hour')).toBe('00:00')
  })

  it('passes a value it cannot parse straight through', () => {
    expect(formatSeriesLabel('not-a-date', 'day')).toBe('not-a-date')
  })
})
