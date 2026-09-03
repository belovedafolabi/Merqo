/**
 * The receipt-template whitelist — the TypeScript half of
 * organizations_receipt_template_id_check
 * (20260824091000_alter_organizations_add_receipt_settings.sql), mirroring
 * lib/reports/registry.ts's TS-registry-mirrors-SQL pattern. Kept in sync
 * with the SQL constraint by tests/unit/receipts/templates.test.ts, exactly
 * as tests/unit/reports/registry.test.ts does for its counterpart.
 *
 * Every field here is a PRESENTATION flag — density, which optional lines
 * to show — never a permission key or a query fragment. Selecting a
 * template can never change what data a receipt is allowed to show; that is
 * decided entirely by what components/receipts/receipt-document.tsx is
 * handed (a Sale the caller already had permission to read), not by which
 * of these three layouts draws it.
 */

export const RECEIPT_TEMPLATE_IDS = ['classic', 'compact', 'detailed'] as const
export type ReceiptTemplateId = (typeof RECEIPT_TEMPLATE_IDS)[number]

export const DEFAULT_RECEIPT_TEMPLATE_ID: ReceiptTemplateId = 'classic'

export interface ReceiptTemplateDef {
  id: ReceiptTemplateId
  label: string
  description: string
  density: 'comfortable' | 'compact'
  showItemUnitPrice: boolean
  showTaxBreakdown: boolean
  showPaymentDetail: boolean
  /**
   * Detailed-only extras: a per-line share of tax against each item, and a
   * metadata block (item/unit count, payment reference) under the totals.
   */
  showItemTax: boolean
  showReceiptMeta: boolean
  /**
   * Tailwind max-width class for the previewed document, sized to match the
   * physical roll `paperWidthMm` targets — an 80mm roll has ~302px of
   * printable width at 96dpi, a 58mm roll ~219px. It used to be `max-w-sm` /
   * `max-w-md` (384–448px), so the on-screen preview was wider than anything
   * that could actually print and the right-hand price column looked safe
   * when it would in fact clip on the roll.
   */
  widthClass: string
  /**
   * Receipt body type size. The three templates are meant to differ by size,
   * density and which lines they show — not width alone (Classic and
   * Detailed share an 80mm roll). Compact is the smallest; Detailed is a
   * notch down from Classic because it carries the extra per-item-tax and
   * meta rows and still has to fit the same roll.
   */
  bodyClass: string
  /**
   * Physical paper width the printed `@page` rule targets, in millimetres —
   * 58mm and 80mm being the two thermal receipt-roll sizes in general use.
   *
   * Deliberately derived from the template rather than stored as its own
   * organization setting: the choice is already made when an org picks a
   * template (Compact exists precisely because it is "narrower... for
   * thermal-printer widths"), and a second, independent width field would let
   * the two disagree. The preview route still accepts a `?paper=` override
   * for a shop whose printer disagrees with its template.
   */
  paperWidthMm: 58 | 80
}

/** Paper widths the `?paper=` override accepts — the whitelist it validates against. */
export const RECEIPT_PAPER_WIDTHS_MM = [58, 80] as const
export type ReceiptPaperWidthMm = (typeof RECEIPT_PAPER_WIDTHS_MM)[number]

export function findReceiptPaperWidth(value: string | undefined): ReceiptPaperWidthMm | null {
  const parsed = Number(value)
  return (RECEIPT_PAPER_WIDTHS_MM as readonly number[]).includes(parsed)
    ? (parsed as ReceiptPaperWidthMm)
    : null
}

export const RECEIPT_TEMPLATES: Record<ReceiptTemplateId, ReceiptTemplateDef> = {
  classic: {
    id: 'classic',
    label: 'Classic',
    description:
      'Standard receipt width with full line-item detail — the default for most businesses.',
    density: 'comfortable',
    showItemUnitPrice: true,
    showTaxBreakdown: true,
    showPaymentDetail: true,
    showItemTax: false,
    showReceiptMeta: false,
    widthClass: 'max-w-[302px]',
    bodyClass: 'text-[0.75rem] leading-normal',
    paperWidthMm: 80,
  },
  compact: {
    id: 'compact',
    label: 'Compact',
    description:
      'Tight, narrow layout for 58mm thermal rolls — small type, unit prices omitted, minimal rules.',
    density: 'compact',
    showItemUnitPrice: false,
    showTaxBreakdown: true,
    showPaymentDetail: false,
    showItemTax: false,
    showReceiptMeta: false,
    widthClass: 'max-w-[219px]',
    bodyClass: 'text-[0.625rem] leading-tight',
    paperWidthMm: 58,
  },
  detailed: {
    id: 'detailed',
    label: 'Detailed',
    description:
      'Everything Classic shows, plus a per-item tax share and an item-count / payment-reference block — for businesses that need it on the printed copy.',
    density: 'comfortable',
    showItemUnitPrice: true,
    showTaxBreakdown: true,
    showPaymentDetail: true,
    showItemTax: true,
    showReceiptMeta: true,
    widthClass: 'max-w-[302px]',
    bodyClass: 'text-[0.6875rem] leading-snug',
    paperWidthMm: 80,
  },
}

export function findReceiptTemplate(id: string): ReceiptTemplateDef | null {
  return (RECEIPT_TEMPLATE_IDS as readonly string[]).includes(id)
    ? RECEIPT_TEMPLATES[id as ReceiptTemplateId]
    : null
}
