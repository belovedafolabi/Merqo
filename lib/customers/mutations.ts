import { requirePermission } from '@/lib/auth/guard'
import { recordAuditEvent } from '@/lib/auth/audit'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { resolveEffectivePrice, resolveVariantPrice } from '@/lib/products/pricing'
import { calculateLineTotal } from '@/lib/sales/calculations'
import {
  customerInputSchema,
  issueStoreCreditInputSchema,
  adjustStoreCreditInputSchema,
  createLayawayInputSchema,
  recordLayawayPaymentInputSchema,
  cancelLayawayInputSchema,
  type CustomerInput,
  type IssueStoreCreditInput,
  type AdjustStoreCreditInput,
  type CreateLayawayInput,
  type RecordLayawayPaymentInput,
  type CancelLayawayInput,
} from '@/lib/customers/schemas'
import type { Customer } from '@/lib/customers/queries'

/**
 * The customer/store-credit/layaway mutations behind this milestone's Server
 * Actions — same `requirePermission() -> parse -> rpc -> recordAuditEvent()`
 * shape as lib/sales/mutations.ts and lib/inventory/mutations.ts. The real
 * atomicity, locking, and balance guarantees live in Postgres
 * (record_store_credit_entry()/create_layaway()/record_layaway_payment()/
 * cancel_layaway() in supabase/migrations/20260823130700_create_customer_
 * functions.sql) — these are permission-checked, price-resolving wrappers
 * around those RPCs, never a re-implementation of what they guarantee.
 *
 * Every mutation here writes an audit-log entry, per this milestone's
 * Observability section and its Security Requirements ("Store-credit
 * issuance and layaway creation are auditable, sensitive operations — every
 * ledger entry records the initiating user"). The ledger rows themselves
 * additionally carry `created_by` resolved inside the SECURITY DEFINER
 * functions from auth.uid(), so the initiating user is recorded in two
 * independent places, neither of which the caller can spoof.
 */

/**
 * `customers.customer_code` is generated here rather than by a database
 * sequence (see 20260823130000's own comment) so it can carry a readable
 * prefix. Date-plus-random rather than a monotonic counter: a counter would
 * need its own locked sequence row per organization for no benefit the
 * product asks for, and a gap in customer numbering is not a defect.
 * Uniqueness is guaranteed by the partial-unique index, not by this
 * function's optimism — a collision surfaces as an insert error rather than
 * a silent duplicate.
 */
function generateCustomerCode(): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `CUS-${random}`
}

function generateLayawayReference(): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `LAY-${random}`
}

export async function createCustomer(
  organizationId: string,
  input: CustomerInput,
): Promise<Customer> {
  const parsed = customerInputSchema.parse(input)
  const user = await requirePermission('customers.create', { organizationId })

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('customers')
    .insert({
      organization_id: organizationId,
      customer_code: generateCustomerCode(),
      name: parsed.name,
      phone: parsed.phone ?? null,
      email: parsed.email ?? null,
      address: parsed.address ?? null,
      notes: parsed.notes ?? null,
      created_by: user.id,
    })
    .select(
      'id, organization_id, customer_code, name, phone, email, address, notes, created_at, archived_at',
    )
    .single()
  if (error) throw error

  const row = data as {
    id: string
    organization_id: string
    customer_code: string
    name: string
    phone: string | null
    email: string | null
    address: string | null
    notes: string | null
    created_at: string
    archived_at: string | null
  }

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'customers.customer_created',
      resourceType: 'customer',
      resourceId: row.id,
      metadata: { customerCode: row.customer_code, name: row.name },
    },
    supabase,
  )

  return {
    id: row.id,
    organizationId: row.organization_id,
    customerCode: row.customer_code,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  }
}

export async function updateCustomer(
  organizationId: string,
  customerId: string,
  input: CustomerInput,
): Promise<void> {
  const parsed = customerInputSchema.parse(input)
  const user = await requirePermission('customers.update', { organizationId })

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('customers')
    .update({
      name: parsed.name,
      phone: parsed.phone ?? null,
      email: parsed.email ?? null,
      address: parsed.address ?? null,
      notes: parsed.notes ?? null,
    })
    .eq('id', customerId)
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'customers.customer_updated',
      resourceType: 'customer',
      resourceId: customerId,
      metadata: { name: parsed.name },
    },
    supabase,
  )
}

/** Archive, not delete — sales and ledger entries reference this row forever. */
export async function archiveCustomer(organizationId: string, customerId: string): Promise<void> {
  const user = await requirePermission('customers.update', { organizationId })

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('customers')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', customerId)
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'customers.customer_archived',
      resourceType: 'customer',
      resourceId: customerId,
    },
    supabase,
  )
}

export async function issueStoreCredit(
  organizationId: string,
  input: IssueStoreCreditInput,
): Promise<{ balanceAfter: number }> {
  const parsed = issueStoreCreditInputSchema.parse(input)
  const user = await requirePermission('store_credit.issue', { organizationId })

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('record_store_credit_entry', {
    p_customer_id: parsed.customerId,
    p_amount: parsed.amount,
    p_entry_type: 'issue',
    p_reason: parsed.reason,
    p_reference_type: null,
    p_reference_id: null,
  })
  if (error) throw error
  const entry = data as { balance_after: string | number }

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'customers.store_credit_issued',
      resourceType: 'customer',
      resourceId: parsed.customerId,
      metadata: {
        amount: parsed.amount,
        reason: parsed.reason,
        balanceAfter: Number(entry.balance_after),
      },
    },
    supabase,
  )

  return { balanceAfter: Number(entry.balance_after) }
}

