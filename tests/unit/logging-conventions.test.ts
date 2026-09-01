import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Milestone 16's observability requirement: "confirm structured logging ... is
 * consistent and actually useful for diagnosing a real production incident
 * (spot-checked, not just assumed)."
 *
 * A spot-check that lives in a doc rots. This re-derives every logger call
 * site from source on every run — the same stance
 * tests/integration/security-sweep.test.ts takes toward the RLS matrix — and
 * fails the build if a new call breaks the convention lib/logger.ts's header
 * describes: the first argument is a dotted, lowercase, grep-able event name,
 * never a template string or a sentence.
 *
 * Why it matters: docs/milestones/16-launch/operations.md's symptom ->
 * destination table is keyed on these exact event names. A `logger.warn(`sale
 * ${id} failed`)` — interpolated, sentence-shaped — is invisible to every grep
 * in that runbook.
 */

const ROOTS = ['lib', 'app', 'hooks', 'components'] as const

/** dotted, lowercase, snake segments: `sale.created`, `rate_limit.tripped`. */
const EVENT_NAME = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/

/** `logger.info(` / `logger.warn(` / `logger.error(` / `logger.debug(` */
const LOGGER_CALL = /\blogger\.(debug|info|warn|error)\s*\(\s*/g

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...walk(full))
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

interface CallSite {
  file: string
  firstArg: string
}

function collectLoggerCalls(): CallSite[] {
  const sites: CallSite[] = []
  for (const root of ROOTS) {
    let files: string[]
    try {
      files = walk(root)
    } catch {
      continue
    }
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      // Skip the logger module itself: its `(message: string, ...)` signature
      // and JSDoc mention `logger.` without being call sites.
      if (file.replace(/\\/g, '/').endsWith('lib/logger.ts')) continue

      for (const match of src.matchAll(LOGGER_CALL)) {
        const start = match.index! + match[0].length
        // The first argument, up to the first comma or close-paren at depth 0.
        // Good enough: every real call passes a literal or an identifier as
        // arg one, never a nested call with commas.
        const rest = src.slice(start, start + 200)
        const firstArg = rest.split(/,|\)/)[0]!.trim()
        sites.push({ file, firstArg })
      }
    }
  }
  return sites
}

describe('structured logging conventions', () => {
  const sites = collectLoggerCalls()

  it('finds logger call sites to check (guards against a broken matcher)', () => {
    // If this drops to zero the regex or the walk broke, and every assertion
    // below would pass vacuously.
    expect(sites.length).toBeGreaterThan(20)
  })

  it('every logger.* call passes a dotted, lowercase event-name string literal', () => {
    const offenders = sites.filter(({ firstArg }) => {
      const isSingleQuoted = /^'[^']*'$/.test(firstArg)
      const isDoubleQuoted = /^"[^"]*"$/.test(firstArg)
      if (!isSingleQuoted && !isDoubleQuoted) return true // template string, or a variable
      return !EVENT_NAME.test(firstArg.slice(1, -1))
    })

    expect(
      offenders,
      `logger calls violating the event-name convention:\n${offenders
        .map((o) => `  ${o.file}: ${o.firstArg}`)
        .join('\n')}`,
    ).toEqual([])
  })

  it('the POS checkout path emits both sale.created and sale.rejected', () => {
    // The specific gap the Milestone 16 spot-check found and closed. Pin it so
    // a refactor of lib/sales/mutations.ts cannot silently drop it again.
    const salesEvents = sites
      .filter((s) => s.file.replace(/\\/g, '/').endsWith('lib/sales/mutations.ts'))
      .map((s) => s.firstArg.replace(/['"]/g, ''))

    expect(salesEvents).toContain('sale.created')
    expect(salesEvents).toContain('sale.rejected')
  })
})
