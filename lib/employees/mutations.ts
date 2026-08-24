import { recordAuditEvent } from '@/lib/auth/audit'
import { requirePermission } from '@/lib/auth/guard'
import { sendEmail } from '@/lib/email/service'
import { renderEmployeeInvitationEmail } from '@/lib/email/templates/employee-invitation'
import { EmailDeliveryError } from '@/lib/email/types'
import {
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiry,
  invitationUrl,
} from '@/lib/employees/invitations'
import {
  inviteEmployeeInputSchema,
  setEmployeeActiveInputSchema,
  type InviteEmployeeInput,
  type SetEmployeeActiveInput,
} from '@/lib/employees/schemas'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Employee invitation and deactivation writes.
 *
 * The two halves of this file follow different rules on purpose:
 *
 *   - Invitation writes go through requirePermission() then an ordinary
 *     .insert()/.update(), same shape as every domain since Milestone 06 —
 *     RLS (20260824090400) is the real boundary, requirePermission() is the
 *     friendly error before hitting it.
 *
 *   - setEmployeeActive() below does NOT call requirePermission(). The
 *     permission check, the self-targeting refusal, and the cross-org
 *     isolation check all live INSIDE set_employee_active()
 *     (20260824090200_create_employee_functions.sql), because it is
 *     SECURITY DEFINER and therefore the only place those checks can
 *     actually run — see that migration's header. Calling requirePermission()
 *     here first would be a second round trip re-deciding a question the RPC
 *     is about to decide anyway, and the RPC's own error messages
 *     ("cannot change your own active status") are already the message a
 *     caller should see.
 */

export interface InviteEmployeeResult {
  invitationId: string
  /** The link to hand the invitee — copy button, always shown regardless of email delivery. */
  inviteUrl: string
  emailDelivered: boolean
  /** Set only when emailDelivered is false — surfaced as a banner, per the plan's "always show the fallback". */
  emailWarning: string | null
}

/**
 * Escapes ilike's two wildcard characters so an email containing a literal
 * `_` (common — "john_doe@example.com") or `%` is matched exactly rather
 * than as a pattern. Used instead of a plain .eq() because users.email is
 * not stored lowercased (only compared case-insensitively via the
 * lower(email) unique index) — ilike is the case-insensitive match, and this
 * is what keeps it an exact one.
 */
