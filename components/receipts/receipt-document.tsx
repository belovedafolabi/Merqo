import { formatDateTime } from '@/lib/utils'
import type { OrganizationBranding } from '@/lib/branding/queries'
import type { ReceiptSettings } from '@/lib/receipts/settings'
import { RECEIPT_TEMPLATES } from '@/lib/receipts/templates'
import type { Sale } from '@/lib/sales/queries'

// 'en-NG' explicit, not `undefined`: this is a printed/reprinted receipt, and
// `undefined` resolves the RUNTIME's default ICU locale, which differs by
// platform (confirmed: it silently diverged between a Windows dev machine and
// the Ubuntu CI runner, failing tests/unit/receipts/receipt-print.test.tsx's
// snapshots even though nothing about the sale had changed). The same
// reasoning that made lib/utils.ts's formatDateTime pin its locale explicitly
// applies here — a receipt must render identically wherever it's printed
// from.
function money(value: number): string {
  return value.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })
}

/**
 * The one receipt renderer — rendered identically by the POS checkout dialog
 * (components/pos/receipt-view.tsx), the settings preview route
 * (app/(app)/receipts/preview/page.tsx), and the template picker's
 * live thumbnails. That is deliberate: "renders correctly with branding and
 * real transaction data" (Milestone 11's Acceptance Criteria) only needs
 * verifying once if there is only one component to verify it against.
 *
 * Pure and presentational — no fetching, no Server Actions. Every prop is
 * data the caller already had permission to read; the component's only job
 * is to lay it out according to `template`.
 *
 * The three templates differ by width (Compact targets a 58mm roll, the
 * others 80mm), by body type size (`template.bodyClass`), by density
 * (padding / rules / gaps, driven by `template.density`), and by which
 * optional lines they show. The address block under the business name is the
 * same for all three.
 */
