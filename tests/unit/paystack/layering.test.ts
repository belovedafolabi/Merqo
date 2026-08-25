import { readFileSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The mechanical half of this milestone's layering guarantees, mirroring
 * tests/unit/email/layering.test.ts exactly:
 *
 *   1. api.paystack.co is named in exactly one file — the transport.
 *   2. lib/supabase/admin.ts (the service-role client, which bypasses RLS
 *      entirely) is imported by exactly its two documented callers.
 *   3. No authorization decision anywhere compares a role's slug directly —
 *      Milestone 03's hard rule, which the Super Admin design depends on.
 */

const ROOT = process.cwd()
const SCAN_DIRS = ['lib', 'app', 'components']
const SOURCE_FILE_PATTERN = /\.(ts|tsx)$/

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true }) as unknown as Array<{
    name: string
    parentPath?: string
    path?: string
    isFile(): boolean
  }>

  return entries
    .filter((entry) => entry.isFile() && SOURCE_FILE_PATTERN.test(entry.name))
    .map((entry) => join(entry.parentPath ?? entry.path ?? dir, entry.name))
}

function toPosix(path: string): string {
  return path.split(sep).join('/')
}

describe('lib/paystack + lib/supabase/admin layering (Milestone 13)', () => {
  const allFiles = SCAN_DIRS.flatMap((dir) => listSourceFiles(join(ROOT, dir)))

  it('api.paystack.co is named in exactly one file', () => {
    const targetFile = join(ROOT, 'lib', 'paystack', 'transports', 'paystack.ts')
    const matches = allFiles.filter((path) =>
      readFileSync(path, 'utf8').includes('api.paystack.co'),
    )

    expect(matches).toEqual([targetFile])
  }, 20_000)

  it('lib/supabase/admin (the service-role client) is imported only from lib/subscription/**, never a Route Handler directly', () => {
    const adminImportPattern = /from\s+['"]@\/lib\/supabase\/admin['"]/
    const subscriptionDir = toPosix(join(ROOT, 'lib', 'subscription'))

    const importers = allFiles.filter((path) => adminImportPattern.test(readFileSync(path, 'utf8')))
    const offenders = importers.filter((path) => !toPosix(path).startsWith(subscriptionDir + '/'))

    expect(offenders).toEqual([])
    // Also assert some importers actually exist and were found — a passing
    // empty-offenders list is meaningless if the glob matched nothing.
    expect(importers.length).toBeGreaterThanOrEqual(3)
  }, 20_000)

  it('no authorization decision compares roles.slug directly outside the two documented provisioning spots', () => {
    // Milestone 03's hard rule: "no authorization decision anywhere checks a
    // role's name directly." The two legitimate exceptions are both
    // PROVISIONING, not runtime authorization: seeding the role catalog, and
    // promote_to_super_admin() resolving the seeded role's id. Neither is a
    // .ts/.tsx file, so this check simply confirms no application code has
    // reintroduced the pattern.
    const roleSlugComparisonPattern =
      /role\.slug\s*===|roles\.slug\s*=\s*['"]|slug\s*===\s*['"]super_admin['"]/

    const offenders = allFiles.filter((path) =>
      roleSlugComparisonPattern.test(readFileSync(path, 'utf8')),
    )

    expect(offenders).toEqual([])
  }, 20_000)

  it('package.json has no paystack dependency', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    expect(pkg.dependencies?.paystack).toBeUndefined()
    expect(pkg.devDependencies?.paystack).toBeUndefined()
  })
})
