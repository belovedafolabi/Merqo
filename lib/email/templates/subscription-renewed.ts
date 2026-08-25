import type { EmailMessage } from '../types'

/**
 * The renewal receipt email. Copied structurally from
 * ./subscription-expiring.ts. A discrete, non-recurring event — see
 * public.notify_subscription_renewed()'s null dedupe_key.
 */

export interface SubscriptionRenewedEmailInput {
  organizationName: string
  newPeriodEnd: string
  href: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderSubscriptionRenewedEmail(
  input: SubscriptionRenewedEmailInput,
): Pick<EmailMessage, 'subject' | 'html' | 'text'> {
  const { organizationName, newPeriodEnd, href } = input
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const fullUrl = `${appUrl}${href}`
  const renewedUntil = new Date(newPeriodEnd).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0a0a0a;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;">
        Subscription renewed
      </h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
        ${escapeHtml(organizationName)}'s subscription is now active until
        <strong>${escapeHtml(renewedUntil)}</strong>. Thank you.
      </p>
      <a href="${escapeHtml(fullUrl)}"
         style="display:inline-block;padding:12px 20px;background:#059669;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
        View subscription
      </a>
    </div>
  </body>
</html>`

  const text = [
    `${organizationName}'s subscription is now active until ${renewedUntil}. Thank you.`,
    '',
    'View subscription:',
    fullUrl,
  ].join('\n')

  return {
    subject: 'Subscription renewed',
    html,
    text,
  }
}
