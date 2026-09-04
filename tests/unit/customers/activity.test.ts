import { describe, expect, it } from 'vitest'

import {
  assembleCustomerActivity,
  type ActivityLayawayRow,
  type ActivitySaleRow,
} from '@/lib/customers/queries'
import type { StoreCreditEntryRecord } from '@/lib/customers/queries'

/**
 * Milestone 17 Part D. The customer activity table's rows are click targets:
 * `sale` and `return` open a receipt, `layaway` opens its detail page,
 * `store_credit` is inert. What makes that possible is the `saleId` this
 * assembly attaches — and specifically that a `return` row carries the
 * *parent* sale's id, since the receipt view renders the return against the
 * original sale, not against a "return receipt" that doesn't exist.
 */

const sale = (over: Partial<ActivitySaleRow> = {}): ActivitySaleRow => ({
  id: 'sale-1',
  total: 1500,
  created_at: '2026-09-02T10:00:00Z',
  returns: null,
  ...over,
})

const layaway = (over: Partial<ActivityLayawayRow> = {}): ActivityLayawayRow => ({
  id: 'lay-1',
  reference: 'LAY-0001',
  total_amount: 5000,
  status: 'active',
  created_at: '2026-09-01T09:00:00Z',
  ...over,
})

const creditEntry = (over: Partial<StoreCreditEntryRecord> = {}): StoreCreditEntryRecord =>
  ({
    id: 'cr-1',
    entryType: 'issue',
    amount: 1000,
    balanceAfter: 1000,
    reason: null,
    createdAt: '2026-09-03T08:00:00Z',
    ...over,
  }) as StoreCreditEntryRecord

describe('assembleCustomerActivity', () => {
  it('gives a sale row its own id as saleId', () => {
    const [row] = assembleCustomerActivity([sale({ id: 'sale-42' })], [], [])
    expect(row).toMatchObject({ kind: 'sale', id: 'sale-42', saleId: 'sale-42' })
  })

  it("gives a return row the PARENT sale's id, not the return's own id", () => {
    const rows = assembleCustomerActivity(
      [
        sale({
          id: 'sale-7',
          returns: [{ id: 'return-99', reason: 'Damaged', created_at: '2026-09-02T12:00:00Z' }],
        }),
      ],
      [],
      [],
    )

    const returnRow = rows.find((r) => r.kind === 'return')
    expect(returnRow).toBeDefined()
    expect(returnRow!.id).toBe('return-99')
    expect(returnRow!.saleId).toBe('sale-7')
  })

  it('leaves store_credit rows without a saleId', () => {
    const [row, ...rest] = assembleCustomerActivity([], [creditEntry()], [])
    expect(rest).toHaveLength(0)
    expect(row?.kind).toBe('store_credit')
    expect(row?.saleId).toBeUndefined()
  })

  it('leaves layaway rows without a saleId (they link via their own id)', () => {
    const [row] = assembleCustomerActivity([], [], [layaway({ id: 'lay-88' })])
    expect(row).toMatchObject({ kind: 'layaway', id: 'lay-88' })
    expect(row?.saleId).toBeUndefined()
  })

  it('interleaves all four sources newest-first and honours the limit', () => {
    const rows = assembleCustomerActivity(
      [
        sale({
          id: 'sale-a',
          created_at: '2026-09-02T10:00:00Z',
          returns: [{ id: 'ret-a', reason: 'x', created_at: '2026-09-04T10:00:00Z' }],
        }),
      ],
      [creditEntry({ id: 'cr-a', createdAt: '2026-09-03T08:00:00Z' })],
      [layaway({ id: 'lay-a', created_at: '2026-09-01T09:00:00Z' })],
      3,
    )

    expect(rows.map((r) => r.kind)).toEqual(['return', 'store_credit', 'sale'])
  })
})
