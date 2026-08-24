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
  /** Tailwind max-width class for the printed/previewed document. */
  widthClass: string
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
    widthClass: 'max-w-sm',
  },
  compact: {
    id: 'compact',
    label: 'Compact',
    description:
      'Narrower layout for thermal-printer widths, with unit prices omitted to save space.',
    density: 'compact',
    showItemUnitPrice: false,
    showTaxBreakdown: true,
    showPaymentDetail: true,
    widthClass: 'max-w-xs',
  },
  detailed: {
    id: 'detailed',
    label: 'Detailed',
    description:
      'Everything Classic shows, plus a full tax and payment breakdown — for businesses that need it on the printed copy.',
    density: 'comfortable',
    showItemUnitPrice: true,
    showTaxBreakdown: true,
    showPaymentDetail: true,
    widthClass: 'max-w-md',
  },
}

export function findReceiptTemplate(id: string): ReceiptTemplateDef | null {
  return (RECEIPT_TEMPLATE_IDS as readonly string[]).includes(id)
    ? RECEIPT_TEMPLATES[id as ReceiptTemplateId]
    : null
}
