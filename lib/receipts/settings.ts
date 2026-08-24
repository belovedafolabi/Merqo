import { cache } from 'react'
import { z } from 'zod'

import { recordAuditEvent } from '@/lib/auth/audit'
import { getCurrentOrganizationId } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/guard'
import { DEFAULT_RECEIPT_TEMPLATE_ID, RECEIPT_TEMPLATE_IDS, type ReceiptTemplateId } from '@/lib/receipts/templates'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * The receipt-configuration columns on `organizations`
 * (20260824091000_alter_organizations_add_receipt_settings.sql). Read-side
 * follows lib/branding/queries.ts's shape (cache()-wrapped, resolved from
 * the current organization); write-side follows every other mutation module
 * here.
 */

export interface ReceiptSettings {
  templateId: ReceiptTemplateId
  headerText: string | null
  footerText: string | null
  showLogo: boolean
  showCashier: boolean
}

interface ReceiptSettingsRow {
  receipt_template_id: string
  receipt_header_text: string | null
  receipt_footer_text: string | null
  receipt_show_logo: boolean
  receipt_show_cashier: boolean
}

const DEFAULT_SETTINGS: ReceiptSettings = {
  templateId: DEFAULT_RECEIPT_TEMPLATE_ID,
  headerText: null,
  footerText: null,
  showLogo: true,
  showCashier: true,
}

export const getReceiptSettings = cache(async (): Promise<ReceiptSettings> => {
  const organizationId = await getCurrentOrganizationId()
  if (!organizationId) return DEFAULT_SETTINGS

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('organizations')
    .select('receipt_template_id, receipt_header_text, receipt_footer_text, receipt_show_logo, receipt_show_cashier')
    .eq('id', organizationId)
    .single<ReceiptSettingsRow>()

  if (error || !data) return DEFAULT_SETTINGS

  // Falls back to the default rather than trusting the column outright: the
  // SQL check constraint guarantees this today, but a settings reader should
  // not be the thing that breaks if that constraint is ever loosened.
  const templateId = (RECEIPT_TEMPLATE_IDS as readonly string[]).includes(data.receipt_template_id)
    ? (data.receipt_template_id as ReceiptTemplateId)
    : DEFAULT_RECEIPT_TEMPLATE_ID

  return {
    templateId,
    headerText: data.receipt_header_text,
    footerText: data.receipt_footer_text,
    showLogo: data.receipt_show_logo,
    showCashier: data.receipt_show_cashier,
  }
})

export const receiptSettingsInputSchema = z.object({
  templateId: z.enum(RECEIPT_TEMPLATE_IDS),
  headerText: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value ? value : undefined)),
  footerText: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value ? value : undefined)),
  showLogo: z.boolean(),
  showCashier: z.boolean(),
})
export type ReceiptSettingsInput = z.infer<typeof receiptSettingsInputSchema>

export async function updateReceiptSettings(
  organizationId: string,
  rawInput: ReceiptSettingsInput,
): Promise<void> {
  const input = receiptSettingsInputSchema.parse(rawInput)
  const user = await requirePermission('organizations.update', { organizationId })

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('organizations')
    .update({
      receipt_template_id: input.templateId,
      receipt_header_text: input.headerText ?? null,
      receipt_footer_text: input.footerText ?? null,
      receipt_show_logo: input.showLogo,
      receipt_show_cashier: input.showCashier,
    })
    .eq('id', organizationId)

  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'organization.receipt_settings_updated',
      resourceType: 'organization',
      resourceId: organizationId,
      metadata: { templateId: input.templateId },
    },
    supabase,
  )
}
