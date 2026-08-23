import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * A URL/slug-safe rendering of a name — lowercased, non-alphanumeric runs
 * collapsed to a single hyphen, leading/trailing hyphens trimmed. Shared by
 * every row that carries a partial-unique `slug` column (organizations,
 * branches, business_units) rather than each call site reimplementing it —
 * originally inlined in app/(auth)/actions.ts's sign-up action, extracted
 * here once Milestone 05's branch/business-unit creation needed the same
 * logic.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Date/time rendering with the locale pinned explicitly, for anything that
 * renders during SSR.
 *
 * A bare `new Date(x).toLocaleDateString()` resolves its locale from the
 * runtime, which is the Node server on the first pass and the browser on
 * hydration. When those disagree — a Nigerian browser renders 23/08/2026
 * where the server renders 8/23/2026 — React throws "Hydration failed
 * because the server rendered text didn't match the client". Pinning the
 * locale makes both passes produce the same string, which is the actual fix
 * rather than suppressing the warning.
 *
 * 'en-NG' matches the currency formatting already used across the POS and
 * admin screens.
 */
const DATE_FORMATTER = new Intl.DateTimeFormat('en-NG', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-NG', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(value: string | Date): string {
  return DATE_FORMATTER.format(new Date(value))
}

export function formatDateTime(value: string | Date): string {
  return DATE_TIME_FORMATTER.format(new Date(value))
}
