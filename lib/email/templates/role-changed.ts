import type { EmailMessage } from '../types'

/**
 * The role-changed email — Milestone 12's basic security-trigger template.
 * Same pure, hand-written, inline-styled shape as ./employee-invitation.ts
 * and ./low-stock-alert.ts. Full depth (a diff of exactly which permissions
 * changed, suspicious-activity context) is Milestone 15's scope; this is
 * deliberately the minimal "something about your access changed, here's
 * what" notice.
 */

export interface RoleChangedEmailInput {
  roleName: string
  organizationName: string
  href: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderRoleChangedEmail(
  input: RoleChangedEmailInput,
): Pick<EmailMessage, 'subject' | 'html' | 'text'> {
  const { roleName, organizationName, href } = input
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const fullUrl = `${appUrl}${href}`

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0a0a0a;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;">
        Your role has changed
      </h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
        You were assigned the <strong>${escapeHtml(roleName)}</strong> role in
        <strong>${escapeHtml(organizationName)}</strong>.
      </p>
      <a href="${escapeHtml(fullUrl)}"
         style="display:inline-block;padding:12px 20px;background:#059669;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
        Review your account
      </a>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#525252;">
        If the button does not work, paste this link into your browser:
        <br />
        <span style="word-break:break-all;">${escapeHtml(fullUrl)}</span>
      </p>
      <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#525252;">
        If you were not expecting this change, contact your organization's owner or administrator.
        Security notifications cannot be turned off.
      </p>
    </div>
  </body>
</html>`

  const text = [
    `You were assigned the ${roleName} role in ${organizationName}.`,
    '',
    'Review your account:',
    fullUrl,
    '',
    "If you were not expecting this change, contact your organization's owner or administrator.",
    'Security notifications cannot be turned off.',
  ].join('\n')

  return {
    subject: `Your role has changed in ${organizationName}`,
    html,
    text,
  }
}
