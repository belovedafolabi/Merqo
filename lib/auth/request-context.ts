import { headers } from 'next/headers'

/**
 * IP address + user agent for the current request, used by the login-
 * throttle and audit-log write paths. Server Actions and Route Handlers
 * don't get a raw request object the way middleware does, so this reads the
 * same headers Vercel (and most reverse proxies) set instead.
 */
export async function getRequestMeta(): Promise<{
  ipAddress: string | null
  userAgent: string | null
}> {
  const headerList = await headers()
  const forwardedFor = headerList.get('x-forwarded-for')
  const ipAddress = forwardedFor ? (forwardedFor.split(',')[0] ?? '').trim() || null : null

  return {
    ipAddress,
    userAgent: headerList.get('user-agent'),
  }
}
