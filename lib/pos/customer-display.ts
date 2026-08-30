import type { CartLine } from '@/lib/pos/cart-context'
import type { SaleTotals } from '@/lib/sales/calculations'

/**
 * The wire format between the till and the customer-facing display, shared by
 * publisher and subscriber so the two cannot drift.
 *
 * TRANSPORT: BroadcastChannel, not Supabase Realtime.
 *
 * docs/milestones/14-hardware-integration-and-pos-ux.md offers both — its
 * Scope names "a second browser window/tab" first, and its Technical
 * Requirements note Realtime "is acceptable here". This takes the first
 * option, and the reasoning is worth recording because it is a deliberate
 * deviation from the more elaborate of the two:
 *
 * - The display is a second window on the same till machine, which is the
 *   physical setup a customer-facing screen actually has: a second monitor on
 *   the same PC. BroadcastChannel is same-origin, same-browser, and needs no
 *   network at all.
 * - It therefore needs NO new security surface. The display window shares the
 *   cashier's session cookies, so /display is gated exactly like /pos, with no
 *   entry added to proxy.ts's public allowlist. The milestone's own Security
 *   Requirement — that this is "a new, less-restricted-by-design surface"
 *   needing explicit review — is satisfied by the surface never becoming less
 *   restricted in the first place.
 * - No pairing table, so the milestone's "Database Changes: None expected"
 *   stands as written.
 * - docs/TAS.md cautions against Realtime becoming a default dependency. Not
 *   reaching for it here means it stays unused in this codebase.
 *
 * The cost is stated plainly: a customer display on a SEPARATE device (a
 * counter tablet) is not supported. That is scoped as a follow-up, not
 * silently unbuilt.
 */

export const CUSTOMER_DISPLAY_CHANNEL = 'merqo.customer-display'

/**
 * Bumped whenever the snapshot shape changes. The subscriber drops anything
 * that does not match, so a display window left open across a deploy shows a
 * stale-but-coherent screen instead of rendering a payload it half
 * understands.
 */
export const CUSTOMER_DISPLAY_PROTOCOL_VERSION = 1

/**
 * One cart line as a customer may see it.
 *
 * `key` is a render key, NOT a productId — see toCustomerDisplaySnapshot.
 */
export interface CustomerDisplayLine {
  key: string
  name: string
  quantity: number
  lineTotal: number
}

export interface CustomerDisplaySnapshot {
  v: number
  lines: CustomerDisplayLine[]
  subtotal: number
  discountAmount: number
  taxAmount: number
  serviceChargeAmount: number
  total: number
}

export type CustomerDisplayMessage =
  | { type: 'snapshot'; snapshot: CustomerDisplaySnapshot }
  /**
   * Sent by a display on mount. BroadcastChannel has no retention, so a
   * display opened part-way through a sale would otherwise sit on its welcome
   * screen until the cashier's next keystroke. The publisher answers by
   * re-posting current state.
   *
   * Deliberately not solved with a localStorage mirror: that would be a
   * second replay path to keep correct, and it would write cart contents to
   * disk on a machine whose second screen faces the public.
   */
  | { type: 'request-snapshot' }

/**
 * The security boundary for the customer display is this function's return
 * type, not reviewer discipline.
 *
 * Everything a customer must not see is absent by construction rather than by
 * omission: no productId/variantId (mapped to a positional key), no SKU or
 * barcode, no cost price, no customer name or contact details, no discount
 * REASON (only the amount), no cashier identity, no sale id, and no branch or
 * business-unit ids. tests/unit/pos/customer-display.test.ts asserts the key
 * sets against an explicit allowlist, so a later `...line` spread fails a test
 * instead of quietly leaking a field onto a public-facing screen.
 */
export function toCustomerDisplaySnapshot(
  lines: CartLine[],
  totals: SaleTotals,
): CustomerDisplaySnapshot {
  return {
    v: CUSTOMER_DISPLAY_PROTOCOL_VERSION,
    lines: lines.map((line, index) => ({
      key: String(index),
      name: line.name,
      quantity: line.quantity,
      lineTotal: line.unitPrice * line.quantity,
    })),
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    taxAmount: totals.taxAmount,
    serviceChargeAmount: totals.serviceChargeAmount,
    total: totals.total,
  }
}

/** True when a message came from a publisher speaking this exact protocol version. */
export function isCurrentProtocol(message: CustomerDisplayMessage): boolean {
  return message.type !== 'snapshot' || message.snapshot.v === CUSTOMER_DISPLAY_PROTOCOL_VERSION
}
