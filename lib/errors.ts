import { ZodError } from 'zod'

import { AuthorizationError } from '@/lib/auth/guard'
import { RateLimitError } from '@/lib/rate-limit/limiter'

export interface StockShortfall {
  name: string
  available: number
  requested: number
}

/**
 * A checkout blocked because one or more lines exceed available stock, raised
 * by lib/sales/mutations.ts's pre-check BEFORE create_sale() so the offending
 * products can be named (the DB's P0001 is quantity-only). The Server Action
 * surfaces `shortfalls` as structured data for a tidy list in the UI; this
 * error's own message is the plain-text fallback.
 */
export class InsufficientStockError extends Error {
  readonly shortfalls: StockShortfall[]

  constructor(shortfalls: StockShortfall[]) {
    const names = shortfalls.map((s) => s.name).join(', ')
    super(`Not enough stock for ${names}.`)
    this.name = 'InsufficientStockError'
    this.shortfalls = shortfalls
  }
}

/**
 * The single place a caught `unknown` becomes a string safe to show a user.
 *
 * Why this exists: Server Actions used to each carry a private
 * `errorMessage(e) => e instanceof Error ? e.message : 'Something went
 * wrong.'`. But `@supabase/postgrest-js` (on the normal `{ data, error }`
 * path, i.e. without `throwOnError`) resolves its `error` as a **plain
 * object** `{ message, code, details, hint }` — it only constructs a real
 * `PostgrestError extends Error` when `throwOnError` is set. Mutations here
 * `throw error` with that plain object, so `instanceof Error` was false for
 * every database-level failure and they ALL collapsed to the generic
 * string — masking `P0001` insufficient stock, `42501` RLS/grant denials, a
 * missing column from an unapplied migration, and so on. This helper
 * unwraps those shapes and maps the Postgres error codes the app's RPCs
 * actually raise to plain-language messages.
 */

const PG_MESSAGE_BY_CODE: Record<string, string> = {
  // raised by record_inventory_movement() when a sale would take stock negative
  P0001: 'Not enough stock for one or more items in this sale.',
  // create_sale(): a product or customer that belongs to a different outlet
  P0002: "A product or customer in this sale doesn't belong to this outlet.",
  // create_sale(): a non-positive quantity, or store credit with no customer
  P0004: 'One or more line items are invalid — check the quantities and payment method.',
  // unique_violation
  '23505': 'That value is already in use.',
  // foreign_key_violation
  '23503': 'This references something that no longer exists — refresh and try again.',
  // not_null_violation
  '23502': 'A required value is missing.',
  // insufficient_privilege — RLS policy or a missing GRANT
  '42501': "You don't have permission to do that.",
  // undefined_column / undefined_table — almost always a migration not applied
  '42703': 'The database is out of date for this feature. Contact support.',
  '42P01': 'The database is out of date for this feature. Contact support.',
}

interface PostgrestLikeError {
  message?: unknown
  code?: unknown
  details?: unknown
  hint?: unknown
}

function isPostgrestLike(value: unknown): value is PostgrestLikeError {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('code' in value || 'hint' in value || 'details' in value || 'message' in value)
  )
}

export function toErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? fallback
  }

  if (error instanceof AuthorizationError) {
    return "You don't have permission to do that."
  }

  if (error instanceof RateLimitError) {
    return 'Too many attempts in a short time — wait a moment and try again.'
  }

  if (error instanceof InsufficientStockError) {
    return error.message
  }

  if (isPostgrestLike(error)) {
    const code = typeof error.code === 'string' ? error.code : undefined
    if (code && PG_MESSAGE_BY_CODE[code]) {
      return PG_MESSAGE_BY_CODE[code]
    }
    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return fallback
}
