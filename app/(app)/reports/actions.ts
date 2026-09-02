'use server'

import { toErrorMessage } from '@/lib/errors'

import { revalidatePath } from 'next/cache'

import { runCustomReport } from '@/lib/reports/custom'
import { archiveSavedReport, createSavedReport, updateSavedReport } from '@/lib/reports/mutations'
import { customReportConfigSchema, savedReportInputSchema } from '@/lib/reports/schemas'
import type { CustomReportConfig } from '@/lib/reports/schemas'
import type { ReportParameters, ReportResult } from '@/lib/reports/types'

/**
 * Server Actions for the report builder — same thin shape as
 * app/(app)/inventory/actions.ts: parse, delegate, return `{ error }`.
 *
 * The standard reports have no actions of their own: their filters live in the
 * URL and their pages are Server Components, so running one is a navigation
 * rather than a mutation. Only the builder needs actions, because previewing a
 * report the user is composing is a genuine request/response rather than a
 * page load.
 */
export interface ReportActionState {
  error: string | null
}

const initialState: ReportActionState = { error: null }

function errorMessage(error: unknown): string {
  return toErrorMessage(error)
}

export interface CustomReportPreview {
  result: ReportResult | null
  error: string | null
}

/**
 * Runs a report the user is composing. Returns the error rather than throwing
 * so the builder can show it inline next to the controls that caused it — a
 * thrown AuthorizationError would replace the whole screen with an error
 * boundary and lose everything they had selected.
 */
export async function runCustomReportAction(
  config: CustomReportConfig,
  parameters: ReportParameters,
): Promise<CustomReportPreview> {
  try {
    const result = await runCustomReport({
      config: customReportConfigSchema.parse(config),
      parameters,
    })
    return { result, error: null }
  } catch (error) {
    return { result: null, error: errorMessage(error) }
  }
}

export async function saveReportAction(
  _prevState: ReportActionState,
  formData: FormData,
): Promise<ReportActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const savedReportId = String(formData.get('savedReportId') ?? '')

  let config: unknown
  try {
    config = JSON.parse(String(formData.get('config') ?? 'null'))
  } catch {
    return { error: 'That report configuration could not be read.' }
  }

  const parsed = savedReportInputSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? undefined,
    visibility: formData.get('visibility') ?? 'private',
    branchId: formData.get('branchId') || null,
    config,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the report details and try again.' }
  }

  try {
    if (savedReportId) {
      await updateSavedReport(organizationId, savedReportId, parsed.data)
    } else {
      await createSavedReport(organizationId, parsed.data)
    }
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/reports/builder')
  return initialState
}

export async function archiveSavedReportAction(
  _prevState: ReportActionState,
  formData: FormData,
): Promise<ReportActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const savedReportId = String(formData.get('savedReportId') ?? '')

  try {
    await archiveSavedReport(organizationId, savedReportId)
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/reports/builder')
  return initialState
}
