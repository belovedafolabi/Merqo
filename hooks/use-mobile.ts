import * as React from 'react'

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * `useSyncExternalStore` rather than useState+useEffect, because the viewport
 * IS an external store and React already knows how to read one safely.
 *
 * The previous shape — a lazy `useState` initializer plus an effect that only
 * subscribed — could not self-correct: the initializer runs during hydration
 * and reads the real viewport, but the server had rendered `false`, and a
 * phone that simply loads the page narrow never fires a `change` event, so
 * nothing ever reconciled the two. That left `isMobile` false on a phone,
 * which made components/ui/sidebar.tsx render its `hidden md:block` desktop
 * branch (never mounting the mobile Sheet) and made SidebarTrigger toggle the
 * desktop collapse state instead of the mobile one.
 *
 * Adding a `setIsMobile()` call to the effect body would fix the value but
 * trips this project's `react-hooks/set-state-in-effect` rule. This hook has
 * no such problem: `getServerSnapshot` declares the SSR value explicitly and
 * React re-reads `getSnapshot` on the client after hydration.
 */
function subscribe(onStoreChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener('change', onStoreChange)
  return () => mql.removeEventListener('change', onStoreChange)
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches
}

/** No viewport during SSR — the desktop branch is the safe default to emit. */
function getServerSnapshot(): boolean {
  return false
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
