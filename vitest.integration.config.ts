import { defineConfig } from 'vitest/config'

/**
 * Integration tests run against a real local Postgres instance (the
 * Supabase-managed database started by `pnpm db:start` / `supabase start`),
 * never mocked — see docs/milestones/02-database-and-core-domain-foundation.md
 * Testing Requirements. This config is intentionally separate from
 * vitest.config.ts (unit tests): no jsdom/React plugin, node environment, and
 * a single worker so the whole suite shares a stable connection pool instead
 * of racing multiple Postgres connections against transaction-scoped tests.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 15_000,
    // Run test files sequentially rather than in parallel worker processes —
    // simpler than tuning pg.Pool connection limits per worker for a suite
    // this small, and avoids any cross-file ordering surprises.
    fileParallelism: false,
  },
})