function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`)
}

async function loadInviteContext(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  organizationId: string,
  roleId: string,
  inviterId: string,
): Promise<{ organizationName: string; roleName: string; inviterName: string }> {
  const [{ data: org }, { data: role }, { data: inviter }] = await Promise.all([
    supabase.from('organizations').select('name').eq('id', organizationId).single(),
    supabase.from('roles').select('name').eq('id', roleId).single(),
    supabase.from('users').select('full_name').eq('id', inviterId).single(),
  ])

  return {
    organizationName: org?.name ?? 'your organization',
    roleName: role?.name ?? 'a role',
    inviterName: inviter?.full_name ?? 'A colleague',
  }
}

async function sendInvitationEmail(
  email: string,
  rawToken: string,
  context: { organizationName: string; roleName: string; inviterName: string },
  expiresAt: Date,
): Promise<{ delivered: boolean; warning: string | null }> {
  const message = renderEmployeeInvitationEmail({
    inviteUrl: invitationUrl(rawToken),
    organizationName: context.organizationName,
    roleName: context.roleName,
    inviterName: context.inviterName,
    expiresAt,
  })

  try {
    await sendEmail({ to: email, ...message })
    return { delivered: true, warning: null }
  } catch (error) {
    // Never a silent failure (Milestone 11's Observability requirement) —
    // sendEmail() has already logged it. The invitation row is committed
    // either way; this only changes what the directory shows next to it.
    const warning =
      error instanceof EmailDeliveryError
        ? error.message
        : 'The invitation email could not be sent. Share the link directly instead.'
    return { delivered: false, warning }
  }
}

export async function inviteEmployee(
  organizationId: string,
  rawInput: InviteEmployeeInput,
): Promise<InviteEmployeeResult> {
  const input = inviteEmployeeInputSchema.parse(rawInput)
  const inviter = await requirePermission('employees.invite', { organizationId })

  const supabase = await createServerSupabaseClient()

  // Already a member? Re-inviting an existing employee is a role-assignment
  // change, not an invitation — the two have different permission surfaces
  // (roles.assign vs employees.invite) and different UI flows.
  const { data: existingUser } = await supabase
    .from('users')
    .select('id, user_roles!inner(organization_id)')
    .eq('user_roles.organization_id', organizationId)
    .ilike('email', escapeIlike(input.email))
    .maybeSingle()
  if (existingUser) {
    throw new Error('This email address already belongs to an employee in your organization.')
  }

  const rawToken = generateInvitationToken()
  const tokenHash = hashInvitationToken(rawToken)
  const expiresAt = invitationExpiry()

  // Resend semantics: the partial unique index
  // (employee_invitations_pending_email_key) allows only one LIVE invitation
  // per (organization, email), so an existing pending row is updated with a
  // fresh token rather than inserted alongside a second one.
  const { data: existingInvitation } = await supabase
    .from('employee_invitations')
    .select('id')
    .eq('organization_id', organizationId)
    .ilike('email', escapeIlike(input.email))
    .is('accepted_at', null)
    .is('revoked_at', null)
    .maybeSingle()

  const invitationId = existingInvitation
    ? await (async () => {
        const { data, error } = await supabase
          .from('employee_invitations')
          .update({
            role_id: input.roleId,
            branch_id: input.branchId,
            business_unit_id: input.businessUnitId,
            token_hash: tokenHash,
            expires_at: expiresAt.toISOString(),
          })
          .eq('id', existingInvitation.id)
          .select('id')
          .single<{ id: string }>()
        if (error) throw error
        return data.id
      })()
    : await (async () => {
        const { data, error } = await supabase
          .from('employee_invitations')
          .insert({
            organization_id: organizationId,
            email: input.email,
            role_id: input.roleId,
            branch_id: input.branchId,
            business_unit_id: input.businessUnitId,
            token_hash: tokenHash,
            expires_at: expiresAt.toISOString(),
            created_by: inviter.id,
          })
          .select('id')
          .single<{ id: string }>()
        if (error) throw error
        return data.id
      })()

  await recordAuditEvent(
    {
      organizationId,
      userId: inviter.id,
      action: existingInvitation ? 'employee_invitation.resent' : 'employee_invitation.created',
      resourceType: 'employee_invitation',
      resourceId: invitationId,
      metadata: { email: input.email, roleId: input.roleId },
    },
    supabase,
  )

  const context = await loadInviteContext(supabase, organizationId, input.roleId, inviter.id)
  const { delivered, warning } = await sendInvitationEmail(
    input.email,
    rawToken,
    context,
    expiresAt,
  )
  if (!delivered) {
    await recordAuditEvent(
      {
        organizationId,
        userId: inviter.id,
        action: 'employee_invitation.email_failed',
        resourceType: 'employee_invitation',
        resourceId: invitationId,
        metadata: { email: input.email, reason: warning },
      },
      supabase,
    )
  }

  return {
    invitationId,
    inviteUrl: invitationUrl(rawToken),
    emailDelivered: delivered,
    emailWarning: warning,
  }
}

export async function revokeInvitation(organizationId: string, invitationId: string): Promise<void> {
  const user = await requirePermission('employees.invite', { organizationId })
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('employee_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invitationId)
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'employee_invitation.revoked',
      resourceType: 'employee_invitation',
      resourceId: invitationId,
    },
    supabase,
  )
}

export async function setEmployeeActive(
  organizationId: string,
  rawInput: SetEmployeeActiveInput,
): Promise<void> {
  const input = setEmployeeActiveInputSchema.parse(rawInput)
  const supabase = await createServerSupabaseClient()

  // No requirePermission() call and no recordAuditEvent() call here — both
  // already happen inside set_employee_active() (see file header).
  const { error } = await supabase.rpc('set_employee_active', {
    p_user_id: input.userId,
    p_organization_id: organizationId,
    p_active: input.active,
  })
  if (error) throw error
}
