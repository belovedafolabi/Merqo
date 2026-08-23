'use client'

import { createContext, useContext } from 'react'

import type { PosConfig } from '@/lib/business-structure/queries'

/**
 * The active branch/business-unit/POS-config for this POS terminal session —
 * seeded once, server-side, in app/(pos)/layout.tsx (same shape as
 * lib/auth/permissions-context.tsx's PermissionsProvider: no client-side
 * fetch, no separate resolution logic). Every POS component that needs
 * "which branch/business unit is this checkout for" reads it from here
 * rather than re-deriving it or threading it down as props through every
 * layer of the cart/checkout tree.
 */
export interface PosSession {
  organizationId: string
  branchId: string
  businessUnitId: string
  posConfig: PosConfig
}

const PosSessionContext = createContext<PosSession | null>(null)

export function PosSessionProvider({
  session,
  children,
}: {
  session: PosSession
  children: React.ReactNode
}) {
  return <PosSessionContext.Provider value={session}>{children}</PosSessionContext.Provider>
}

/**
 * Throws rather than returning null/undefined — every component that calls
 * this only ever renders inside app/(pos)'s tree, where the provider is
 * always present; a missing provider is a wiring bug worth surfacing loudly,
 * not silently degrading the checkout screen.
 */
export function usePosSession(): PosSession {
  const session = useContext(PosSessionContext)
  if (!session) {
    throw new Error('usePosSession() called outside <PosSessionProvider>.')
  }
  return session
}
