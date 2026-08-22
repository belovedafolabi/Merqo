import { defineConfig } from 'vitest/config'

/**
 * Integration tests run against a real local Postgres instance (the
 * Supabase-managed database started by `pnpm db:start` / `supabase start`),
 * never mocked — see docs/milestones/02-database-and-core-domain-foundation.md
 * Testing Requirements. This config is intentionally separate from
 * vitest.config.ts (unit tests): no jsdom/React plugin, node environment, and
 * a single worker so the whole suite shares a stable connection pool instead
 * of racing multiple Postgres connections against transaction-scoped tests.
 *
 * `resolve.tsconfigPaths` added in Milestone 03: tests/integration/authorization.test.ts
 * imports the pure resolvePermission()/fetchPermissionGrants() logic
 * directly from lib/auth/* via the `@/` alias, the same as the unit config.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
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
