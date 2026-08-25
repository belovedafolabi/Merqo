import type { EmailMessage } from '../types'

/**
 * The 7-day expiry warning email
 * (docs/milestones/13-subscription-billing-and-platform-admin.md Scope:
 * "Expiry warning: 7 days before expiry, dashboard banner + email"). Copied
 * structurally from ../low-stock-alert.ts's pattern.
 */

export interface SubscriptionExpiringEmailInput {
  organizationName: string
  daysRemaining: number
  currentPeriodEnd: string
  priceMinor: number
  currency: string
  href: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderSubscriptionExpiringEmail(
  input: SubscriptionExpiringEmailInput,
): Pick<EmailMessage, 'subject' | 'html' | 'text'> {
  const { organizationName, daysRemaining, currentPeriodEnd, href } = input
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const fullUrl = `${appUrl}${href}`
  const dayWord = daysRemaining === 1 ? 'day' : 'days'
  const expiryDate = new Date(currentPeriodEnd).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0a0a0a;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;">
        Your subscription expires in ${daysRemaining} ${dayWord}
      </h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
        ${escapeHtml(organizationName)}'s subscription expires on
        <strong>${escapeHtml(expiryDate)}</strong>. Renew now to avoid losing access to Merqo.
      </p>
      <a href="${escapeHtml(fullUrl)}"
         style="display:inline-block;padding:12px 20px;background:#059669;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
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
    `${organizationName}'s subscription expires on ${expiryDate} (${daysRemaining} ${dayWord} from now).`,
    '',
    'Renew subscription:',
    fullUrl,
  ].join('\n')

  return {
    subject: `Your subscription expires in ${daysRemaining} ${dayWord}`,
    html,
    text,
  }
}
