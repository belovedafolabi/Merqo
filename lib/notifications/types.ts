/**
 * The notification catalogue — the single place a notification's category,
 * defaults, and email eligibility are declared. Adding a Milestone 13/15
 * event type is one entry here plus one branch in lib/notifications/
 * templates.ts if it sends email; nothing else in this file changes.
 *
 * Kept deliberately coarse (per-category, not per-type) per the milestone's
 * Implementation Notes — `NotificationCategory` is what a user's preferences
 * actually toggle; `NotificationType` is finer only for routing to the right
 * copy and email template.
 */

export type NotificationCategory = 'inventory' | 'administration' | 'security' | 'billing'

export type NotificationType = 'inventory.low_stock' | 'employee.invited' | 'employee.role_changed'

export interface NotificationCategoryDefinition {
  readonly label: string
  readonly description: string
  /**
   * Non-disableable per the design corpus §15 ("some notifications should be
   * mandatory... security events, subscription expiry, account lock
   * events"). Mirrored — not just declared here — by the database: the RLS
   * UPDATE policy on notification_preferences
   * (20260824100300_alter_notification_preferences_add_policies.sql) rejects
   * a write that would turn either channel off for a mandatory category, so
   * this flag driving a disabled <Switch> is the friendly version of a rule
   * the database enforces regardless.
   */
  readonly mandatory: boolean
  readonly defaults: { inApp: boolean; email: boolean }
}

export const NOTIFICATION_CATEGORIES: Record<NotificationCategory, NotificationCategoryDefinition> = {
  inventory: {
    label: 'Inventory',
    description: 'Low-stock alerts for products at your branches.',
    mandatory: false,
    defaults: { inApp: true, email: true },
  },
  administration: {
    label: 'Administration',
    description: 'Employee, role, and organization changes.',
    mandatory: false,
    defaults: { inApp: true, email: false },
  },
  security: {
    label: 'Security',
    description: 'Role and permission changes affecting your account.',
    mandatory: true,
    defaults: { inApp: true, email: true },
  },
  billing: {
    label: 'Billing',
    description: 'Subscription and payment events.',
    mandatory: true,
    defaults: { inApp: true, email: true },
  },
}

export interface NotificationTypeDefinition {
  readonly category: NotificationCategory
  /** false = in-app only; no email template exists for this type. */
  readonly email: boolean
}

export const NOTIFICATION_TYPES: Record<NotificationType, NotificationTypeDefinition> = {
  'inventory.low_stock': { category: 'inventory', email: true },
  'employee.invited': { category: 'administration', email: true },
  'employee.role_changed': { category: 'security', email: true },
}
