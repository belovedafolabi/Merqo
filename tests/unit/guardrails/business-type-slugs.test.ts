import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Milestone 17 Part B's contract: business-type behaviour is driven by seeded
 * reference tables (business_type_capabilities, business_type_terminology,
 * business_type_presets), NEVER a `business_type === 'restaurant'` branch in
 * application code — the same rule Milestone 02 / 05 set.
 *
 * This test greps `app/` and `lib/` for any of the 13 slugs appearing next to
 * a comparison or inside a conditional. A hit means someone reached for a
 * hard-coded vertical branch; move the behaviour into a reference table.
 *
 * Allowed: the slugs may still appear as plain data — a string in an array, a
 * seed literal, a type union — just not in an `if` / `switch` / ternary / `===`.
 */

const SLUGS = [
  'supermarket',
  'convenience_store',
  'restaurant',
  'pharmacy',
  'clothing_fashion',
  'electronics',
  'hardware_building_materials',
  'beauty_salons_barbers',
  'hotels',
  'bakeries',
  'wholesalers',
  'general_retail',
  'other',
] as const

// `'other'` is too generic to match on its own — only flag it in an obvious
// business-type comparison.
const CONDITIONAL_PATTERNS = SLUGS.filter((s) => s !== 'other').flatMap((slug) => [
  new RegExp(`===\\s*['"\`]${slug}['"\`]`),
  new RegExp(`['"\`]${slug}['"\`]\\s*===`),
  new RegExp(`!==\\s*['"\`]${slug}['"\`]`),
  new RegExp(`case\\s+['"\`]${slug}['"\`]`),
  new RegExp(`(if|when|switch)\\s*\\([^)]*['"\`]${slug}['"\`]`),
])

const ROOT = join(__dirname, '..', '..', '..')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue
      out.push(...walk(full))
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

describe('no business-type slug drives a code branch', () => {
  const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib'))]

  it('finds no business-type slug inside a conditional in app/ or lib/', () => {
    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const pattern of CONDITIONAL_PATTERNS) {
        const match = pattern.exec(source)
        if (match) {
          const line = source.slice(0, match.index).split('\n').length
          offenders.push(`${file.replace(ROOT, '').replace(/\\/g, '/')}:${line} — ${match[0]}`)
        }
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