/**
 * A correcting entry in either direction, with its own permission — the
 * closest thing in the product to minting money, so it is deliberately not
 * part of the till roles' grant (supabase/seed.sql section 5e). Never an
 * edit to an existing ledger row: this milestone's FR requires corrections
 * to happen "via a new ledger entry".
 */
export async function adjustStoreCredit(
  organizationId: string,
  input: AdjustStoreCreditInput,
): Promise<{ balanceAfter: number }> {
  const parsed = adjustStoreCreditInputSchema.parse(input)
  const user = await requirePermission('store_credit.adjust', { organizationId })

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('record_store_credit_entry', {
    p_customer_id: parsed.customerId,
    p_amount: parsed.amount,
    p_entry_type: 'adjustment',
    p_reason: parsed.reason,
    p_reference_type: null,
    p_reference_id: null,
  })
  if (error) throw error
  const entry = data as { balance_after: string | number }

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'customers.store_credit_adjusted',
      resourceType: 'customer',
      resourceId: parsed.customerId,
      metadata: {
        amount: parsed.amount,
        reason: parsed.reason,
        balanceAfter: Number(entry.balance_after),
      },
    },
    supabase,
  )

  return { balanceAfter: Number(entry.balance_after) }
}

export async function createLayaway(
  organizationId: string,
  input: CreateLayawayInput,
): Promise<{ id: string; totalAmount: number }> {
  const parsed = createLayawayInputSchema.parse(input)
  const user = await requirePermission('layaway.create', {
    organizationId,
    branchId: parsed.branchId,
  })

  // Never trust a client-supplied unit price — every line is re-priced here
  // from Milestone 06's resolveEffectivePrice()/resolveVariantPrice(), the
  // same rule createSale() follows. The result is the layaway's price
  // snapshot: agreed once, at creation, and never re-resolved as
  // installments come in.
  const priced = await Promise.all(
    parsed.items.map(async (item) => {
      const unitPrice = await resolveLayawayLinePrice(
        item.productId,
        item.variantId,
        parsed.branchId,
      )
      const line = calculateLineTotal({ quantity: item.quantity, unitPrice })
      return {
        product_id: item.productId,
        variant_id: item.variantId ?? null,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        line_total: line.lineTotal,
      }
    }),
  )

  const totalAmount = priced.reduce((sum, line) => sum + line.line_total, 0)

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('create_layaway', {
    p_organization_id: organizationId,
    p_branch_id: parsed.branchId,
    p_business_unit_id: parsed.businessUnitId,
    p_customer_id: parsed.customerId,
    p_reference: generateLayawayReference(),
    p_total_amount: totalAmount,
    p_items: priced,
  })
  if (error) throw error
  const layaway = data as { id: string; reference: string; total_amount: string | number }

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'customers.layaway_created',
      resourceType: 'layaway',
      resourceId: layaway.id,
      metadata: {
        reference: layaway.reference,
        customerId: parsed.customerId,
        branchId: parsed.branchId,
        itemCount: parsed.items.length,
        totalAmount: Number(layaway.total_amount),
      },
    },
    supabase,
  )

  return { id: layaway.id, totalAmount: Number(layaway.total_amount) }
}

async function resolveLayawayLinePrice(
  productId: string,
  variantId: string | null | undefined,
  branchId: string,
): Promise<number> {
  const parentPrice = await resolveEffectivePrice(productId, branchId)
  if (!variantId) return parentPrice

  const supabase = await createServerSupabaseClient()
  const { data: variant, error } = await supabase
    .from('product_variants')
    .select('base_price')
    .eq('id', variantId)
    .maybeSingle<{ base_price: string | number | null }>()
  if (error) throw error

  const variantBasePrice =
    variant?.base_price === null || variant?.base_price === undefined
      ? null
      : Number(variant.base_price)
  return resolveVariantPrice(variantBasePrice, parentPrice)
}

export async function recordLayawayPayment(
  organizationId: string,
  branchId: string,
  input: RecordLayawayPaymentInput,
): Promise<{ balanceAfter: number }> {
  const parsed = recordLayawayPaymentInputSchema.parse(input)
  const user = await requirePermission('layaway.record_payment', { organizationId, branchId })

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('record_layaway_payment', {
    p_layaway_id: parsed.layawayId,
    p_amount: parsed.amount,
    p_method: parsed.method,
    p_reference: parsed.reference ?? null,
  })
  if (error) throw error
  const payment = data as { id: string; balance_after: string | number }

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'customers.layaway_payment_recorded',
      resourceType: 'layaway',
      resourceId: parsed.layawayId,
      metadata: {
        paymentId: payment.id,
        amount: parsed.amount,
        method: parsed.method,
        balanceAfter: Number(payment.balance_after),
      },
    },
    supabase,
  )

  return { balanceAfter: Number(payment.balance_after) }
}

export async function cancelLayaway(
  organizationId: string,
  branchId: string,
  input: CancelLayawayInput,
): Promise<void> {
  const parsed = cancelLayawayInputSchema.parse(input)
  const user = await requirePermission('layaway.cancel', { organizationId, branchId })

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.rpc('cancel_layaway', {
    p_layaway_id: parsed.layawayId,
    p_reason: parsed.reason,
  })
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'customers.layaway_cancelled',
      resourceType: 'layaway',
      resourceId: parsed.layawayId,
      metadata: { reason: parsed.reason },
    },
    supabase,
  )
}
