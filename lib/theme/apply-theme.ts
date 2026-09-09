import { THEME_COOKIE, type ThemePreference } from '@/lib/theme/types'

/**
 * Client-side, optimistic theme application for the Admin shell. Toggles the
 * `.dark` class on the shell root (`[data-theme-pref]`, stamped server-side in
 * app/(app)/layout.tsx) and writes the `merqo_theme` cookie so a full reload
 * paints the same theme with no flash. The server action
 * (setThemePreferenceAction) still persists the choice to users.theme_preference
 * — this just avoids waiting a round trip for the visual change.
 *
 * Shared by the Settings → Appearance card and the topbar quick toggle. No
 * `next/headers` import, so it is safe in the client bundle.
 */
export function applyThemeLocally(preference: ThemePreference): void {
  const root = document.querySelector<HTMLElement>('[data-theme-pref]')
  if (!root) return
  root.setAttribute('data-theme-pref', preference)
  const resolved =
    preference === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : preference
  root.classList.toggle('dark', resolved === 'dark')
  document.cookie = `${THEME_COOKIE}=${resolved}; path=/; max-age=31536000; samesite=lax`
}

/** Whether the Admin shell is currently rendering dark (reads the live DOM). */
export function isShellDark(): boolean {
  return document.querySelector('[data-theme-pref]')?.classList.contains('dark') ?? false
}
