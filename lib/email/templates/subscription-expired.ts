import type { EmailMessage } from '../types'

/**
 * The lockout notice email
 * (docs/milestones/13-subscription-billing-and-platform-admin.md Scope: "On
 * expiry ... application locked ... a clear message directing the Owner to
 * renew"). Copied structurally from ./subscription-expiring.ts.
 */

export interface SubscriptionExpiredEmailInput {
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

export function renderSubscriptionExpiredEmail(
  input: SubscriptionExpiredEmailInput,
): Pick<EmailMessage, 'subject' | 'html' | 'text'> {
  const { organizationName, href } = input
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const fullUrl = `${appUrl}${href}`

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0a0a0a;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;">
        Your subscription has expired
      </h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
        ${escapeHtml(organizationName)}'s subscription has expired and access is now locked.
        Renew now to restore access for your team.
      </p>
      <a href="${escapeHtml(fullUrl)}"
         style="display:inline-block;padding:12px 20px;background:#dc2626;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
        Renew subscription
      </a>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#525252;">
        If the button does not work, paste this link into your browser:
        <br />
        <span style="word-break:break-all;">${escapeHtml(fullUrl)}</span>
      </p>
    </div>
  </body>
</html>`

  const text = [
    `${organizationName}'s subscription has expired and access is now locked.`,
    '',
    'Renew subscription:',
    fullUrl,
  ].join('\n')

  return {
    subject: 'Your subscription has expired — access is locked',
    html,
    text,
  }
}
