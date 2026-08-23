import { createServerSupabaseClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { customReportConfigSchema, type CustomReportConfig } from '@/lib/reports/schemas'

/**
 * Reading saved custom-report configurations.
 *
 * THE ONE THING THIS MODULE EXISTS TO DO: re-validate `saved_reports.config`
 * on load. The column is jsonb, so Postgres never type-checked its contents,
 * and a row could have been written by a client that skipped the builder, or
 * edited directly by someone with database access. Trusting it because it
 * passed validation once, at some point in the past, would turn the saved-
 * reports table into a way to smuggle a non-whitelisted token past
 * lib/reports/schemas.ts — the exact bypass the three-layer design exists to
 * prevent. A stored config is untrusted input, identical in status to a
 * request body.
 *
 * A config that fails re-validation is dropped from the listing rather than
 * throwing: one corrupt row must not take down the whole saved-reports screen
 * and lock a user out of the reports they can still run. It is logged at warn,
 * because a config that stopped validating is either tampering or a registry
 * change that orphaned a field, and both are worth knowing about.
 */

export interface SavedReport {
  id: string
  name: string
  description: string | null
  dataset: string
  visibility: 'private' | 'branch' | 'organization'
  branchId: string | null
  businessUnitId: string | null
  config: CustomReportConfig
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

interface SavedReportRow {
  id: string
  name: string
  description: string | null
  dataset: string
  visibility: string
  branch_id: string | null
  business_unit_id: string | null
  config: unknown
  created_by: string | null
  created_at: string
  updated_at: string
}

function parseRow(row: SavedReportRow): SavedReport | null {
  const parsed = customReportConfigSchema.safeParse(row.config)

  if (!parsed.success) {
    logger.warn('report.saved_config_rejected', {
      savedReportId: row.id,
      issues: parsed.error.issues.map((issue) => issue.message),
    })
    return null
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    dataset: row.dataset,
    visibility: row.visibility as SavedReport['visibility'],
    branchId: row.branch_id,
    businessUnitId: row.business_unit_id,
    config: parsed.data,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const SELECT_COLUMNS =
  'id, name, description, dataset, visibility, branch_id, business_unit_id, config, created_by, created_at, updated_at'

/**
 * Every saved report the caller can see. Visibility is enforced by
 * `saved_reports_select` (20260823140500), not repeated here — this function
 * exists for query precision and config re-validation, not as a second
 * authorization layer.
 */
export async function listSavedReports(organizationId: string): Promise<SavedReport[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('saved_reports')
    .select(SELECT_COLUMNS)
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .order('name')

  if (error) throw error

  return ((data ?? []) as SavedReportRow[])
    .map(parseRow)
    .filter((report): report is SavedReport => report !== null)
}

/**
 * One saved report, or null. Returns null for a config that fails
 * re-validation as well as for a row that does not exist — from the caller's
 * point of view an unrunnable report and a missing one are the same thing, and
 * distinguishing them would only tell a prober that the row exists.
 */
export async function getSavedReport(savedReportId: string): Promise<SavedReport | null> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('saved_reports')
    .select(SELECT_COLUMNS)
    .eq('id', savedReportId)
    .is('archived_at', null)
    .maybeSingle<SavedReportRow>()

  if (error) throw error
  if (!data) return null

  return parseRow(data)
}
