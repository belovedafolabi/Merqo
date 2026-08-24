import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_RECEIPT_TEMPLATE_ID,
  RECEIPT_TEMPLATE_IDS,
  RECEIPT_TEMPLATES,
  findReceiptTemplate,
} from '@/lib/receipts/templates'

/**
 * The TS registry and organizations_receipt_template_id_check
 * (20260824091000) are two copies of the same whitelist, deliberately — see
 * lib/receipts/templates.ts's header. This suite makes them drift loudly,
 * the same pattern tests/unit/reports/registry.test.ts uses for its SQL
 * counterpart: parsing the migration's actual constraint text rather than
 * hand-maintaining a second fixture, which would itself be a third copy.
 */

const MIGRATION_SQL = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260824091000_alter_organizations_add_receipt_settings.sql',
  ),
  'utf8',
)

function sqlTemplateIds(): string[] {
  const match = /check\s*\(\s*receipt_template_id\s+in\s*\(([^)]+)\)\)/i.exec(MIGRATION_SQL)
  const captured = match?.[1]
  if (!captured)
    throw new Error('could not find organizations_receipt_template_id_check in the migration')
  return captured
    .split(',')
    .map((token) => token.trim().replace(/^'|'$/g, ''))
    .sort()
}

describe('receipt template registry <-> SQL check constraint', () => {
  it('every TS template id is allowed by the SQL constraint, and vice versa', () => {
    expect([...RECEIPT_TEMPLATE_IDS].sort()).toEqual(sqlTemplateIds())
  })

  it('every registered id has a full definition', () => {
    for (const id of RECEIPT_TEMPLATE_IDS) {
      expect(RECEIPT_TEMPLATES[id].id).toBe(id)
    }
  })

  it('the default template id is itself a valid, registered id', () => {
    expect(RECEIPT_TEMPLATE_IDS).toContain(DEFAULT_RECEIPT_TEMPLATE_ID)
  })
})

describe('findReceiptTemplate', () => {
  it('resolves a valid id', () => {
    expect(findReceiptTemplate('compact')?.label).toBe('Compact')
  })

  it('returns null for an unknown id rather than throwing — the caller decides the fallback', () => {
    expect(findReceiptTemplate('nonexistent')).toBeNull()
    expect(findReceiptTemplate('')).toBeNull()
  })
})
