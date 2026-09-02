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
 */
export function usePendingToast(active: boolean, label: string): void {
  useEffect(() => {
    if (!active) return
    return notifyPending(label)
  }, [active, label])
}
