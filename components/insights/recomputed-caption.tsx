'use client'

import { useActionState } from 'react'
import { RefreshCw } from 'lucide-react'

import { refreshInsightsAction, type InsightsActionState } from '@/app/(app)/insights/actions'
import { Button } from '@/components/ui/button'
import { useActionToast } from '@/hooks/use-action-toast'

const initialState: InsightsActionState = { error: null }

function relative(iso: string | null): string {
  if (!iso) return 'never computed'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  return `${hours} hour${hours === 1 ? '' : 's'} ago`
}

/**
 * Milestone 17 Part A — "Recomputed X ago" plus a manual refresh. The refresh
 * is permission-gated in the action and rate-limited to once a minute, so this
 * button can't be used to hammer the compute function.
 */
export function RecomputedCaption({
  computedAt,
  businessUnitId,
}: {
  computedAt: string | null
  businessUnitId: string
}) {
  const [state, formAction, pending] = useActionState(refreshInsightsAction, initialState)
  useActionToast(state, pending, { loading: 'Refreshing insights…', success: 'Insights refreshed' })

  return (
    <div className="flex items-center gap-3 text-caption text-muted-foreground">
      <span>Recomputed {relative(computedAt)}</span>
      <form action={formAction}>
        <input type="hidden" name="businessUnitId" value={businessUnitId} />
        <Button type="submit" variant="ghost" size="xs" disabled={pending}>
          <RefreshCw className="size-3" />
          {pending ? 'Refreshing…' : 'Refresh now'}
        </Button>
      </form>
    </div>
  )
}
