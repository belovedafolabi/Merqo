import { describe, expect, it } from 'vitest'

import {
  canCoverAmount,
  deriveLayawayAmountPaid,
  deriveLayawayOutstanding,
  deriveStoreCreditBalance,
  isLayawaySettled,
} from '@/lib/customers/ledger'

/**
 * Milestone 09's balance-derivation coverage (docs/milestones/09-customer-
 * store-credit-and-layaway.md Testing Requirements: "Unit tests:
 * balance-derivation logic for both ledgers, including edge cases (zero
 * balance, exact-balance usage, overdraw attempt rejected)").
 *
 * These are the pure counterpart to the database-side guarantees in
 * tests/integration/customers.test.ts: the arithmetic is proven here, the
 * locking and rejection behaviour under concurrency is proven there. Neither
 * suite duplicates the other.
 */

describe('deriveStoreCreditBalance()', () => {
  it('is zero for a customer with no entries', () => {
    expect(deriveStoreCreditBalance([])).toBe(0)
  })

  it('sums signed entries — issues add, spends subtract', () => {
    expect(deriveStoreCreditBalance([{ amount: 5000 }, { amount: -1500 }, { amount: 250 }])).toBe(
      3750,
    )
  })

  it('lands exactly on zero when everything issued has been spent', () => {
    expect(deriveStoreCreditBalance([{ amount: 2000 }, { amount: -2000 }])).toBe(0)
  })

  it('is order-independent — the same entries in any sequence give the same balance', () => {
    const entries = [{ amount: 1200 }, { amount: -300 }, { amount: 450 }, { amount: -1000 }]
    const reversed = [...entries].reverse()
    expect(deriveStoreCreditBalance(entries)).toBe(deriveStoreCreditBalance(reversed))
  })

  it('rounds to the cent rather than accumulating float drift', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE-754; the balance must still read as 0.30.
    expect(deriveStoreCreditBalance([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3)
  })

  it('never reports a negative balance', () => {
    // The database rejects an overdraw outright, so this state should be
    // unreachable — floored defensively so a display can never show a
    // customer "owing" the shop store credit.
    expect(deriveStoreCreditBalance([{ amount: 100 }, { amount: -500 }])).toBe(0)
  })
})

describe('canCoverAmount()', () => {
  it('accepts a balance larger than the amount', () => {
    expect(canCoverAmount(5000, 1200)).toBe(true)
  })

  it('accepts an exact-balance spend', () => {
    expect(canCoverAmount(2500, 2500)).toBe(true)
  })

  it('rejects an overdraw, including by a single cent', () => {
    expect(canCoverAmount(2500, 2500.01)).toBe(false)
    expect(canCoverAmount(0, 0.01)).toBe(false)
  })

  it('rejects any spend against a zero balance', () => {
    expect(canCoverAmount(0, 1)).toBe(false)
  })
})

describe('deriveLayawayAmountPaid()', () => {
  it('is zero before any instalment', () => {
    expect(deriveLayawayAmountPaid([])).toBe(0)
  })

  it('sums every instalment', () => {
    expect(
      deriveLayawayAmountPaid([{ amount: 100000 }, { amount: 150000 }, { amount: 100000 }]),
    ).toBe(350000)
  })
})

describe('deriveLayawayOutstanding()', () => {
  it('is the full total before any payment', () => {
    expect(deriveLayawayOutstanding(500000, [])).toBe(500000)
  })

  it('tracks the corpus worked example (docs/Customer Management_… §24)', () => {
    // ₦500,000 original, three instalments of 100k/150k/100k → ₦150,000 left.
    expect(
      deriveLayawayOutstanding(500000, [
        { amount: 100000 },
        { amount: 150000 },
        { amount: 100000 },
      ]),
    ).toBe(150000)
  })

  it('reaches exactly zero on the final instalment', () => {
    expect(deriveLayawayOutstanding(500000, [{ amount: 200000 }, { amount: 300000 }])).toBe(0)
  })

  it('never reports a negative outstanding balance', () => {
    // record_layaway_payment() rejects an overpayment, so this is defensive
    // only — a display must never show a negative amount owed.
    expect(deriveLayawayOutstanding(1000, [{ amount: 1500 }])).toBe(0)
  })
})

describe('isLayawaySettled()', () => {
  it('is false while anything is outstanding, even one cent', () => {
    expect(isLayawaySettled(1000, [{ amount: 999.99 }])).toBe(false)
  })

  it('is true only once the balance reaches zero', () => {
    expect(isLayawaySettled(1000, [{ amount: 400 }, { amount: 600 }])).toBe(true)
  })

  it('is false for a brand-new layaway with no payments', () => {
    expect(isLayawaySettled(1000, [])).toBe(false)
  })
})