export function ReceiptDocument({
  sale,
  templateId,
  branding,
  settings,
  // Milestone 17 Part B — the word for the document, from the business unit's
  // terminology ("Receipt", "Bill", "Ticket", "Folio"). Defaults to "Receipt"
  // so the template picker's static thumbnails and any un-threaded caller are
  // unaffected.
  receiptLabel = 'Receipt',
}: {
  sale: Sale
  templateId: keyof typeof RECEIPT_TEMPLATES
  branding: Pick<OrganizationBranding, 'displayName' | 'logoUrl'> | null
  settings: Pick<
    ReceiptSettings,
    'headerText' | 'footerText' | 'showLogo' | 'showCashier' | 'orgAddressLine' | 'orgContactPhone'
  >
  receiptLabel?: string
}) {
  const template = RECEIPT_TEMPLATES[templateId]
  const compact = template.density === 'compact'

  // Density-driven layout — padding, gaps and rule style. Type SIZE comes
  // from template.bodyClass instead, so Detailed can be a step smaller than
  // Classic while sharing its comfortable density.
  const rootClass = compact ? 'gap-2 p-3' : 'gap-3 p-4'
  const ruleClass = compact ? 'border-t' : 'border-t border-dashed'
  const itemsGap = compact ? 'gap-0.5' : 'gap-1.5'
  const totalRow = compact ? 'font-semibold' : 'text-body font-semibold'

  const totalUnits = sale.items.reduce((sum, item) => sum + item.quantity, 0)

  // The selling branch's own address/phone, falling back to the
  // organization's when the branch has not set its own (20260903090200).
  const addressLine = sale.branchAddressLine ?? settings.orgAddressLine
  const contactPhone = sale.branchContactPhone ?? settings.orgContactPhone

  return (
    <div
      className={`mx-auto flex w-full flex-col rounded-lg border bg-card print:rounded-none print:border-none ${rootClass} ${template.bodyClass} ${template.widthClass}`}
    >
      <div className="flex flex-col items-center gap-1 text-center">
        {settings.showLogo && branding?.logoUrl && (
          // Plain <img>, not next/image: this document renders inside a
          // modal, a print frame, and a settings preview — none of them
          // benefit from Next's layout-shift/optimization machinery, and a
          // logo this small costs nothing unoptimized.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logoUrl}
            alt=""
            className={`w-auto object-contain ${compact ? 'mb-0.5 h-8' : 'mb-1 h-10'}`}
          />
        )}
        <p className="font-semibold">{branding?.displayName ?? 'Merqo'}</p>
        {/* Address block, immediately under the business name and above the
            branch/header lines — the position a printed receipt conventionally
            carries the shop's address. */}
        {addressLine && <p className="text-muted-foreground">{addressLine}</p>}
        {contactPhone && <p className="text-muted-foreground">{contactPhone}</p>}
        {sale.branchName && <p className="text-muted-foreground">{sale.branchName}</p>}
        {settings.headerText && <p className="text-muted-foreground">{settings.headerText}</p>}
      </div>

      <div className={ruleClass} />

      <ul className={`flex flex-col ${itemsGap}`}>
        {sale.items.map((item) => {
          const itemTax =
            template.showItemTax && sale.subtotal > 0
              ? (item.lineTotal / sale.subtotal) * sale.taxAmount
              : 0
          return (
            <li key={item.id} className="flex flex-col gap-0.5">
              <div className="flex justify-between gap-2">
                <span className="min-w-0 truncate">
                  {item.quantity} × {item.productName}
                  {template.showItemUnitPrice && (
                    <span className="text-muted-foreground"> @ {money(item.unitPrice)}</span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums">{money(item.lineTotal)}</span>
              </div>
              {itemTax > 0 && (
                <span className="text-caption text-muted-foreground">
                  incl. tax {money(itemTax)}
                </span>
              )}
            </li>
          )
        })}
      </ul>

      <div className={ruleClass} />

      <div className="flex flex-col gap-1 text-muted-foreground">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span className="tabular-nums">{money(sale.subtotal)}</span>
        </div>
        {sale.discountAmount > 0 && (
          <div className="flex justify-between">
            <span>
              Discount
              {sale.couponCode
                ? ` (${sale.couponCode})`
                : sale.discountReason
                  ? ` (${sale.discountReason})`
                  : ''}
            </span>
            <span className="tabular-nums">−{money(sale.discountAmount)}</span>
          </div>
        )}
        {template.showTaxBreakdown && (
          <div className="flex justify-between">
            <span>Tax</span>
            <span className="tabular-nums">{money(sale.taxAmount)}</span>
          </div>
        )}
        {sale.serviceChargeAmount > 0 && (
          <div className="flex justify-between">
            <span>Service charge</span>
            <span className="tabular-nums">{money(sale.serviceChargeAmount)}</span>
          </div>
        )}
      </div>

      <div className={ruleClass} />

      <div className={`flex justify-between ${totalRow}`}>
        <span>Total</span>
        <span className="tabular-nums">{money(sale.total)}</span>
      </div>

      {template.showPaymentDetail &&
        sale.payments.map((payment) => (
          <div key={payment.id} className="flex justify-between text-muted-foreground">
            <span className="capitalize">Paid via {payment.method.replace('_', ' ')}</span>
            <span className="tabular-nums">{money(payment.amount)}</span>
          </div>
        ))}

      {template.showReceiptMeta && (
        <div className="mt-1 flex flex-col gap-0.5 text-caption text-muted-foreground">
          <div className="flex justify-between">
            <span>Items</span>
            <span className="tabular-nums">
              {sale.items.length} line{sale.items.length === 1 ? '' : 's'} · {totalUnits} unit
              {totalUnits === 1 ? '' : 's'}
            </span>
          </div>
          {sale.payments
            .filter((payment) => payment.reference)
            .map((payment) => (
              <div key={payment.id} className="flex justify-between gap-2">
                <span>Ref</span>
                <span className="min-w-0 truncate text-right">{payment.reference}</span>
              </div>
            ))}
        </div>
      )}

      <p className={`text-caption text-muted-foreground ${compact ? 'mt-1' : 'mt-2'}`}>
        {formatDateTime(sale.createdAt)} · {receiptLabel} #{sale.id.slice(0, 8).toUpperCase()}
        {(settings.showCashier || template.showReceiptMeta) && sale.createdByName
          ? ` · Served by ${sale.createdByName}`
          : ''}
      </p>

      {settings.footerText && (
        <p className="mt-1 text-center text-muted-foreground">{settings.footerText}</p>
      )}
    </div>
  )
}
