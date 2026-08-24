import { hashInvitationToken } from '@/lib/employees/invitations'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AuthCard } from '@/components/auth/auth-card'
import { InviteAcceptForm } from '@/components/auth/invite-accept-form'

interface InvitationStatus {
  organization_name: string
  role_name: string
  email: string
  expires_at: string
  status: 'pending' | 'expired' | 'accepted' | 'revoked'
}

const STATUS_COPY: Record<Exclude<InvitationStatus['status'], 'pending'>, string> = {
  expired: 'This invitation has expired. Ask whoever invited you to send a new one.',
  accepted: 'This invitation has already been accepted. Try signing in instead.',
  revoked: 'This invitation has been revoked.',
}

/**
 * The invite-acceptance landing page. Public (proxy.ts exempts /invite/*)
 * because the invitee may have no session at all, or a session under a
 * different account — both are legitimate visitors here.
 *
 * The raw token lives only in the URL; it is hashed here, server-side,
 * before it ever touches a query — get_employee_invitation()
 * (20260824090500) takes the hash, never the raw value, matching what is
 * actually stored in employee_invitations.token_hash.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const tokenHash = hashInvitationToken(token)

  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .rpc('get_employee_invitation', { p_token_hash: tokenHash })
    .single<InvitationStatus>()

  if (!data) {
    return (
      <AuthCard title="Invitation not found">
        <p className="text-body-sm text-muted-foreground">
          This invitation link is invalid. Ask whoever invited you to send a new one.
        </p>
      </AuthCard>
    )
  }

  if (data.status !== 'pending') {
    return (
      <AuthCard title="Invitation unavailable">
        <p className="text-body-sm text-muted-foreground">{STATUS_COPY[data.status]}</p>
      </AuthCard>
    )
  }

  return (
    <AuthCard title={`Join ${data.organization_name}`}>
      <p className="text-body-sm text-muted-foreground">
        You have been invited as <strong>{data.role_name}</strong>. Set up your account with{' '}
        <strong>{data.email}</strong> to accept.
      </p>
      <InviteAcceptForm token={token} email={data.email} />
    </AuthCard>
  )
}
