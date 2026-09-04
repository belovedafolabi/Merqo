import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { openReceipt } from '@/lib/sales/receipt-window'

vi.mock('@/lib/sales/receipt-window', () => ({ openReceipt: vi.fn() }))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import { ActivityDateCell } from '@/components/customers/customer-detail-view'
import type { CustomerActivityEntry } from '@/lib/customers/queries'

const mockOpenReceipt = vi.mocked(openReceipt)

const base = {
  occurredAt: '2026-09-02T10:00:00Z',
  description: 'x',
  amount: null,
} as const

afterEach(() => {
  cleanup()
  mockOpenReceipt.mockClear()
})

/**
 * Milestone 17 Part D. The click behaviour of an activity row's first cell:
 * sale/return open a receipt, layaway navigates, store_credit is inert.
 */
describe('ActivityDateCell', () => {
  it('renders a sale row as a button that opens that sale receipt', () => {
    const row: CustomerActivityEntry = {
      ...base,
      id: 's1',
      kind: 'sale',
      amount: 100,
      saleId: 's1',
    }
    render(<ActivityDateCell row={row} />)

    const button = screen.getByRole('button')
    button.click()
    expect(mockOpenReceipt).toHaveBeenCalledWith('s1')
  })

  it("renders a return row as a button that opens the PARENT sale's receipt", () => {
    const row: CustomerActivityEntry = { ...base, id: 'r1', kind: 'return', saleId: 'parent-sale' }
    render(<ActivityDateCell row={row} />)

    screen.getByRole('button').click()
    expect(mockOpenReceipt).toHaveBeenCalledWith('parent-sale')
  })

  it('renders a layaway row as a link to its detail page', () => {
    const row: CustomerActivityEntry = { ...base, id: 'lay-9', kind: 'layaway', amount: 500 }
    render(<ActivityDateCell row={row} />)

    expect(screen.getByRole('link')).toHaveAttribute('href', '/layaways/lay-9')
  })

  it('renders a store_credit row as plain text with no interactive element', () => {
    const row: CustomerActivityEntry = { ...base, id: 'cr1', kind: 'store_credit', amount: 250 }
    render(<ActivityDateCell row={row} />)

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
