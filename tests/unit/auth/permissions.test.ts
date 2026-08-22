import { describe, expect, it } from 'vitest'

import { resolvePermission, type ScopeGrant } from '@/lib/auth/permissions'

const ORG_A = 'org-a'
const ORG_B = 'org-b'
const BRANCH_WUSE = 'branch-wuse'
const BRANCH_GARKI = 'branch-garki'
const BU_PHARMACY = 'bu-pharmacy'
const BU_SUPERMARKET = 'bu-supermarket'

function grant(overrides: Partial<ScopeGrant> = {}): ScopeGrant {
  return {
    permissionKey: 'branches.view',
    organizationId: ORG_A,
    branchId: null,
    businessUnitId: null,
    ...overrides,
  }
}

describe('resolvePermission', () => {
  it('denies when no grant matches the permission key at all', () => {
    const grants = [grant({ permissionKey: 'branches.update' })]
    expect(resolvePermission(grants, 'branches.view', { organizationId: ORG_A })).toBe(false)
  })

  it('denies across organizations even with the same permission key', () => {
    const grants = [grant({ organizationId: ORG_A })]
    expect(resolvePermission(grants, 'branches.view', { organizationId: ORG_B })).toBe(false)
  })

  it('an org-wide grant (branchId null) allows an org-level check', () => {
    const grants = [grant({ organizationId: ORG_A, branchId: null })]
    expect(resolvePermission(grants, 'branches.view', { organizationId: ORG_A })).toBe(true)
  })

  it('an org-wide grant allows any branch-scoped check under that org', () => {
    const grants = [grant({ organizationId: ORG_A, branchId: null })]
    expect(
      resolvePermission(grants, 'branches.view', { organizationId: ORG_A, branchId: BRANCH_WUSE }),
    ).toBe(true)
    expect(
      resolvePermission(grants, 'branches.view', { organizationId: ORG_A, branchId: BRANCH_GARKI }),
    ).toBe(true)
  })

  it('a branch-scoped grant denies an org-level check with no branch specified', () => {
    const grants = [grant({ organizationId: ORG_A, branchId: BRANCH_WUSE })]
    expect(resolvePermission(grants, 'branches.view', { organizationId: ORG_A })).toBe(false)
  })

  it('a branch-scoped grant allows only that exact branch, denies the other', () => {
    const grants = [grant({ organizationId: ORG_A, branchId: BRANCH_WUSE })]
    expect(
      resolvePermission(grants, 'branches.view', { organizationId: ORG_A, branchId: BRANCH_WUSE }),
    ).toBe(true)
    expect(
      resolvePermission(grants, 'branches.view', { organizationId: ORG_A, branchId: BRANCH_GARKI }),
    ).toBe(false)
  })

  it('a branch-wide grant (business_unit_id null) allows any business unit under that branch', () => {
    const grants = [
      grant({
        permissionKey: 'business_units.view',
        organizationId: ORG_A,
        branchId: BRANCH_WUSE,
        businessUnitId: null,
      }),
    ]
    expect(
      resolvePermission(grants, 'business_units.view', {
        organizationId: ORG_A,
        branchId: BRANCH_WUSE,
        businessUnitId: BU_PHARMACY,
      }),
    ).toBe(true)
  })

  it('a business-unit-scoped grant denies a sibling business unit in the same branch', () => {
    const grants = [
      grant({
        permissionKey: 'business_units.view',
        organizationId: ORG_A,
        branchId: BRANCH_WUSE,
        businessUnitId: BU_PHARMACY,
      }),
    ]
    expect(
      resolvePermission(grants, 'business_units.view', {
        organizationId: ORG_A,
        branchId: BRANCH_WUSE,
        businessUnitId: BU_SUPERMARKET,
      }),
    ).toBe(false)
  })

  it('a user with two roles at two different scopes is allowed at either scope, denied outside both', () => {
    // e.g. Branch Manager @ Wuse + Cashier @ Garki's Pharmacy business unit.
    const grants: ScopeGrant[] = [
      grant({
        permissionKey: 'business_units.update',
        organizationId: ORG_A,
        branchId: BRANCH_WUSE,
      }),
      grant({
        permissionKey: 'business_units.update',
        organizationId: ORG_A,
        branchId: BRANCH_GARKI,
        businessUnitId: BU_PHARMACY,
      }),
    ]

    expect(
      resolvePermission(grants, 'business_units.update', {
        organizationId: ORG_A,
        branchId: BRANCH_WUSE,
        businessUnitId: BU_SUPERMARKET,
      }),
    ).toBe(true)

    expect(
      resolvePermission(grants, 'business_units.update', {
        organizationId: ORG_A,
        branchId: BRANCH_GARKI,
        businessUnitId: BU_PHARMACY,
      }),
    ).toBe(true)

    expect(
      resolvePermission(grants, 'business_units.update', {
        organizationId: ORG_A,
        branchId: BRANCH_GARKI,
        businessUnitId: BU_SUPERMARKET,
      }),
    ).toBe(false)
  })

  it('an empty grant set denies everything', () => {
    expect(resolvePermission([], 'branches.view', { organizationId: ORG_A })).toBe(false)
  })
})
