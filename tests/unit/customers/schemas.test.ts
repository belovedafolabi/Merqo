import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  adjustStoreCreditInputSchema,
  cancelLayawayInputSchema,
  createLayawayInputSchema,
  customerInputSchema,
  issueStoreCreditInputSchema,
  recordLayawayPaymentInputSchema,
} from '@/lib/customers/schemas'

/**
 * Pure schema-validation coverage, same shape as tests/unit/sales/
 * schemas.test.ts — the schemas lib/customers/mutations.ts parses against,
 * no database needed.
 */
describe('customerInputSchema', () => {
  it('accepts a name-only customer — the quick-add case at a till', () => {
    expect(customerInputSchema.safeParse({ name: 'Adaeze Okonkwo' }).success).toBe(true)
  })

  it('rejects a customer with no name', () => {
    expect(customerInputSchema.safeParse({ name: '   ' }).success).toBe(false)
  })

  it('accepts locally-written Nigerian phone formats', () => {
    for (const phone of ['08031234567', '0803 123 4567', '+234 803 123 4567']) {
      expect(customerInputSchema.safeParse({ name: 'Ada', phone }).success).toBe(true)
    }
  })

  it('rejects a malformed email but treats an empty one as absent', () => {
    expect(customerInputSchema.safeParse({ name: 'Ada', email: 'not-an-email' }).success).toBe(
      false,
    )

    const blank = customerInputSchema.safeParse({ name: 'Ada', email: '' })
    expect(blank.success).toBe(true)
    expect(blank.success && blank.data.email).toBeUndefined()
  })
})

describe('issueStoreCreditInputSchema', () => {
  const base = { customerId: randomUUID(), amount: 2500, reason: 'Goodwill gesture' }

  it('accepts a positive issue with a reason', () => {
    expect(issueStoreCreditInputSchema.safeParse(base).success).toBe(true)
  })

  it('rejects a zero or negative issue — issuing is always positive', () => {
    expect(issueStoreCreditInputSchema.safeParse({ ...base, amount: 0 }).success).toBe(false)
    expect(issueStoreCreditInputSchema.safeParse({ ...base, amount: -500 }).success).toBe(false)
  })

  it('requires a reason', () => {
    expect(issueStoreCreditInputSchema.safeParse({ ...base, reason: '' }).success).toBe(false)
  })
})

describe('adjustStoreCreditInputSchema', () => {
  const base = { customerId: randomUUID(), amount: -500, reason: 'Duplicate credit on 12 Aug' }

  it('accepts a negative adjustment — a correction can go either way', () => {
    expect(adjustStoreCreditInputSchema.safeParse(base).success).toBe(true)
  })

  it('accepts a positive adjustment', () => {
    expect(adjustStoreCreditInputSchema.safeParse({ ...base, amount: 500 }).success).toBe(true)
  })

  it('rejects a zero adjustment — an entry that changes nothing is a mistake', () => {
    expect(adjustStoreCreditInputSchema.safeParse({ ...base, amount: 0 }).success).toBe(false)
  })
})

describe('createLayawayInputSchema', () => {
  const base = {
    customerId: randomUUID(),
    branchId: randomUUID(),
    businessUnitId: randomUUID(),
    items: [{ productId: randomUUID(), quantity: 1 }],
  }

  it('accepts a minimal valid layaway', () => {
    expect(createLayawayInputSchema.safeParse(base).success).toBe(true)
  })

  it('rejects a layaway with no items', () => {
    expect(createLayawayInputSchema.safeParse({ ...base, items: [] }).success).toBe(false)
  })

  it('rejects a zero-quantity item', () => {
    expect(
      createLayawayInputSchema.safeParse({
        ...base,
        items: [{ productId: base.items[0]!.productId, quantity: 0 }],
      }).success,
    ).toBe(false)
  })

  it('has no total field — the total is derived server-side, never supplied', () => {
    const parsed = createLayawayInputSchema.parse(base)
    expect(parsed).not.toHaveProperty('totalAmount')
  })
})

describe('recordLayawayPaymentInputSchema', () => {
  const base = { layawayId: randomUUID(), amount: 100000, method: 'cash' as const }

  it('accepts a positive cash instalment', () => {
    expect(recordLayawayPaymentInputSchema.safeParse(base).success).toBe(true)
  })

  it('rejects a zero or negative instalment', () => {
    expect(recordLayawayPaymentInputSchema.safeParse({ ...base, amount: 0 }).success).toBe(false)
    expect(recordLayawayPaymentInputSchema.safeParse({ ...base, amount: -1 }).success).toBe(false)
  })

  it('rejects store credit as a layaway payment method', () => {
    // Deliberately excluded — see 20260823130500_create_layaway_payments.sql
    // for why a layaway instalment must not silently draw down the
    // store-credit ledger.
    expect(
      recordLayawayPaymentInputSchema.safeParse({ ...base, method: 'store_credit' }).success,
    ).toBe(false)
  })
})

describe('cancelLayawayInputSchema', () => {
  it('requires a reason to cancel', () => {
    const layawayId = randomUUID()
    expect(cancelLayawayInputSchema.safeParse({ layawayId, reason: '' }).success).toBe(false)
    expect(
      cancelLayawayInputSchema.safeParse({ layawayId, reason: 'Customer changed their mind' })
        .success,
    ).toBe(true)
  })
})
