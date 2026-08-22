import { NextResponse, type NextRequest } from 'next/server'
import { type EmailOtpType } from '@supabase/supabase-js'

import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Supabase's documented SSR email-link pattern: the password-reset email
 * (requestPasswordReset() in app/(auth)/actions.ts) points here with a
 * token_hash + type=recovery; verifying it establishes a live (recovery)
 * session before handing off to /reset-password, where
 * confirmPasswordReset() can call auth.updateUser({ password }). Uses
 * NextResponse.redirect (not next/navigation's redirect(), which relies on
 * the Server Component/Action render pipeline this plain Route Handler
 * doesn't go through).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  if (tokenHash && type) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      return NextResponse.redirect(
        new URL(type === 'recovery' ? '/reset-password' : '/dashboard', request.url),
      )
    }
  }

  return NextResponse.redirect(new URL('/sign-in?error=invalid-or-expired-link', request.url))
}
