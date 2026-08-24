import { requirePermission } from '@/lib/auth/guard'
import { recordAuditEvent } from '@/lib/auth/audit'
import { notifyLowStock } from '@/lib/notifications/low-stock'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  lowStockThresholdInputSchema,
  stockAdjustmentInputSchema,
  stockTransferInputSchema,
  type LowStockThresholdInput,
  type StockAdjustmentInput,
  type StockTransferInput,
} from '@/lib/inventory/schemas'

/**
 * The actual DB mutations behind this milestone's adjustment/transfer/
 * threshold Server Actions — same `requirePermission() -> mutate ->
 * recordAuditEvent()` shape as lib/products/mutations.ts. Unlike that file,
 * the real balance-mutating logic lives in Postgres
 * (record_inventory_movement()/execute_stock_transfer() in
 * supabase/migrations/20260823110400_create_inventory_functions.sql) —
 * these are thin, permission-checked wrappers around those two RPCs, not a
 * re-implementation of the locking/atomicity they provide.
 */

export interface InventoryMovement {
  id: string
  branchId: string
  businessUnitId: string
  productId: string
  variantId: string | null
  movementType: string
  quantityDelta: number
  quantityAfter: number
  reason: string | null
  referenceType: string | null
  referenceId: string | null
  createdAt: string
  createdBy: string | null
}

interface MovementRow {
  id: string
  branch_id: string
  business_unit_id: string
  product_id: string
  variant_id: string | null
  movement_type: string
  quantity_delta: string | number
  quantity_after: string | number
  reason: string | null
  reference_type: string | null
  reference_id: string | null
  created_at: string
  created_by: string | null
}

function mapMovement(row: MovementRow): InventoryMovement {
  return {
    id: row.id,
    branchId: row.branch_id,
    businessUnitId: row.business_unit_id,
    productId: row.product_id,
    variantId: row.variant_id,
    movementType: row.movement_type,
    quantityDelta: Number(row.quantity_delta),
    quantityAfter: Number(row.quantity_after),
    reason: row.reason,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
  }
}

/**
 * The single shared write path this milestone's Technical Requirements call
 * for ("Movement recording implemented as a single shared server-side
 * function... used by adjustments, transfers, and (later) sales/returns in
 * Milestone 08 — never duplicated per call site"). Deliberately does NOT
 * call requirePermission() itself — each caller checks whatever permission
 * is actually relevant to it first (`inventory.adjust` below, and
 * Milestone 08's future `sales.create`), matching record_product_price()'s
 * own division of responsibility. `record_inventory_movement()` returns a
 * single row (not SETOF), so PostgREST hands back the object directly — no
 * `.single()` needed (see lib/auth/login-throttle.ts's scalar-RPC
 * precedent).
 */
export async function recordInventoryMovement(params: {
  branchId: string
  productId: string
  variantId?: string | null
  movementType: 'SALE' | 'RETURN' | 'ADJUSTMENT' | 'TRANSFER_OUT' | 'TRANSFER_IN'
  quantityDelta: number
  reason?: string | null
  referenceType?: string | null
  referenceId?: string | null
}): Promise<InventoryMovement> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.rpc('record_inventory_movement', {
    p_branch_id: params.branchId,
    p_product_id: params.productId,
    p_variant_id: params.variantId ?? null,
    p_movement_type: params.movementType,
    p_quantity_delta: params.quantityDelta,
    p_reason: params.reason ?? null,
    p_reference_type: params.referenceType ?? null,
    p_reference_id: params.referenceId ?? null,
  })
  if (error) throw error

  return mapMovement(data as MovementRow)
}

