'use client'

import { useSyncExternalStore } from 'react'

import { Toaster } from '@/components/ui/sonner'

/**
 * Sonner renders its toast container inline (not portalled) but at
 * `position: fixed`, so where it sits in the DOM is irrelevant to layout yet
 * decides which CSS custom properties it inherits. Mounted in the root layout
 * at <body> level, `--normal-bg: var(--popover)` resolved to the light `:root`
 * value even when the Admin shell was in dark mode.
 *
 * This wrapper mirrors the Admin shell's resolved theme — read from the `.dark`
 * class the shell stamps on its `[data-theme-pref]` root — onto a plain
 * wrapper element, so the toaster inside it inherits the dark tokens. Outside
 * the Admin shell there is no `[data-theme-pref]`; the toaster stays light,
 * which is correct for the POS / auth / onboarding shells.
 */
const THEME_ROOT = '[data-theme-pref]'

function subscribe(onChange: () => void): () => void {
  const el = document.querySelector(THEME_ROOT)
  if (!el) return () => {}
  const observer = new MutationObserver(onChange)
  observer.observe(el, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

function isDark(): boolean {
  return document.querySelector(THEME_ROOT)?.classList.contains('dark') ?? false
}

export function ThemedToaster() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false)
  return (
    <div className={dark ? 'dark' : undefined}>
      <Toaster theme={dark ? 'dark' : 'light'} />
    </div>
  )
}
