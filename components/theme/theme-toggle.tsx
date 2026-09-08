'use client'

import { useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Moon, Sun } from 'lucide-react'
import { toast } from 'sonner'

import { setThemePreferenceAction } from '@/app/(app)/settings/account/theme-actions'
import { applyThemeLocally, isShellDark } from '@/lib/theme/apply-theme'
import { Button } from '@/components/ui/button'

const THEME_ROOT = '[data-theme-pref]'

/** Subscribe to `.dark` toggles on the shell root (same source as ThemedToaster). */
function subscribe(onChange: () => void): () => void {
  const el = document.querySelector(THEME_ROOT)
  if (!el) return () => {}
  const observer = new MutationObserver(onChange)
  observer.observe(el, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

/**
 * Compact light/dark switch for the Admin topbar. Flips between the two
 * explicit themes (System stays available in Settings → Appearance); applies
 * optimistically via applyThemeLocally, then persists with
 * setThemePreferenceAction + router.refresh() so <ThemeSync> and the server
 * layout pick up the stored value.
 *
 * Reads the current theme from the live DOM (`.dark` on `[data-theme-pref]`),
 * so it needs no prop from the non-async AdminTopbar and stays in sync when
 * the Settings card or an OS scheme change flips the class.
 */
export function ThemeToggle() {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const dark = useSyncExternalStore(subscribe, isShellDark, () => false)
  const next = dark ? 'light' : 'dark'

  function toggle() {
    // Flip the shell immediately; persist + re-sync the server layout in the
    // background. The button stays enabled — the visual change already landed
    // and a rapid re-toggle is harmless.
    applyThemeLocally(next)
    startTransition(async () => {
      const { error } = await setThemePreferenceAction(next)
      if (error) {
        toast.error('Could not save your theme', { description: error })
        applyThemeLocally(dark ? 'dark' : 'light')
        return
      }
      router.refresh()
    })
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  )
}
