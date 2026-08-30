import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { E2EFixture } from './seed'

/**
 * Where tests/e2e/auth.setup.ts leaves its output, and how the authenticated
 * specs read it back. Split out from seed.ts so a spec can learn the seeded
 * ids without pulling @supabase/supabase-js into its worker, and from
 * auth.setup.ts so a spec never imports a setup file.
 */
const AUTH_DIR = path.join('tests', 'e2e', '.auth')

// The filename says "cashier" for historical reasons — it actually holds the
// primary fixture's OWNER session (every permission). Renaming it would touch
// all five Milestone 14 specs for no behavioural gain; this note is cheaper.
export const STORAGE_STATE = path.join(AUTH_DIR, 'cashier.json')
// Milestone 15: the genuinely limited (Cashier-role) session, used only by
// specs under tests/e2e/authenticated/limited/.
export const LIMITED_STORAGE_STATE = path.join(AUTH_DIR, 'limited.json')
export const FIXTURE_FILE = path.join(AUTH_DIR, 'fixture.json')
export { AUTH_DIR }

export async function readE2EFixture(): Promise<E2EFixture> {
  return JSON.parse(await readFile(FIXTURE_FILE, 'utf8')) as E2EFixture
}
