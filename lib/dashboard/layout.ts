import { getCurrentUserContext } from '@/lib/auth/context'
import { resolvePermission } from '@/lib/auth/permissions'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { WIDGET_LIST, findWidget, type WidgetDef, type WidgetId } from '@/lib/dashboard/widgets'

/**
 * Resolves which dashboard widgets the current user sees, and in what order.
 *
 * A dashboard_widgets row (20260903090400) is an OVERRIDE of the registry
 * default, not a membership record — no row means "use the default", and a
 * row's `enabled` is the user's explicit choice. This keeps "removed
 * everything" distinct from "never touched it", which a delete-to-remove
 * model could not.
 */

export interface ResolvedWidget extends WidgetDef {
  enabled: boolean
  position: number
}

interface LayoutRow {
  widget_id: string
  enabled: boolean
  position: number
}

/**
 * The current user's override rows. No organization filter and none needed:
 * dashboard_widgets has no organization_id column (a layout is a personal
 * view preference, not tenant data), and RLS's dashboard_widgets_select_self
 * already limits this to the caller's own rows.
 */
async function loadRows(): Promise<Map<string, LayoutRow>> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('dashboard_widgets')
    .select('widget_id, enabled, position')
    .returns<LayoutRow[]>()
  if (error) throw error
  return new Map((data ?? []).map((row) => [row.widget_id, row]))
}

/**
 * Every widget the user MAY see (permission-filtered), each tagged with
 * whether it is currently enabled and its position — the shape the
 * "Add widget" drawer renders from.
 */
export async function resolveDashboardWidgets(organizationId: string): Promise<ResolvedWidget[]> {
  const { grants } = await getCurrentUserContext()
  const rows = await loadRows()

  return WIDGET_LIST.filter(
    (widget) =>
      widget.permission === null ||
      resolvePermission(grants, widget.permission, { organizationId }),
  )
    .map((widget) => {
      const row = rows.get(widget.id)
      return {
        ...widget,
        enabled: row ? row.enabled : widget.defaultEnabled,
        position: row ? row.position : widget.defaultPosition,
      }
    })
    .sort((a, b) => a.position - b.position || a.defaultPosition - b.defaultPosition)
}

/** Just the enabled widgets, in order — what the dashboard page renders. */
export async function activeDashboardWidgets(organizationId: string): Promise<ResolvedWidget[]> {
  return (await resolveDashboardWidgets(organizationId)).filter((widget) => widget.enabled)
}

/**
 * Turn a widget on or off for the current user. Upserts a dashboard_widgets
 * row; RLS's WITH CHECK ties it to auth.uid(), so `user_id` is set here from
 * the resolved context rather than trusted from a caller.
 */
export async function setDashboardWidgetEnabled(
  organizationId: string,
  widgetId: string,
  enabled: boolean,
): Promise<void> {
  const widget = findWidget(widgetId)
  if (!widget) throw new Error(`Unknown dashboard widget: ${widgetId}`)

  const { user, grants } = await getCurrentUserContext()
  if (!user) throw new Error('Not signed in.')
  if (
    widget.permission !== null &&
    !resolvePermission(grants, widget.permission, { organizationId })
  ) {
    throw new Error('You do not have access to that widget.')
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('dashboard_widgets').upsert(
    {
      user_id: user.id,
      widget_id: widget.id as WidgetId,
      enabled,
      position: widget.defaultPosition,
    },
    { onConflict: 'user_id,widget_id' },
  )
  if (error) throw error
}
