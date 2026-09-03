import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { WIDGETS, WIDGET_IDS, WIDGET_LIST, findWidget } from '@/lib/dashboard/widgets'

/**
 * lib/dashboard/widgets.ts and dashboard_widgets_widget_id_check
 * (20260903090400) are two copies of the same whitelist — see that module's
 * header. This makes them drift loudly, the same pattern
 * tests/unit/receipts/templates.test.ts uses: parse the migration's actual
 * CHECK text rather than maintaining a third hand-written fixture.
 */

const MIGRATION_SQL = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260903090400_create_dashboard_widgets.sql'),
  'utf8',
)

function sqlWidgetIds(): string[] {
  const match =
    /dashboard_widgets_widget_id_check\s+check\s*\(\s*widget_id\s+in\s*\(([^)]+)\)/i.exec(
      MIGRATION_SQL,
    )
  const captured = match?.[1]
  if (!captured)
    throw new Error('could not find dashboard_widgets_widget_id_check in the migration')
  return captured
    .split(',')
    .map((token) => token.trim().replace(/^'|'$/g, ''))
    .filter(Boolean)
    .sort()
}

describe('dashboard widget registry <-> SQL check constraint', () => {
  it('every TS widget id is allowed by the SQL constraint, and vice versa', () => {
    expect([...WIDGET_IDS].sort()).toEqual(sqlWidgetIds())
  })

  it('every registered id has a full definition and a unique default position', () => {
    const positions = new Set<number>()
    for (const id of WIDGET_IDS) {
      expect(WIDGETS[id].id).toBe(id)
      expect(positions.has(WIDGETS[id].defaultPosition)).toBe(false)
      positions.add(WIDGETS[id].defaultPosition)
    }
  })

  it('WIDGET_LIST is in declaration order', () => {
    expect(WIDGET_LIST.map((widget) => widget.id)).toEqual([...WIDGET_IDS])
  })
})

describe('findWidget', () => {
  it('resolves a valid id', () => {
    expect(findWidget('sales_summary')?.label).toBe('Sales summary')
  })

  it('returns null for an unknown id', () => {
    expect(findWidget('nope')).toBeNull()
    expect(findWidget('')).toBeNull()
  })
})
