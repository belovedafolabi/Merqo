/**
 * Pure row type + presentation helpers for the /sales list — no
 * `next/headers` reach, so components/sales/sales-view.tsx (a client
 * component) can import it. lib/sales/queries.ts's listSales() returns this
 * shape; see components/expenses/expenses-view.tsx for the same
 * split-the-type-out convention.
 */

export interface SaleListEntry {
  id: string
  createdAt: string
  itemCount: number
  total: number
  /** Distinct payment method(s) recorded against the sale. */
  paymentMethods: string[]
  cashierName: string | null
  /** How many `returns` rows reference this sale (0 = not refunded). */
  returnCount: number
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  transfer: 'Bank transfer',
  store_credit: 'Store credit',
}

export function formatPaymentMethods(methods: string[]): string {
  if (methods.length === 0) return '—'
  return methods.map((method) => PAYMENT_METHOD_LABELS[method] ?? method).join(', ')
}

/** Short, human-quotable form of a sale's UUID for a "Receipt #" column. */
export function shortSaleRef(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase()
}
