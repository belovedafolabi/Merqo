import { afterAll, describe, expect, it } from 'vitest'
import { pool, withTransaction } from './helpers/db'

const MILESTONE_02_TABLES = [
  'users',
  'business_types',
  'capabilities',
  'organizations',
  'branches',
  'business_units',
  'business_type_capabilities',
  'business_unit_capabilities',
  'roles',
  'permissions',
  'role_permissions',
  'user_roles',
  'audit_logs',
]

describe('row level security', () => {
  afterAll(async () => {
    await pool.end()
  })

  it('every Milestone 02 table has RLS enabled', async () => {
    const result = await pool.query(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r'
       order by relname`,
    )
    const byName = new Map(result.rows.map((row) => [row.relname, row.relrowsecurity]))

    for (const table of MILESTONE_02_TABLES) {
      expect(byName.get(table), `expected ${table} to exist`).toBeDefined()
      expect(byName.get(table), `expected ${table} to have RLS enabled`).toBe(true)
    }
  })

  it('the anon role cannot read rows from any Milestone 02 table (default-deny, no policies yet)', async () => {
    for (const table of MILESTONE_02_TABLES) {
      await withTransaction(async (client) => {
        await client.query('SET LOCAL ROLE anon')
        try {
          const result = await client.query(`select * from public.${table}`)
          expect(result.rows, `expected zero rows for ${table} as anon`).toHaveLength(0)
        } catch (error) {
          // Table-level permission denial is an equally valid enforcement
          // outcome here (see docs/architecture/database-conventions.md —
          // RLS-enable-now, policy-later): new tables are not auto-exposed to
          // Data API roles without explicit GRANTs either.
          expect((error as { code?: string }).code).toBe('42501') // insufficient_privilege
        }
      })
    }
  })
})
