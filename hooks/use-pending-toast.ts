'use client'

import { useEffect } from 'react'

import { notifyPending } from '@/lib/toast'

/**
 * Shows a shimmering "…in progress" toast while `active` is true and
 * dismisses it when `active` flips false (or the component unmounts).
 *
 * For `useActionState` / `useFormStatus` `pending` flags where the button is
 * already disabled but the work (sign-in, upload, onboarding submit) is
 * worth surfacing as background activity.
 *
 * `delayMs` holds the toast back until the work has run that long — so a
 * fast search that resolves in a few hundred ms never flashes a toast, and
 * only a genuinely slow one surfaces (the 300ms "loading needs feedback"
 * threshold from the design guidelines). Defaults to 0 (immediate).
 */
export function usePendingToast(active: boolean, label: string, delayMs = 0): void {
  useEffect(() => {
    if (!active) return
    if (delayMs <= 0) return notifyPending(label)

    let dismiss: (() => void) | undefined
    const timer = setTimeout(() => {
      dismiss = notifyPending(label)
    }, delayMs)
    return () => {
      clearTimeout(timer)
      dismiss?.()
    }
  }, [active, label, delayMs])
}
