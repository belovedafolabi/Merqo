'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Monitor, Moon, Sun } from 'lucide-react'
import { toast } from 'sonner'

import { setThemePreferenceAction } from '@/app/(app)/settings/account/theme-actions'
import { THEME_COOKIE, type ThemePreference } from '@/lib/theme/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

function applyLocally(preference: ThemePreference) {
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

/**
 * Light / Dark / System for the Admin shell (the POS and auth screens are
 * always light). Server-persisted per user (users.theme_preference), so the
 * choice follows the account to another device or browser. Applied
 * optimistically here, then router.refresh() re-runs the shell layout so
 * <ThemeSync> picks up the new stored value.
 */
export function AppearanceCard({ current }: { current: ThemePreference }) {
  const router = useRouter()
  const [selected, setSelected] = useState<ThemePreference>(current)
  const [pending, startTransition] = useTransition()

  function choose(preference: ThemePreference) {
    if (preference === selected) return
    setSelected(preference)
    applyLocally(preference)
    startTransition(async () => {
      const { error } = await setThemePreferenceAction(preference)
      if (error) {
        toast.error('Could not save your theme', { description: error })
        return
      }
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Theme for the admin dashboard. Saved to your account, so it follows you to other devices.
          The point-of-sale screen always stays light.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2 sm:max-w-md">
          {OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected === value}
              disabled={pending}
              onClick={() => choose(value)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-lg border p-3 text-body-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60',
                selected === value
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-input text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-5" />
              {label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
