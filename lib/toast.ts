import { toast } from 'sonner'

/**
 * Thin wrappers over sonner for signalling background work to the user.
 *
 * Loading toasts render with a shimmering title (`.merqo-toast-loading` in
 * app/globals.css, wired via components/ui/sonner.tsx).
 *
 * Policy (Milestone 17 Part D, set by the product owner): every user-initiated
 * async operation gets a loading toast and a settle (success / error) toast —
 * including when the triggering control is already disabled or spinning. The
 * earlier guidance here ("only work not already obvious from a disabled
 * button") is superseded. The `TOAST_DELAY_MS` anti-flash guard below still
 * applies, so a sub-300ms action never actually flashes a toast — "blanket"
 * means every action is *wired*, not that an instant one shows anything.
 *
 * The one carve-out: debounced type-ahead search (pos-search, filter bars)
 * does not toast on each keystroke pause — only on an explicit submit / apply.
 *
 * Most call sites should reach for `useActionToast` (hooks/use-action-toast.ts),
 * which wires both toasts onto a `useActionState` pair in one line. `notify`
 * and `notifyPending` are the lower-level primitives it is built from.
 */

/**
 * Anti-flash threshold: a loading toast is held back this long, so an action
 * that resolves faster than the eye can track never surfaces one. 300ms is the
 * "loading needs feedback" figure from the design guidelines.
 */
export const TOAST_DELAY_MS = 300

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
