'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { usePendingToast } from '@/hooks/use-pending-toast'

/**
 * Wires the Milestone 17 Part D blanket-toast policy onto one `useActionState`
 * pair: a shimmering loading toast while the action runs, then a success or
 * error toast when it settles.
 *
 * Add it beside `useActionState` and pass the same `state` and `pending`:
 *
 *   const [state, formAction, pending] = useActionState(saveThing, initialState)
 *   useActionToast(state, pending, { loading: 'Saving…', success: 'Saved' })
 *
 * The settle toast fires on the falling edge of `pending` — `useActionState`
 * commits the new `state` and `pending: false` in the same render, so that
 * edge is the one reliable "the action just finished" signal. Comparing
 * `state` against `initialState` by identity is not: a second failed submit
 * returns a fresh error object that is never `initialState`, and a re-render
 * from the parent can swap the reference without any action having run.
 *
 * `state.error` is the app-wide convention for a failed Server Action; a
 * falsy value means success.
 */
export function useActionToast(
  state: { error: string | null },
  pending: boolean,
  messages: { loading: string; success: string },
): void {
  usePendingToast(pending, messages.loading)

  const wasPending = useRef(false)
  useEffect(() => {
    if (wasPending.current && !pending) {
      if (state.error) toast.error(state.error)
      else toast.success(messages.success)
    }
    wasPending.current = pending
  }, [pending, state, messages.success])
}
