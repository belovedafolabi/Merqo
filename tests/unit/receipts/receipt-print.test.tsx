import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ReceiptDocument } from '@/components/receipts/receipt-document'
import { SAMPLE_SALE } from '@/lib/receipts/sample'
import {
  RECEIPT_PAPER_WIDTHS_MM,
  RECEIPT_TEMPLATES,
  RECEIPT_TEMPLATE_IDS,
  findReceiptPaperWidth,
} from '@/lib/receipts/templates'

/**
 * Milestone 14's "visual/print tests: the print stylesheet renders the
 * expected receipt layout (snapshot-style test where feasible)".
 *
 * DOM snapshots, not pixel screenshots — a deliberate reading of "where
 * feasible". Pixel baselines need committing per platform and produce the
 * familiar "just regenerate them" churn that trains people to stop reading
 * the diff. A DOM snapshot catches what actually regresses here: a template
 * silently dropping its tax breakdown, a width class disappearing, a totals
 * row losing its label. The physical page geometry it cannot see is asserted
 * separately below and, end-to-end, by tests/e2e/authenticated/.
 */

/**
 * SAMPLE_SALE stamps createdAt with `new Date()` at module load, and the
 * receipt renders that timestamp — so snapshotting it directly would record
 * the clock and mismatch on every subsequent run. Pinning the two time fields
 * is what makes these snapshots assert layout rather than the current time.
 */
const sale = {
  ...SAMPLE_SALE,
  createdAt: '2026-01-15T09:30:00.000Z',
  payments: SAMPLE_SALE.payments.map((payment) => ({
    ...payment,
    createdAt: '2026-01-15T09:30:00.000Z',
  })),
}

const settings = {
  headerText: 'Thanks for shopping with us',
  footerText: 'Returns accepted within 7 days',
  showLogo: true,
  showCashier: true,
}

describe('ReceiptDocument renders each template stably', () => {
  for (const templateId of RECEIPT_TEMPLATE_IDS) {
    it(`${templateId}`, () => {
      const { container } = render(
        <ReceiptDocument
          sale={sale}
          templateId={templateId}
          branding={{ displayName: 'Merqo Test Store', logoUrl: null }}
          settings={settings}
          branchName="Main"
        />,
      )
      expect(container.innerHTML).toMatchSnapshot()
    })
  }
})

describe('paper width', () => {
  it('every template targets a real thermal roll width', () => {
    for (const templateId of RECEIPT_TEMPLATE_IDS) {
      expect(RECEIPT_PAPER_WIDTHS_MM).toContain(RECEIPT_TEMPLATES[templateId].paperWidthMm)
    }
  })

  it('compact is the narrow-roll template', () => {
    // The whole reason paperWidthMm is derived from the template rather than
    // stored separately: Compact's own description already promises a
    // "narrower layout for thermal-printer widths".
    expect(RECEIPT_TEMPLATES.compact.paperWidthMm).toBe(58)
    expect(RECEIPT_TEMPLATES.classic.paperWidthMm).toBe(80)
  })

  it.each([
    ['58', 58],
    ['80', 80],
  ])('accepts ?paper=%s', (input, expected) => {
    expect(findReceiptPaperWidth(input)).toBe(expected)
  })

  it.each([undefined, '', '57', '100', 'wide', '58mm'])('rejects ?paper=%s', (input) => {
    expect(findReceiptPaperWidth(input)).toBeNull()
  })
})
