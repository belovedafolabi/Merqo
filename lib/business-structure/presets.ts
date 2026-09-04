import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '@/lib/logger'
import { WIDGET_IDS } from '@/lib/dashboard/widgets'
import { findStandardReport } from '@/lib/reports/catalog'

/**
 * Milestone 17 Part B — one-time onboarding convenience, NEVER a runtime gate.
 *
 * Reads business_type_presets for the new business unit's type and:
 *   - seeds the onboarding user's dashboard_widgets rows (dashboard_widgets is
 *     per-user with no org/BU column, so this is as close as the schema gets to
 *     "the unit's dashboard"; employees invited later get the generic default);
 *   - writes business_units.pinned_reports.
 *
 * After onboarding the owner changes everything freely and business_type_presets
 * is never consulted again for that unit. Anything in a preset payload that
 * isn't a real widget id / report id is skipped, not applied.
 */
export async function applyBusinessTypePresets(
  supabase: SupabaseClient,
  params: { businessUnitId: string; businessTypeId: string; userId: string },
): Promise<{ widgetsApplied: number; reportsApplied: number }> {
  const { data: presets, error } = await supabase
    .from('business_type_presets')
    .select('preset_kind, payload')
    .eq('business_type_id', params.businessTypeId)

  if (error || !presets || presets.length === 0) {
    return { widgetsApplied: 0, reportsApplied: 0 }
  }

  const widgetPayload = presets.find((p) => p.preset_kind === 'dashboard_widgets')?.payload
  const reportPayload = presets.find((p) => p.preset_kind === 'pinned_reports')?.payload

  let widgetsApplied = 0
  const widgetIds = Array.isArray(widgetPayload)
    ? (widgetPayload as unknown[]).filter(
        (id): id is string =>
          typeof id === 'string' && (WIDGET_IDS as readonly string[]).includes(id),
      )
    : []

  if (widgetIds.length > 0) {
    const rows = widgetIds.map((widgetId, index) => ({
      user_id: params.userId,
      widget_id: widgetId,
      enabled: true,
      position: index,
    }))
    const { error: widgetError } = await supabase
      .from('dashboard_widgets')
      .upsert(rows, { onConflict: 'user_id,widget_id', ignoreDuplicates: true })
    if (widgetError) {
      logger.warn('onboarding.preset_widgets_failed', {
        businessUnitId: params.businessUnitId,
        error: widgetError.message,
      })
    } else {
      widgetsApplied = rows.length
    }
  }

  let reportsApplied = 0
  const reportIds = Array.isArray(reportPayload)
    ? (reportPayload as unknown[]).filter(
        (id): id is string => typeof id === 'string' && findStandardReport(id) !== undefined,
      )
    : []

  if (reportIds.length > 0) {
    const { error: reportError } = await supabase
      .from('business_units')
      .update({ pinned_reports: reportIds })
      .eq('id', params.businessUnitId)
    if (reportError) {
      logger.warn('onboarding.preset_reports_failed', {
        businessUnitId: params.businessUnitId,
        error: reportError.message,
      })
    } else {
      reportsApplied = reportIds.length
    }
  }

  return { widgetsApplied, reportsApplied }
}
