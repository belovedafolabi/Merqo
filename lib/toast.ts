import { toast } from 'sonner'

/**
 * Thin wrappers over sonner for signalling background work to the user.
 *
 * Loading toasts render with a shimmering title (`.merqo-toast-loading` in
 * app/globals.css, wired via components/ui/sonner.tsx). Use these for
 * user-initiated async work that isn't already obvious from a disabled
 * button — sign-in, uploads, checkout, exports — not for every server action.
 */

type Message<T> = string | ((value: T) => string)

/**
 * Attaches loading/success/error toasts to a promise and returns the same
 * promise so callers can still await it.
 */
export function notify<T>(
  promise: Promise<T>,
  messages: { loading: string; success: Message<T>; error: Message<unknown> },
): Promise<T> {
  toast.promise(promise, messages)
  return promise
}

/**
 * Fire-and-forget "…in progress" toast for work whose completion is handled
 * elsewhere (e.g. a Server Action that redirects, or `useActionState`
 * `pending`). Returns a dismiss function — call it when the work settles.
 */
export function notifyPending(label: string): () => void {
  const id = toast.loading(label)
  return () => toast.dismiss(id)
}
