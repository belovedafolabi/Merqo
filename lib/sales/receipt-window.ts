/**
 * Opens the print/preview route in a small named popup — the same affordance
 * the Sales list and the customer activity table both use for a receipt.
 *
 * The window name (`merqo-receipt`) is what makes repeat clicks idempotent:
 * the browser reuses the same popup rather than stacking one per click.
 *
 * Extracted from components/sales/sales-view.tsx (Milestone 17 Part D) so the
 * customer detail screen can share the exact same behaviour rather than
 * re-implementing it.
 */
export function openReceipt(saleId: string): void {
  window
    .open(
      `/receipts/preview?saleId=${encodeURIComponent(saleId)}`,
      'merqo-receipt',
      'popup=yes,width=420,height=760',
    )
    ?.focus()
}
