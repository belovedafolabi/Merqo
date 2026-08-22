import { Pool, type PoolClient } from 'pg'

/**
 * Direct Postgres connection for integration tests — deliberately not
 * `@supabase/supabase-js`/PostgREST. Every Milestone 02 table has RLS enabled
 * with zero policies (default-deny) and isn't exposed through PostgREST's
 * schema cache yet, so the Data API can't reach these tables regardless of
 * which key is used. Constraint tests also need precise Postgres error codes
 * (23505 unique violation, 23503 FK violation), which `pg` surfaces directly.
 *
 * Connects to the local Supabase Postgres instance (`supabase/config.toml`
 * `[db] port = 54322`), started by `pnpm db:start` locally or `supabase
 * start` in CI (see .github/workflows/ci.yml, job "db-migrations").
 */
const DEFAULT_LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL,
})

/**
 * Runs `fn` inside a transaction that is always rolled back, so tests never
 * leave data behind for later tests to trip over — no full `db reset`
 * between test files needed.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    try {
      return await fn(client)
    } finally {
      await client.query('ROLLBACK')
    }
  } finally {
    client.release()
  }
}
