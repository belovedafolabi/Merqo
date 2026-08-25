import type { EmailMessage } from '@/lib/email/types'
import {
  renderEmployeeInvitationEmail,
  type EmployeeInvitationEmailInput,
} from '@/lib/email/templates/employee-invitation'
import {
  renderLowStockAlertEmail,
  type LowStockAlertEmailInput,
} from '@/lib/email/templates/low-stock-alert'
import {
  renderRoleChangedEmail,
  type RoleChangedEmailInput,
} from '@/lib/email/templates/role-changed'

/**
 * The one dispatch point from a NotificationType to its rendered email.
 *
 * THE ONLY MODULE OUTSIDE lib/email/** ALLOWED TO IMPORT
 * @/lib/email/templates/*. tests/unit/email/layering.test.ts enforces this
 * mechanically: every other caller reaches an email template through
 * lib/notifications/service.ts's deliverEmail()/notifyUser(), never
 * directly, which is what keeps "one shared EmailService/NotificationService
 * layer" (docs/TAS.md §33) true as the catalogue grows.
 */
export type NotificationEmailData =
  | { type: 'employee.invited'; data: EmployeeInvitationEmailInput }
  | { type: 'inventory.low_stock'; data: LowStockAlertEmailInput }
  | { type: 'employee.role_changed'; data: RoleChangedEmailInput }

export function renderNotificationEmail(
  input: NotificationEmailData,
): Pick<EmailMessage, 'subject' | 'html' | 'text'> {
  switch (input.type) {
    case 'employee.invited':
      return renderEmployeeInvitationEmail(input.data)
    case 'inventory.low_stock':
      return renderLowStockAlertEmail(input.data)
    case 'employee.role_changed':
      return renderRoleChangedEmail(input.data)
  }
}

// tests/unit/notifications/types.test.ts asserts, at runtime, that every
// NotificationType with `email: true` in ./types.ts has a matching branch
// above — kept there rather than as a compile-time type assertion here,
// since an unused type alias is a lint error under this project's
// noUnusedLocals setting.
