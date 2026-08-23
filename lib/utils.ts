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
