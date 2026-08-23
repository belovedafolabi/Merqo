import { recordAuditEvent } from '@/lib/auth/audit'
import { requirePermission } from '@/lib/auth/guard'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { savedReportInputSchema, type SavedReportInput } from '@/lib/reports/schemas'

/**
 * Writes against `saved_reports` — the only mutable table this milestone adds
 * that behaves like ordinary tenant data.
 *
 * Same shape as every mutation module since Milestone 05: parse the input,
 * requirePermission(), perform the write, record an audit event. The database
 * enforces the same rules again through `saved_reports_insert`/`_update`
 * (20260823140500) — these checks are the first line, not the only one.
 *
 * Note there is no `deleteSavedReport`. Archiving is an UPDATE of
 * `archived_at`, and the table holds no DELETE grant, so a saved report shared
 * to a branch cannot vanish from under the people it was shared with.
 */

export async function createSavedReport(
  organizationId: string,
  rawInput: SavedReportInput,
): Promise<string> {
  const input = savedReportInputSchema.parse(rawInput)
  const user = await requirePermission('reports.save', { organizationId })

  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('saved_reports')
    .insert({
      organization_id: organizationId,
      // A branch-visible report needs a branch to be visible to; the schema
      // allows the pairing to be absent, and this is where it becomes
      // meaningful rather than silently saving a report nobody but its author
      // can ever see.
      branch_id: input.visibility === 'branch' ? input.branchId : null,
      business_unit_id: input.businessUnitId,
      name: input.name,
      description: input.description ?? null,
      dataset: input.config.dataset,
      config: input.config,
      visibility: input.visibility,
      created_by: user.id,
    })
    .select('id')
    .single<{ id: string }>()

  if (error) throw error

  await recordAuditEvent({
    organizationId,
    userId: user.id,
    action: 'reports.saved',
    resourceType: 'saved_report',
    resourceId: data.id,
    metadata: { name: input.name, dataset: input.config.dataset, visibility: input.visibility },
  })

  return data.id
}

export async function updateSavedReport(
  organizationId: string,
  savedReportId: string,
  rawInput: SavedReportInput,
): Promise<void> {
  const input = savedReportInputSchema.parse(rawInput)
  const user = await requirePermission('reports.save', { organizationId })

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('saved_reports')
    .update({
      branch_id: input.visibility === 'branch' ? input.branchId : null,
      business_unit_id: input.businessUnitId,
      name: input.name,
      description: input.description ?? null,
      dataset: input.config.dataset,
      config: input.config,
      visibility: input.visibility,
    })
    .eq('id', savedReportId)

  if (error) throw error

  await recordAuditEvent({
    organizationId,
    userId: user.id,
    action: 'reports.updated',
    resourceType: 'saved_report',
    resourceId: savedReportId,
    metadata: { name: input.name, visibility: input.visibility },
  })
}

export async function archiveSavedReport(
  organizationId: string,
  savedReportId: string,
): Promise<void> {
  const user = await requirePermission('reports.save', { organizationId })
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('saved_reports')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', savedReportId)

  if (error) throw error

  await recordAuditEvent({
    organizationId,
    userId: user.id,
    action: 'reports.archived',
    resourceType: 'saved_report',
    resourceId: savedReportId,
  })
}

/**
 * Records that a report left the building. Export is a distinct audited event
 * from viewing, for the same reason `reports.export` is a distinct permission:
 * Milestone 10's Security Requirements call export "a higher-risk
 * data-exfiltration surface", and an exfiltration surface with no audit trail
 * is not much of a control.
 */
export async function recordReportExport(
  organizationId: string,
  reportId: string,
  format: string,
  rowCount: number,
): Promise<void> {
  const user = await requirePermission('reports.export', { organizationId })

  await recordAuditEvent({
    organizationId,
    userId: user.id,
    action: 'reports.exported',
    resourceType: 'report',
    resourceId: reportId,
    metadata: { format, rowCount },
  })
}
