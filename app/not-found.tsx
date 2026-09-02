import Link from 'next/link'
import { FileQuestion } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/states/empty-state'

/**
 * Root 404 — renders inside app/layout.tsx only (no shell), for URLs that
 * match no route segment at all (e.g. a stale bookmark). Explicit
 * `notFound()` calls inside app/(app)/** resolve to app/(app)/not-found.tsx
 * instead, so they keep the admin chrome.
 *
 * Actionable copy per docs/UXUI_Design_System_Specification.md §49 — a way
 * back, not "Error 404".
 */
export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-1 items-center justify-center bg-background p-6 text-foreground">
      <EmptyState
        icon={FileQuestion}
        title="Page not found"
        description="We couldn't find that page. It may have moved, or the link may be out of date."
        action={
          <Button asChild>
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        }
        className="max-w-md"
      />
    </main>
  )
}
