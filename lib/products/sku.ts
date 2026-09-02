import { randomInt } from 'node:crypto'

/**
 * Server-side SKU generator, used by lib/products/mutations.ts when a
 * product is created (or updated) with no SKU supplied — the form field is
 * optional (lib/products/schemas.ts) but products.sku is NOT NULL, so the
 * server always fills one in.
 *
 * Shape: a short readable slug from the product name, then a random base36
 * suffix for uniqueness, e.g. "COCA-COLA-1L" -> "COCACOLA1L-K3F9". The
 * caller re-tries with a fresh suffix on the (business_unit_id, sku) partial
 * unique index collision (23505) before surfacing an error — see
 * `products_business_unit_sku_key`.
 *
 * Never a bare UUID: a cashier reads and types SKUs, and the name stem makes
 * a generated one recognisable at the till and in exports.
 */

const SLUG_MAX = 12
const SUFFIX_LEN = 4

function slugFromName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toUpperCase()
    .slice(0, SLUG_MAX)
  return cleaned || 'SKU'
}

function randomSuffix(): string {
  // base36, uppercased, ambiguity-free enough for hand entry. randomInt()
  // draws each digit uniformly from [0, 36) — `randomBytes() % 36` would be
  // biased toward the low digits (256 isn't a multiple of 36).
  let out = ''
  for (let i = 0; i < SUFFIX_LEN; i += 1) {
    out += randomInt(36).toString(36)
  }
  return out.toUpperCase()
}

export function generateSku(name: string): string {
  return `${slugFromName(name)}-${randomSuffix()}`
}
