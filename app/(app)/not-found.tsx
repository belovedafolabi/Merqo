import Link from 'next/link'
import { FileQuestion } from 'lucide-react'

import { AdminTopbar } from '@/components/shell/admin-topbar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/states/empty-state'

/**
 * In-shell 404 for the Admin Dashboard. The four `notFound()` call sites
 * (customers/[customerId], products/[productId], reports/[reportId],
 * reports/[reportId]/print) resolve here, so a missing record still renders
 * with the sidebar/topbar rather than dropping to the bare root 404.
 *
 * Shaped like app/(app)/error.tsx — no <html>, just the inner block; the
 * group layout supplies the chrome.
 */
export default function AppNotFound() {
  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Not found" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <EmptyState
          icon={FileQuestion}
          title="Page not found"
          description="That page doesn't exist, or the record was removed."
          action={
            <Button asChild>
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          }
        />
      </div>
    </div>
  )
}
