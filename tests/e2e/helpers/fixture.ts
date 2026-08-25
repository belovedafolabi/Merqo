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

export const STORAGE_STATE = path.join(AUTH_DIR, 'cashier.json')
export const FIXTURE_FILE = path.join(AUTH_DIR, 'fixture.json')
export { AUTH_DIR }

export async function readE2EFixture(): Promise<E2EFixture> {
  return JSON.parse(await readFile(FIXTURE_FILE, 'utf8')) as E2EFixture
}
