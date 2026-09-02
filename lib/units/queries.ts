import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Units of measurement — the system list (organization_id null) plus this
 * organization's own custom units. Mirrors lib/products/queries.ts's
 * listCategories(); RLS (20260902090000) is what actually scopes the org
 * rows, this just filters for the two visible sets and orders them.
 */
export interface UnitOfMeasure {
  id: string
  organizationId: string | null
  name: string
  abbreviation: string
  isSystem: boolean
  archivedAt: string | null
}

export async function listUnitsOfMeasure(organizationId: string): Promise<UnitOfMeasure[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('units_of_measure')
    .select('id, organization_id, name, abbreviation, archived_at')
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    .order('archived_at', { ascending: true, nullsFirst: true })
    .order('name')

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id as string,
    organizationId: row.organization_id as string | null,
    name: row.name as string,
    abbreviation: row.abbreviation as string,
    isSystem: row.organization_id === null,
    archivedAt: row.archived_at as string | null,
  }))
}

/**
 * Just the names an active unit can currently have, system + custom, for
 * populating the product form's unit <Select>. Archived units are excluded
 * — an existing product may still reference an archived unit's name (the
 * column is free text), which the form handles by appending it as an extra
 * option.
 */
export async function listActiveUnitNames(organizationId: string): Promise<string[]> {
  const units = await listUnitsOfMeasure(organizationId)
  return units.filter((unit) => unit.archivedAt === null).map((unit) => unit.name)
}
