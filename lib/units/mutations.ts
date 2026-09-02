import { requirePermission } from '@/lib/auth/guard'
import { recordAuditEvent } from '@/lib/auth/audit'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { unitInputSchema, type UnitInput } from '@/lib/units/schemas'

/**
 * Create / update / archive a custom unit of measurement — same
 * `requirePermission() -> mutate -> recordAuditEvent()` shape as
 * lib/products/mutations.ts's category functions. System units
 * (organization_id null) are seeded and never reachable here: every write
 * sets organization_id to the caller's org, and RLS (20260902090000)
 * rejects anything else.
 */

function duplicateNameError(error: { code?: string }): Error | null {
  return error.code === '23505'
    ? new Error('A unit with that name already exists for this organization.')
    : null
}

export async function createUnit(
  organizationId: string,
  input: UnitInput,
): Promise<{ id: string }> {
  const user = await requirePermission('units.manage', { organizationId })
  const parsed = unitInputSchema.parse(input)
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('units_of_measure')
    .insert({
      organization_id: organizationId,
      name: parsed.name,
      abbreviation: parsed.abbreviation,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error) throw duplicateNameError(error as { code?: string }) ?? error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'unit.created',
      resourceType: 'unit_of_measure',
      resourceId: data.id,
      metadata: { name: parsed.name, abbreviation: parsed.abbreviation },
    },
    supabase,
  )

  return { id: data.id }
}

export async function updateUnit(
  organizationId: string,
  unitId: string,
  input: UnitInput,
): Promise<void> {
  const user = await requirePermission('units.manage', { organizationId })
  const parsed = unitInputSchema.parse(input)
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('units_of_measure')
    .update({ name: parsed.name, abbreviation: parsed.abbreviation })
    .eq('id', unitId)
    .eq('organization_id', organizationId)
  if (error) throw duplicateNameError(error as { code?: string }) ?? error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'unit.updated',
      resourceType: 'unit_of_measure',
      resourceId: unitId,
      metadata: { name: parsed.name, abbreviation: parsed.abbreviation },
    },
    supabase,
  )
}

export async function archiveUnit(organizationId: string, unitId: string): Promise<void> {
  const user = await requirePermission('units.manage', { organizationId })
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('units_of_measure')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', unitId)
    .eq('organization_id', organizationId)
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'unit.archived',
      resourceType: 'unit_of_measure',
      resourceId: unitId,
    },
    supabase,
  )
}
