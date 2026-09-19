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
 *
 * `opts.animate` plays a brief scale/fade "pop" over the shell as the theme
 * flips (see `@keyframes merqo-theme-pop`). Only the user-initiated toggles
 * pass it; <ThemeSync> (mount / OS-scheme changes) does not, so navigation
 * never flashes. Suppressed under `prefers-reduced-motion`.
 */
const THEME_POP_ID = 'merqo-theme-pop'

function playThemePop(root: HTMLElement): void {
  document.getElementById(THEME_POP_ID)?.remove()

  const overlay = document.createElement('div')
  overlay.id = THEME_POP_ID
  overlay.setAttribute('aria-hidden', 'true')
  // Inside `root` so `var(--background)` resolves the OUTGOING themed value,
  // not the light `:root` default (the overlay would otherwise flash white
  // going light → dark).
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;pointer-events:none;background:var(--background);'
  root.appendChild(overlay)
  // Freeze the outgoing colour as a literal so it stays put once the class
  // below flips the theme underneath it.
  overlay.style.background = getComputedStyle(overlay).backgroundColor
  overlay.style.animation = 'merqo-theme-pop 280ms ease-out forwards'

  const remove = () => overlay.remove()
  overlay.addEventListener('animationend', remove, { once: true })
  window.setTimeout(remove, 600)
}

export function applyThemeLocally(preference: ThemePreference, opts?: { animate?: boolean }): void {
  const root = document.querySelector<HTMLElement>('[data-theme-pref]')
  if (!root) return

  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (opts?.animate && !reduceMotion) playThemePop(root)

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
