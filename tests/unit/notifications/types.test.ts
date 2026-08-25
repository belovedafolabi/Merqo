import { describe, expect, it } from 'vitest'

import { renderNotificationEmail, type NotificationEmailData } from '@/lib/notifications/templates'
import { NOTIFICATION_CATEGORIES, NOTIFICATION_TYPES } from '@/lib/notifications/types'

/**
 * Keeps the TS catalogue (lib/notifications/types.ts) honest against the two
 * other places its shape is assumed: the email dispatch table
 * (lib/notifications/templates.ts) and the RLS mandatory-category rule
 * (notification_preferences_update_self,
 * 20260824100300_alter_notification_preferences_add_policies.sql). A drift
 * between any of these is a silent bug — a type marked email-eligible with
 * no template throws at send time, and a mandatory set that disagrees with
 * the database means the UI and the actual enforcement diverge.
 */
describe('lib/notifications/types', () => {
  it('every NotificationType maps to a real category', () => {
    for (const definition of Object.values(NOTIFICATION_TYPES)) {
      expect(NOTIFICATION_CATEGORIES).toHaveProperty(definition.category)
    }
  })

  it('mandatory categories are exactly security and billing', () => {
    const mandatory = Object.entries(NOTIFICATION_CATEGORIES)
      .filter(([, definition]) => definition.mandatory)
      .map(([category]) => category)
      .sort()

    expect(mandatory).toEqual(['billing', 'security'])
  })

  it('every email-eligible type has a renderNotificationEmail() branch', () => {
    const sampleData: Record<NotificationEmailData['type'], NotificationEmailData['data']> = {
      'employee.invited': {
        inviteUrl: 'https://example.com/invite/abc',
        organizationName: 'Acme',
        roleName: 'Cashier',
        inviterName: 'Jane',
        expiresAt: new Date('2026-01-01'),
      },
      'inventory.low_stock': {
        productName: 'Widget',
        sku: 'W-1',
        branchName: 'Main',
        quantity: 1,
        threshold: 5,
        href: '/inventory',
      },
      'employee.role_changed': {
        roleName: 'Manager',
        organizationName: 'Acme',
        href: '/settings/organization',
      },
      'subscription.expiring': {
        organizationName: 'Acme',
        daysRemaining: 7,
        currentPeriodEnd: '2026-09-01T00:00:00.000Z',
        priceMinor: 500000,
        currency: 'NGN',
        href: '/settings/subscription',
      },
      'subscription.expired': {
        organizationName: 'Acme',
        href: '/settings/subscription',
      },
      'subscription.renewed': {
        organizationName: 'Acme',
        newPeriodEnd: '2026-09-25T00:00:00.000Z',
        href: '/settings/subscription',
      },
    }

    for (const [type, definition] of Object.entries(NOTIFICATION_TYPES)) {
      if (!definition.email) continue

      const data = sampleData[type as NotificationEmailData['type']]
      const rendered = renderNotificationEmail({ type, data } as NotificationEmailData)
      expect(rendered.subject.length).toBeGreaterThan(0)
      expect(rendered.html.length).toBeGreaterThan(0)
      expect(rendered.text.length).toBeGreaterThan(0)
    }
  })
})
