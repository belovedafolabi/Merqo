import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

/**
 * Shared loading-state skeletons, per docs/UXUI_Design_System_Specification.md
 * §49: "Skeletons rather than blank screens." Built on shadcn's `Skeleton`
 * primitive — these are the three shapes every later milestone's list/table/
 * card screens reuse rather than hand-rolling their own pulse placeholders.
 */

export function CardSkeleton() {
  return (
    <Card className="gap-3 py-5 shadow-card">
      <CardHeader className="gap-2 px-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-32" />
      </CardHeader>
      <CardContent className="px-5">
        <Skeleton className="h-4 w-20" />
      </CardContent>
    </Card>
  )
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4">
          {Array.from({ length: columns }, (_, columnIndex) => (
            <Skeleton key={columnIndex} className="h-6 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function ListSkeleton({ items = 4 }: { items?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: items }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}
