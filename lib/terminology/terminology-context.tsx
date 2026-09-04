'use client'

import { createContext, useContext, useMemo } from 'react'

import { GENERIC_TERMS, makeT, type TerminologyMap, type TFn } from '@/lib/terminology/types'

/**
 * Milestone 17 Part B — the client half of the terminology resolver, shaped
 * exactly like lib/auth/permissions-context.tsx. Seeded once, server-side,
 * with the map getTerminology() resolved for the request (see the app and POS
 * layouts) — no client fetch. Server components call getTerminology() +
 * makeT() directly instead of using this.
 */
const TerminologyContext = createContext<TerminologyMap | null>(null)

export function TerminologyProvider({
  terminology,
  children,
}: {
  terminology: TerminologyMap
  children: React.ReactNode
}) {
  return <TerminologyContext.Provider value={terminology}>{children}</TerminologyContext.Provider>
}

/** `const t = useTerminology(); t('sale')` → "Bill" for a restaurant. */
export function useTerminology(): TFn {
  const map = useContext(TerminologyContext)
  return useMemo(() => makeT(map ?? GENERIC_TERMS), [map])
}
