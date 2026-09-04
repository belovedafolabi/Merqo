/**
 * Milestone 17 Part B — the terminology resolver's pure half. No server
 * imports: client components import `TermKey` / `TerminologyMap` / `makeT`
 * from here, and reaching lib/supabase/server transitively would break the
 * build (the client-bundle next/headers trap). The data-fetching half is
 * lib/terminology/queries.ts.
 *
 * Deliberately a narrow lookup, not an i18n framework — six generic keys that
 * cover most of the perceived difference between the 13 verticals. A future
 * i18n layer could sit behind the same `t()` call sites.
 */

export const TERM_KEYS = ['sale', 'customer', 'product', 'cart', 'receipt', 'catalog'] as const
export type TermKey = (typeof TERM_KEYS)[number]

export interface Term {
  singular: string
  plural: string
}

export type TerminologyMap = Record<TermKey, Term>

/** The built-in defaults every business type falls back to per missing key. */
export const GENERIC_TERMS: TerminologyMap = {
  sale: { singular: 'Sale', plural: 'Sales' },
  customer: { singular: 'Customer', plural: 'Customers' },
  product: { singular: 'Product', plural: 'Products' },
  cart: { singular: 'Cart', plural: 'Carts' },
  receipt: { singular: 'Receipt', plural: 'Receipts' },
  catalog: { singular: 'Catalog', plural: 'Catalogs' },
}

export interface TFn {
  (key: TermKey, opts?: { plural?: boolean; lower?: boolean }): string
}

/**
 * Builds a `t()` helper over a resolved map. `t('sale')` → "Sale",
 * `t('customer', { plural: true })` → "Customers",
 * `t('sale', { lower: true })` → "sale". An unknown key falls back to the
 * generic term rather than throwing.
 */
export function makeT(map: TerminologyMap): TFn {
  return (key, opts) => {
    const term = map[key] ?? GENERIC_TERMS[key]
    const value = opts?.plural ? term.plural : term.singular
    return opts?.lower ? value.toLowerCase() : value
  }
}

/** Overlays seeded rows onto the generic defaults. */
export function resolveTerminology(
  rows: Array<{ termKey: string; singular: string; plural: string }>,
): TerminologyMap {
  const map: TerminologyMap = { ...GENERIC_TERMS }
  for (const row of rows) {
    if ((TERM_KEYS as readonly string[]).includes(row.termKey)) {
      map[row.termKey as TermKey] = { singular: row.singular, plural: row.plural }
    }
  }
  return map
}