export async function createStockAdjustment(
  organizationId: string,
  input: StockAdjustmentInput,
): Promise<InventoryMovement> {
  const parsed = stockAdjustmentInputSchema.parse(input)
  const user = await requirePermission('inventory.adjust', {
    organizationId,
    branchId: parsed.branchId,
  })
  const supabase = await createServerSupabaseClient()

  const movement = await recordInventoryMovement({
    branchId: parsed.branchId,
    productId: parsed.productId,
    variantId: parsed.variantId ?? null,
    movementType: 'ADJUSTMENT',
    quantityDelta: parsed.quantityDelta,
    reason: parsed.reason,
  })

  // Batch/expiry data is attached alongside the movement only when the
  // caller actually submitted it — components/inventory/stock-adjustment-
  // dialog.tsx only renders these fields when the owning Business Unit's
  // batch_tracking/expiry_tracking capability is enabled (this milestone's
  // Scope), so `batchNumber`/`expiryDate` are undefined for every other
  // caller and this insert is skipped entirely.
  if (parsed.batchNumber || parsed.expiryDate) {
    const { error: batchError } = await supabase.from('batches').insert({
      branch_id: parsed.branchId,
      product_id: parsed.productId,
      variant_id: parsed.variantId ?? null,
      batch_number: parsed.batchNumber ?? 'UNSPECIFIED',
      expiry_date: parsed.expiryDate ?? null,
      // A batch record only tracks incoming stock (a negative adjustment —
      // e.g. correcting a miscount or writing off damaged stock — has
      // nothing meaningful to attach a batch quantity to).
      quantity: parsed.quantityDelta > 0 ? parsed.quantityDelta : 0,
      created_by: user.id,
    })
    if (batchError) throw batchError
  }

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'inventory.adjustment_created',
      resourceType: 'inventory_movement',
      resourceId: movement.id,
      metadata: {
        branchId: parsed.branchId,
        productId: parsed.productId,
        variantId: parsed.variantId ?? null,
        quantityDelta: parsed.quantityDelta,
        reason: parsed.reason,
      },
    },
    supabase,
  )

  // Post-commit, in its own transaction (see 20260824100400's header for
  // why): the adjustment above has already succeeded regardless of what
  // happens here. notifyLowStock() never throws, so this needs no
  // try/catch — Milestone 12's failure-isolation invariant holds by the
  // callee's own contract, not by anything written at this call site.
  await notifyLowStock({
    organizationId,
    branchId: parsed.branchId,
    productIds: [parsed.productId],
  })

  return movement
}

interface TransferRow {
  id: string
  organization_id: string
  source_branch_id: string
  destination_branch_id: string
  status: string
  created_at: string
  created_by: string | null
}

/**
 * Single-authorization transfer model (this milestone's plan doc / Security
 * Requirements): the initiating user must hold `inventory.transfer` at BOTH
 * the source and destination branch scope — two requirePermission() calls,
 * either of which throws AuthorizationError if missing, is exactly that
 * "hold it at both ends" check with no new guard code needed.
 */
export async function initiateStockTransfer(
  organizationId: string,
  input: StockTransferInput,
): Promise<{ id: string }> {
  const parsed = stockTransferInputSchema.parse(input)

  await requirePermission('inventory.transfer', {
    organizationId,
    branchId: parsed.sourceBranchId,
  })
  const user = await requirePermission('inventory.transfer', {
    organizationId,
    branchId: parsed.destinationBranchId,
  })

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('execute_stock_transfer', {
    p_organization_id: organizationId,
    p_source_branch_id: parsed.sourceBranchId,
    p_destination_branch_id: parsed.destinationBranchId,
    p_items: parsed.items.map((item) => ({
      source_product_id: item.sourceProductId,
      source_variant_id: item.sourceVariantId ?? null,
      destination_product_id: item.destinationProductId,
      destination_variant_id: item.destinationVariantId ?? null,
      quantity: item.quantity,
    })),
  })
  if (error) throw error
  const transfer = data as TransferRow

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'inventory.transfer_completed',
      resourceType: 'stock_transfer',
      resourceId: transfer.id,
      metadata: {
        sourceBranchId: parsed.sourceBranchId,
        destinationBranchId: parsed.destinationBranchId,
        itemCount: parsed.items.length,
      },
    },
    supabase,
  )

  // SOURCE branch only. execute_stock_transfer() is the one write path that
  // bypasses recordInventoryMovement()'s TS wrapper entirely (it calls
  // record_inventory_movement() twice, itself, inside Postgres) — so this is
  // the only place a transfer-driven depletion below threshold gets
  // detected. The destination side only ever increases, so it is never a
  // low-stock candidate. Never throws; see createStockAdjustment()'s comment
  // above for why no try/catch is needed here either.
  await notifyLowStock({
    organizationId,
    branchId: parsed.sourceBranchId,
    productIds: parsed.items.map((item) => item.sourceProductId),
  })

  return { id: transfer.id }
}

/**
 * The one direct (non-RPC) write path onto inventory_balances — the
 * threshold isn't part of the movement ledger, so it doesn't need
 * record_inventory_movement()'s locking. RLS's column-level GRANT
 * (20260823110900_alter_tables_grant_authenticated_inventory.sql) makes
 * `quantity`/`reserved_quantity` unreachable through this same update
 * payload even if a caller tried, independent of this function only ever
 * sending `low_stock_threshold`.
 */
export async function updateLowStockThreshold(
  organizationId: string,
  branchId: string,
  balanceId: string,
  input: LowStockThresholdInput,
): Promise<void> {
  const user = await requirePermission('inventory.adjust', { organizationId, branchId })
  const parsed = lowStockThresholdInputSchema.parse(input)
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('inventory_balances')
    .update({ low_stock_threshold: parsed.threshold })
    .eq('id', balanceId)
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'inventory.low_stock_threshold_updated',
      resourceType: 'inventory_balance',
      resourceId: balanceId,
      metadata: { threshold: parsed.threshold },
    },
    supabase,
  )
}
