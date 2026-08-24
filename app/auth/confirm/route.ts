import { NextResponse, type NextRequest } from 'next/server'
import { type EmailOtpType } from '@supabase/supabase-js'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ensureOrganizationBootstrapped } from '@/lib/organization/mutations'

/**
 * Supabase's documented SSR email-link pattern: the password-reset email
 * (requestPasswordReset() in app/(auth)/actions.ts) points here with a
 * token_hash + type=recovery; verifying it establishes a live (recovery)
 * session before handing off to /reset-password, where
 * confirmPasswordReset() can call auth.updateUser({ password }). Uses
 * NextResponse.redirect (not next/navigation's redirect(), which relies on
 * the Server Component/Action render pipeline this plain Route Handler
 * doesn't go through).
 *
 * Every non-recovery confirmation (signUp()'s own emailRedirectTo points
 * here with type=signup) also gets a shot at organization bootstrap here —
 * defense-in-depth alongside signIn()'s own call, since a user who never
 * signs in again but does click the confirmation link should still end up
 * with an organization. Harmless/no-op for an invited employee (no
 * organization_name in their metadata) and for a user who already has one.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  if (tokenHash && type) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      if (type !== 'recovery') {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user) await ensureOrganizationBootstrapped(supabase, user)
      }
      return NextResponse.redirect(
        new URL(type === 'recovery' ? '/reset-password' : '/dashboard', request.url),
      )
    }
  }

  return NextResponse.redirect(new URL('/sign-in?error=invalid-or-expired-link', request.url))
}
