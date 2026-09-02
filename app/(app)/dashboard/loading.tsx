import { CardSkeleton, PageHeaderSkeleton } from '@/components/states/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Dashboard has a card grid, not a table — mirror that so the transition
 * doesn't flash a table skeleton before the real cards land.
 */
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeaderSkeleton />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
