import { describe, expect, it, vi } from 'vitest'

import { applyBusinessTypePresets } from '@/lib/business-structure/presets'

/**
 * Milestone 17 Part B — applyBusinessTypePresets() must only ever write real
 * widget ids and real report ids; anything else in a preset payload is
 * silently dropped, not applied.
 */

type Preset = { preset_kind: string; payload: unknown }

function fakeSupabase(presets: Preset[]) {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

  const client = {
    from: (table: string) => {
      if (table === 'business_type_presets') {
        return { select: () => ({ eq: () => Promise.resolve({ data: presets, error: null }) }) }
      }
      if (table === 'dashboard_widgets') return { upsert }
      if (table === 'business_units') return { update }
      throw new Error(`unexpected table ${table}`)
    },
  }

  return { client: client as never, upsert, update }
}

const params = { businessUnitId: 'bu-1', businessTypeId: 'bt-1', userId: 'user-1' }

describe('applyBusinessTypePresets', () => {
  it('applies only valid widget ids', async () => {
    const { client, upsert } = fakeSupabase([
      {
        preset_kind: 'dashboard_widgets',
        payload: ['sales_summary', 'not_a_widget', 'low_stock'],
      },
    ])

    const result = await applyBusinessTypePresets(client, params)

    expect(upsert).toHaveBeenCalledOnce()
    const rows = upsert.mock.calls[0]![0] as Array<{ widget_id: string }>
    expect(rows.map((r) => r.widget_id)).toEqual(['sales_summary', 'low_stock'])
    expect(result.widgetsApplied).toBe(2)
  })

  it('applies only valid report ids', async () => {
    const { client, update } = fakeSupabase([
      {
        preset_kind: 'pinned_reports',
        payload: ['sales-summary', 'made-up-report', 'sales-by-product'],
      },
    ])

    const result = await applyBusinessTypePresets(client, params)

    expect(update).toHaveBeenCalledWith({ pinned_reports: ['sales-summary', 'sales-by-product'] })
    expect(result.reportsApplied).toBe(2)
  })

  it('does nothing when there are no presets for the type', async () => {
    const { client, upsert, update } = fakeSupabase([])
    const result = await applyBusinessTypePresets(client, params)

    expect(upsert).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(result).toEqual({ widgetsApplied: 0, reportsApplied: 0 })
  })

  it('skips a non-array payload without throwing', async () => {
    const { client, upsert } = fakeSupabase([
      { preset_kind: 'dashboard_widgets', payload: 'sales_summary' },
    ])
    const result = await applyBusinessTypePresets(client, params)
    expect(upsert).not.toHaveBeenCalled()
    expect(result.widgetsApplied).toBe(0)
  })
})
