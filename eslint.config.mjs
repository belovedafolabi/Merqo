import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next. `**/` prefixes so these
  // also cover a nested build directory (e.g. a leftover .claude/worktrees/*
  // checkout's own .next/), not just one at the repo root — a bare '.next/**'
  // only anchors to cwd and otherwise lets ESLint wander into another
  // worktree's build output.
  globalIgnores([
    '**/.next/**',
    '**/out/**',
    '**/build/**',
    'next-env.d.ts',
    '**/coverage/**',
    '**/playwright-report/**',
    '**/test-results/**',
    '**/blob-report/**',
    '**/supabase/.temp/**',
  ]),
  // Must stay last: disables rules Prettier owns.
  prettier,
])

export default eslintConfig
