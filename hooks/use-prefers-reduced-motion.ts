import * as React from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Whether the viewer has asked the OS to reduce motion. Same
 * `useSyncExternalStore` shape as hooks/use-mobile.ts — the media query is an
 * external store React can read safely, and `getServerSnapshot` returns the
 * motion-allowed default so SSR and the first client paint agree.
 *
 * Used by JS-driven animation (Recharts) that a CSS `@media
 * (prefers-reduced-motion)` rule cannot reach; the stylesheet already handles
 * everything expressible in CSS.
 */
function subscribe(onStoreChange: () => void): () => void {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onStoreChange)
  return () => mql.removeEventListener('change', onStoreChange)
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches
}

function getServerSnapshot(): boolean {
  return false
}

export function usePrefersReducedMotion(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
