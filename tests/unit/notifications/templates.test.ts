import { describe, expect, it } from 'vitest'

import { renderLowStockAlertEmail } from '@/lib/email/templates/low-stock-alert'
import { renderRoleChangedEmail } from '@/lib/email/templates/role-changed'

/**
 * Milestone 12's Security Requirements, asserted mechanically rather than by
 * review: "email templates never leak sensitive data" and "notification
 * content is treated as system-generated... avoiding any injection risk in
 * email rendering."
 */
describe('lib/email/templates/low-stock-alert', () => {
  const XSS_NAME = '<script>alert(1)</script>'

  it('escapes an organization-supplied product name in html', () => {
    const { html } = renderLowStockAlertEmail({
      productName: XSS_NAME,
      sku: 'SKU-1',
      branchName: 'Main Branch',
      quantity: 2,
      threshold: 10,
      href: '/inventory?branchId=abc',
    })

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('text carries product, branch, quantity, and threshold — what the log transport and screen readers see', () => {
    const { text } = renderLowStockAlertEmail({
      productName: 'Coca-Cola 50cl',
      sku: 'CC-50',
      branchName: 'Wuse Branch',
      quantity: 3,
      threshold: 10,
      href: '/inventory?branchId=abc',
    })

    expect(text).toContain('Coca-Cola 50cl')
    expect(text).toContain('Wuse Branch')
    expect(text).toContain('3')
    expect(text).toContain('10')
  })

  it('carries no financial figure — the input type has nowhere to put one', () => {
    const { html, text } = renderLowStockAlertEmail({
      productName: 'Widget',
      sku: null,
      branchName: 'Main',
      quantity: 1,
      threshold: 5,
      href: '/inventory',
    })

    // Word-boundary phrases, not bare substrings — the template's own inline
    // CSS legitimately contains "margin:0", which a bare `.toContain('margin')`
    // would flag as a false positive.
    for (const forbidden of ['cost price', 'profit margin', 'base price', '₦']) {
      expect(html.toLowerCase()).not.toContain(forbidden)
      expect(text.toLowerCase()).not.toContain(forbidden)
    }
    // No currency-formatted dollar amount (a bare inline-CSS "$" never
    // appears, so this pattern only matches an actual price).
    expect(text).not.toMatch(/\$\d/)
  })
})

describe('lib/email/templates/role-changed', () => {
  it('escapes an organization-supplied role/organization name', () => {
    const { html } = renderRoleChangedEmail({
      roleName: '<img src=x onerror=alert(1)>',
      organizationName: 'Acme',
      href: '/settings/organization',
    })

    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img')
  })
})
