import { readFileSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The mechanical half of Milestone 12's Definition of Done: "a codebase-wide
 * check confirms no module outside EmailService imports/calls Resend
 * directly." Generalises the three-file check that used to live in
 * tests/unit/email/service.test.ts into a repo-wide sweep over lib/, app/,
 * and components/ — the three directories that can hold application code
 * calling into lib/email/**.
 *
 * The import-statement check is the one that actually matters: a hostname
 * grep alone would miss a module that imports sendEmail() (or, worse,
 * reaches into lib/email/transports/resend.ts) without ever typing
 * "api.resend.com" itself. lib/notifications/** is the one permitted
 * exception — it IS the NotificationService layer docs/TAS.md §33 places
 * between business logic and EmailService, and lib/notifications/
 * templates.ts is documented as the sole caller of
 * @/lib/email/templates/*.
 */

const ROOT = process.cwd()
const SCAN_DIRS = ['lib', 'app', 'components']
const SOURCE_FILE_PATTERN = /\.(ts|tsx)$/
const EMAIL_IMPORT_PATTERN = /from\s+['"](@\/lib\/email\/|\.\.?\/.*\/email\/)/

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

describe('lib/email layering (Milestone 12 Definition of Done)', () => {
  const allFiles = SCAN_DIRS.flatMap((dir) => listSourceFiles(join(ROOT, dir)))

  it('api.resend.com is named in exactly one file across lib/, app/, and components/', () => {
    const targetFile = join(ROOT, 'lib', 'email', 'transports', 'resend.ts')
    const matches = allFiles.filter((path) => readFileSync(path, 'utf8').includes('api.resend.com'))

    expect(matches).toEqual([targetFile])
  })

  it('no file outside lib/email/** and lib/notifications/** imports from @/lib/email/', () => {
    const emailDir = toPosix(join(ROOT, 'lib', 'email'))
    const notificationsDir = toPosix(join(ROOT, 'lib', 'notifications'))

    const offenders = allFiles.filter((path) => {
      const posixPath = toPosix(path)
      if (posixPath.startsWith(emailDir + '/') || posixPath.startsWith(notificationsDir + '/')) {
        return false
      }
      return EMAIL_IMPORT_PATTERN.test(readFileSync(path, 'utf8'))
    })

    expect(offenders).toEqual([])
  })

  it('package.json has no resend dependency', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    expect(pkg.dependencies?.resend).toBeUndefined()
    expect(pkg.devDependencies?.resend).toBeUndefined()
  })
})
