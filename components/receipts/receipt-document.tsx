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
 */
export function ReceiptDocument({
  sale,
  templateId,
  branding,
  settings,
  branchName,
}: {
  sale: Sale
  templateId: keyof typeof RECEIPT_TEMPLATES
  branding: Pick<OrganizationBranding, 'displayName' | 'logoUrl'> | null
  settings: Pick<ReceiptSettings, 'headerText' | 'footerText' | 'showLogo' | 'showCashier'>
  branchName?: string | null
}) {
  const template = RECEIPT_TEMPLATES[templateId]

  return (
    <div
      className={`mx-auto flex w-full flex-col gap-3 rounded-lg border bg-card p-4 text-body-sm print:rounded-none print:border-none ${template.widthClass}`}
    >
      <div className="flex flex-col items-center gap-1 text-center">
        {settings.showLogo && branding?.logoUrl && (
          // Plain <img>, not next/image: this document renders inside a
          // modal, a print frame, and a settings preview — none of them
          // benefit from Next's layout-shift/optimization machinery, and a
          // logo this small costs nothing unoptimized.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="" className="mb-1 h-10 w-auto object-contain" />
        )}
        <p className="font-semibold">{branding?.displayName ?? 'Merqo'}</p>
        {branchName && <p className="text-xs text-muted-foreground">{branchName}</p>}
        {settings.headerText && (
          <p className="text-xs text-muted-foreground">{settings.headerText}</p>
        )}
      </div>

      <div className="border-t border-dashed" />

      <ul className={`flex flex-col ${template.density === 'compact' ? 'gap-1' : 'gap-1.5'}`}>
        {sale.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-2">
            <span className="min-w-0 truncate">
              {item.quantity} × {item.productName}
              {template.showItemUnitPrice && (
                <span className="text-muted-foreground"> @ {money(item.unitPrice)}</span>
              )}
            </span>
            <span className="shrink-0 tabular-nums">{money(item.lineTotal)}</span>
          </li>
        ))}
      </ul>

      <div className="border-t border-dashed" />

      <div className="flex flex-col gap-1 text-muted-foreground">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span className="tabular-nums">{money(sale.subtotal)}</span>
        </div>
        {sale.discountAmount > 0 && (
          <div className="flex justify-between">
            <span>Discount{sale.discountReason ? ` (${sale.discountReason})` : ''}</span>
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

      <div className="border-t border-dashed" />

      <div className="flex justify-between text-body font-semibold">
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

      <p className="text-caption text-muted-foreground">
        {formatDateTime(sale.createdAt)} · Receipt #{sale.id.slice(0, 8).toUpperCase()}
        {settings.showCashier && sale.createdByName ? ` · Served by ${sale.createdByName}` : ''}
      </p>

      {settings.footerText && (
        <p className="text-center text-xs text-muted-foreground">{settings.footerText}</p>
      )}
    </div>
  )
}
