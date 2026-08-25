import { randomUUID } from 'node:crypto'

/**
 * Generates OUR OWN Paystack transaction reference at checkout initiation —
 * never one Paystack assigns. See subscription_payments' table comment
 * (20260825100200) for why this is load-bearing: the webhook/callback
 * settlement path resolves organization/subscription/expected-amount from
 * the row keyed by this reference, never trusting Paystack's metadata for
 * identity.
 *
 * Prefixed and namespaced by organization so a reference is recognizable as
 * this deployment's own in Paystack's dashboard, alongside any other
 * merchant using the same shared Paystack account structure.
 */
export function newPaymentReference(organizationId: string): string {
  return `sub_${organizationId.slice(0, 8)}_${randomUUID()}`
}
