import type { EmailMessage } from '../types'

/**
 * The low-stock alert email — Milestone 12's first non-invitation template,
 * copied structurally from ./employee-invitation.ts per that file's own
 * comment ("a second one arrives in Milestone 12, at which point this file
 * is the pattern to copy, not the thing to replace"). Same reasoning: pure,
 * hand-written inline-styled HTML, no external stylesheet, no React email
 * renderer for one message.
 *
 * DELIBERATELY CARRIES NO cost_price, base_price, MARGIN, OR ANY OTHER
 * FINANCIAL FIGURE. The milestone's Security Requirement is explicit ("a
 * low-stock email doesn't need to include unrelated financial figures") —
 * this input type physically cannot be given one, so the constraint holds by
 * construction rather than by remembering not to pass it.
 */

export interface LowStockAlertEmailInput {
  productName: string
  sku: string | null
  branchName: string
  quantity: number
  threshold: number
  href: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderLowStockAlertEmail(
  input: LowStockAlertEmailInput,
): Pick<EmailMessage, 'subject' | 'html' | 'text'> {
  const { productName, sku, branchName, quantity, threshold, href } = input
  const skuLine = sku ? ` (SKU ${escapeHtml(sku)})` : ''
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const fullUrl = `${appUrl}${href}`

  // Every value here is organization-supplied data (a product name, a branch
  // name), so all of it is escaped exactly like the invitation template.
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0a0a0a;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;">
        ${escapeHtml(productName)} is low on stock
      </h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
        ${escapeHtml(productName)}${skuLine} at <strong>${escapeHtml(branchName)}</strong> has
        <strong>${quantity}</strong> available, at or below its configured threshold of
        <strong>${threshold}</strong>.
      </p>
      <a href="${escapeHtml(fullUrl)}"
         style="display:inline-block;padding:12px 20px;background:#059669;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
        View inventory
      </a>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#525252;">
        If the button does not work, paste this link into your browser:
        <br />
        <span style="word-break:break-all;">${escapeHtml(fullUrl)}</span>
      </p>
      <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#525252;">
        You are receiving this because you can restock inventory at this branch. You can turn off
        inventory email alerts from Settings &rarr; Notifications.
      </p>
    </div>
  </body>
</html>`

  const text = [
    `${productName}${sku ? ` (SKU ${sku})` : ''} at ${branchName} has ${quantity} available, at or below its threshold of ${threshold}.`,
    '',
    'View inventory:',
    fullUrl,
    '',
    'You are receiving this because you can restock inventory at this branch. You can turn off inventory email alerts from Settings -> Notifications.',
  ].join('\n')

  return {
    subject: `${productName} is low on stock at ${branchName}`,
    html,
    text,
  }
}
