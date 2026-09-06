'use client'

import { useEffect, useSyncExternalStore } from 'react'

import { THEME_COOKIE, type ThemePreference } from '@/lib/theme/types'

const MEDIA = '(prefers-color-scheme: dark)'

/** Subscribes to the OS colour-scheme without a setState-in-effect. */
function useSystemDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(MEDIA)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => window.matchMedia(MEDIA).matches,
    () => false,
  )
}

/**
 * Keeps the Admin shell's `.dark` class and the merqo_theme cookie in step
 * with the resolved theme. Renders nothing.
 *
 * The server (app/(app)/layout.tsx) already stamps `.dark` on the shell root
 * from the stored preference and the cookie, so an explicit light/dark
 * choice and a returning 'system' user paint correctly with no flash; this
 * only has real work to do for a 'system' user whose OS scheme isn't yet
 * reflected in the cookie (first load on a new device) and when the OS
 * scheme changes mid-session. The shell root is found by its
 * `data-theme-pref` attribute rather than a ref — server components can't
 * hand one down.
 */
export function ThemeSync({ preference }: { preference: ThemePreference }) {
  const systemDark = useSystemDark()
  const resolved: 'light' | 'dark' =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-theme-pref]')
    root?.classList.toggle('dark', resolved === 'dark')
    document.cookie = `${THEME_COOKIE}=${resolved}; path=/; max-age=31536000; samesite=lax`
  }, [resolved])

  return null
}
