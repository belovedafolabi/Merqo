import { createServerSupabaseClient } from '@/lib/supabase/server'
import { deriveLayawayOutstanding } from '@/lib/customers/ledger'

/**
 * Read-side queries for this milestone's domain (docs/milestones/
 * 09-customer-store-credit-and-layaway.md). Same shape as
 * lib/inventory/queries.ts and lib/sales/queries.ts: RLS is the enforced
 * visibility boundary (customers and store credit are organization-wide,
 * layaways are branch-scoped — see 20260823130900/131000/131100), and these
 * functions exist for query precision and shape, not for access control.
 *
 * getCustomerTransactionHistory() is the "read view aggregating records from
 * Milestone 08 and this milestone's own ledgers" this milestone's Scope
 * calls for. It is assembled in TypeScript from four small, individually
 * indexed queries rather than a database view: the four sources have
 * genuinely different columns, a view would need a lowest-common-denominator
 * shape that discards most of them, and nothing here needs to be joinable or
 * further filtered in SQL.
 */

export interface Customer {
  id: string
  organizationId: string
  customerCode: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  createdAt: string
  archivedAt: string | null
}

interface CustomerRow {
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

const customerSelect =
  'id, organization_id, customer_code, name, phone, email, address, notes, created_at, archived_at'

function mapCustomer(row: CustomerRow): Customer {
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

export async function listCustomers(organizationId: string): Promise<Customer[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('customers')
    .select(customerSelect)
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw error
  return ((data ?? []) as CustomerRow[]).map(mapCustomer)
}

/**
 * Identification by phone/email/name, in that order of usefulness at a till
 * (this milestone's Scope: "search, identification (phone/email/name)").
 * A single `or()` rather than three round trips — `name` is backed by the
 * pg_trgm GIN index created in 20260823130000, phone/email by their own
 * partial-unique B-trees.
 */
export async function searchCustomers(organizationId: string, term: string): Promise<Customer[]> {
  const trimmed = term.trim()
  if (!trimmed) return []

  // Escape PostgREST's `or()` filter delimiters so a search for a value
  // containing a comma or a parenthesis can't change the shape of the
  // filter expression itself.
  const safe = trimmed.replace(/[,()]/g, ' ')

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('customers')
    .select(customerSelect)
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`)
    .order('name')
    .limit(20)

  if (error) throw error
  return ((data ?? []) as CustomerRow[]).map(mapCustomer)
}

export async function getCustomer(customerId: string): Promise<Customer | null> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('customers')
    .select(customerSelect)
    .eq('id', customerId)
    .maybeSingle<CustomerRow>()

  if (error) throw error
  return data ? mapCustomer(data) : null
}

export interface StoreCreditEntryRecord {
  id: string
  entryType: 'issue' | 'spend' | 'refund_to_credit' | 'adjustment'
  amount: number
  balanceAfter: number
  reason: string | null
  referenceType: string | null
  referenceId: string | null
  createdAt: string
}

/**
 * The cached balance from `store_credit_accounts`, which
 * record_store_credit_entry() keeps in the same transaction as every ledger
 * insert. A customer who has never had credit has no account row yet — that
 * is a zero balance, not an error.
 *
 * Reading the cache rather than summing the ledger is the whole reason the
 * cache exists (20260823130100's own comment): a POS keystroke must not
 * scan an unbounded ledger. lib/customers/ledger.ts's
 * deriveStoreCreditBalance() is the independent derivation this is checked
 * against in tests/integration/customers.test.ts.
 */
export async function getStoreCreditBalance(customerId: string): Promise<number> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('store_credit_accounts')
    .select('balance')
    .eq('customer_id', customerId)
    .maybeSingle<{ balance: string | number }>()

  if (error) throw error
  return data ? Number(data.balance) : 0
}

export async function listStoreCreditLedger(
  customerId: string,
  limit = 100,
): Promise<StoreCreditEntryRecord[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('store_credit_ledger')
    .select(
      'id, entry_type, amount, balance_after, reason, reference_type, reference_id, created_at, store_credit_accounts!inner(customer_id)',
    )
    .eq('store_credit_accounts.customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (
    (data ?? []) as unknown as Array<{
      id: string
      entry_type: StoreCreditEntryRecord['entryType']
      amount: string | number
      balance_after: string | number
      reason: string | null
      reference_type: string | null
      reference_id: string | null
      created_at: string
    }>
  ).map((row) => ({
    id: row.id,
    entryType: row.entry_type,
    amount: Number(row.amount),
    balanceAfter: Number(row.balance_after),
    reason: row.reason,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    createdAt: row.created_at,
  }))
}

export interface LayawayPaymentRecord {
  id: string
  amount: number
  balanceAfter: number
  method: string
  reference: string | null
  createdAt: string
}

export interface LayawayItemRecord {
  id: string
  productId: string
  productName: string
  variantId: string | null
  variantName: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface Layaway {
  id: string
  customerId: string
  customerName: string
  branchId: string
  businessUnitId: string
  reference: string
  totalAmount: number
  amountPaid: number
  outstandingAmount: number
  status: 'active' | 'paid' | 'cancelled'
  cancellationReason: string | null
  createdAt: string
  completedAt: string | null
}

interface LayawayRow {
  id: string
  customer_id: string
  branch_id: string
  business_unit_id: string
  reference: string
  total_amount: string | number
  amount_paid: string | number
  status: Layaway['status']
  cancellation_reason: string | null
  created_at: string
  completed_at: string | null
  customers: { name: string } | null
}

const layawaySelect =
  'id, customer_id, branch_id, business_unit_id, reference, total_amount, amount_paid, status, cancellation_reason, created_at, completed_at, customers(name)'

function mapLayaway(row: LayawayRow): Layaway {
  const totalAmount = Number(row.total_amount)
  const amountPaid = Number(row.amount_paid)
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customers?.name ?? '',
    branchId: row.branch_id,
    businessUnitId: row.business_unit_id,
    reference: row.reference,
    totalAmount,
    amountPaid,
    // Derived, never stored — see 20260823130300's own comment for why a
    // third denormalized money column would be a third thing that can drift.
    outstandingAmount: deriveLayawayOutstanding(totalAmount, [{ amount: amountPaid }]),
    status: row.status,
    cancellationReason: row.cancellation_reason,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }
}

export async function listLayaways(
  branchId: string,
  filters: { customerId?: string } = {},
): Promise<Layaway[]> {
  const supabase = await createServerSupabaseClient()
  let query = supabase
    .from('layaways')
    .select(layawaySelect)
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (filters.customerId) query = query.eq('customer_id', filters.customerId)

  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as unknown as LayawayRow[]).map(mapLayaway)
}

/**
 * Every layaway belonging to one customer, across branches — the customer
 * detail page's view, as opposed to listLayaways()'s branch-desk view.
 * RLS still trims this to branches the reader can actually see
 * (layaways_select, 20260823131100), so a Branch Manager reading a
 * business-wide customer record sees that customer's layaways at their own
 * branches and not others'.
 */
export async function listCustomerLayaways(customerId: string): Promise<Layaway[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('layaways')
    .select(layawaySelect)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as unknown as LayawayRow[]).map(mapLayaway)
}

export interface LayawayDetail extends Layaway {
  items: LayawayItemRecord[]
  payments: LayawayPaymentRecord[]
}

export async function getLayaway(layawayId: string): Promise<LayawayDetail | null> {
  const supabase = await createServerSupabaseClient()

  const { data: layawayRow, error } = await supabase
    .from('layaways')
    .select(layawaySelect)
    .eq('id', layawayId)
    .maybeSingle()
  if (error) throw error
  if (!layawayRow) return null

  const [{ data: itemRows, error: itemsError }, { data: paymentRows, error: paymentsError }] =
    await Promise.all([
      supabase
        .from('layaway_items')
        .select(
          'id, product_id, variant_id, quantity, unit_price, line_total, products(name), product_variants(name)',
        )
        .eq('layaway_id', layawayId),
      supabase
        .from('layaway_payments')
        .select('id, amount, balance_after, method, reference, created_at')
        .eq('layaway_id', layawayId)
        .order('created_at', { ascending: true }),
    ])
  if (itemsError) throw itemsError
  if (paymentsError) throw paymentsError

  return {
    ...mapLayaway(layawayRow as unknown as LayawayRow),
    items: (
      (itemRows ?? []) as unknown as Array<{
        id: string
        product_id: string
        variant_id: string | null
        quantity: string | number
        unit_price: string | number
        line_total: string | number
        products: { name: string } | null
        product_variants: { name: string } | null
      }>
    ).map((row) => ({
      id: row.id,
      productId: row.product_id,
      productName: row.products?.name ?? '',
      variantId: row.variant_id,
      variantName: row.product_variants?.name ?? null,
      quantity: Number(row.quantity),
      unitPrice: Number(row.unit_price),
      lineTotal: Number(row.line_total),
    })),
    payments: (
      (paymentRows ?? []) as Array<{
        id: string
        amount: string | number
        balance_after: string | number
        method: string
        reference: string | null
        created_at: string
      }>
    ).map((row) => ({
      id: row.id,
      amount: Number(row.amount),
      balanceAfter: Number(row.balance_after),
      method: row.method,
      reference: row.reference,
      createdAt: row.created_at,
    })),
  }
}

export type CustomerActivityKind = 'sale' | 'return' | 'store_credit' | 'layaway'

export interface CustomerActivityEntry {
  id: string
  kind: CustomerActivityKind
  occurredAt: string
  description: string
  /** Signed where a direction is meaningful (a spend is negative), else the record's face value. */
  amount: number | null
}

/**
 * The unified customer transaction history this milestone's Scope requires:
 * "sales, returns, store-credit activity, layaway activity". One
 * time-ordered stream, newest first, so the "issue credit via refund ->
 * spend at checkout -> review customer history" walkthrough in this
 * milestone's Definition of Done is a single readable trail rather than four
 * separate tabs the reader has to interleave mentally.
 */
export async function getCustomerTransactionHistory(
  customerId: string,
  limit = 100,
): Promise<CustomerActivityEntry[]> {
  const supabase = await createServerSupabaseClient()

  const [sales, credit, layaways] = await Promise.all([
    supabase
      .from('sales')
      .select('id, total, created_at, returns(id, reason, created_at)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(limit),
    listStoreCreditLedger(customerId, limit),
    supabase
      .from('layaways')
      .select('id, reference, total_amount, status, created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ])
  if (sales.error) throw sales.error
  if (layaways.error) throw layaways.error

  const saleRows = (sales.data ?? []) as unknown as Array<{
    id: string
    total: string | number
    created_at: string
    returns: Array<{ id: string; reason: string; created_at: string }> | null
  }>

  const entries: CustomerActivityEntry[] = [
    ...saleRows.map((row) => ({
      id: row.id,
      kind: 'sale' as const,
      occurredAt: row.created_at,
      description: 'Sale completed',
      amount: Number(row.total),
    })),
    ...saleRows.flatMap((row) =>
      (row.returns ?? []).map((returnRow) => ({
        id: returnRow.id,
        kind: 'return' as const,
        occurredAt: returnRow.created_at,
        description: `Return — ${returnRow.reason}`,
        amount: null,
      })),
    ),
    ...credit.map((entry) => ({
      id: entry.id,
      kind: 'store_credit' as const,
      occurredAt: entry.createdAt,
      description: storeCreditDescription(entry),
      amount: entry.amount,
    })),
    ...(
      (layaways.data ?? []) as unknown as Array<{
        id: string
        reference: string
        total_amount: string | number
        status: string
        created_at: string
      }>
    ).map((row) => ({
      id: row.id,
      kind: 'layaway' as const,
      occurredAt: row.created_at,
      description: `Layaway ${row.reference} — ${row.status}`,
      amount: Number(row.total_amount),
    })),
  ]

  return entries.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, limit)
}

function storeCreditDescription(entry: StoreCreditEntryRecord): string {
  const label = {
    issue: 'Store credit issued',
    spend: 'Store credit spent',
    refund_to_credit: 'Refunded to store credit',
    adjustment: 'Store credit adjusted',
  }[entry.entryType]

  return entry.reason ? `${label} — ${entry.reason}` : label
}
