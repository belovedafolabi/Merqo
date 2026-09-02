'use client'

import { ReceiptDocument } from '@/components/receipts/receipt-document'
import { cn } from '@/lib/utils'
import type { OrganizationBranding } from '@/lib/branding/queries'
import { SAMPLE_SALE } from '@/lib/receipts/sample'
import {
  RECEIPT_TEMPLATE_IDS,
  RECEIPT_TEMPLATES,
  type ReceiptTemplateId,
} from '@/lib/receipts/templates'

/**
 * Radio cards, each rendering a live <ReceiptDocument> thumbnail against
 * SAMPLE_SALE — the same component and, for logo/header/footer, the same
 * settings the real preview route and the POS checkout receipt use. What you
 * see here is what prints.
 */
export function ReceiptTemplatePicker({
  value,
  onChange,
  branding,
  showLogo,
  headerText,
  footerText,
}: {
  value: ReceiptTemplateId
  onChange: (id: ReceiptTemplateId) => void
  branding: Pick<OrganizationBranding, 'displayName' | 'logoUrl'> | null
  showLogo: boolean
  headerText: string
  footerText: string
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {RECEIPT_TEMPLATE_IDS.map((id) => {
        const template = RECEIPT_TEMPLATES[id]
        const selected = value === id

        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              'flex flex-col gap-2 rounded-lg border-2 p-3 text-left transition-colors',
              selected ? 'border-primary' : 'border-transparent hover:border-border',
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-body-sm font-medium">{template.label}</span>
              {selected && <span className="size-2 rounded-full bg-primary" />}
            </div>
            <p className="text-xs text-muted-foreground">{template.description}</p>
            {/*
             * The preview renders at a fixed reference width and is scaled
             * to fit the column, inside an `overflow-hidden` box with an
             * explicit height so the scaled document neither overlaps the
             * text above nor bleeds past the card. Without this the column
             * (~1/3 of the settings card) was narrower than every template's
             * max-width, so all three collapsed to the same `w-full` size.
             */}
            <div className="relative h-64 overflow-hidden rounded-md border bg-muted/30">
              <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                <div className="origin-top scale-[0.58]" style={{ width: 340 }}>
                  <ReceiptDocument
                    sale={SAMPLE_SALE}
                    templateId={id}
                    branding={branding}
                    settings={{
                      headerText: headerText || null,
                      footerText: footerText || null,
                      showLogo,
                      showCashier: true,
                    }}
                  />
                </div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
