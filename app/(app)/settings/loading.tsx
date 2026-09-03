import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Sits inside app/(app)/settings/layout.tsx, so its AdminTopbar and
 * SettingsNav stay on screen — only the panel below the nav is replaced
 * while a settings sub-page loads. That is deliberately different from the
 * generic app/(app)/loading.tsx, which blanks the whole inset.
 */
export default function Loading() {
  return (
    <Card className="shadow-card">
      <CardContent className="flex flex-col gap-4 pt-6">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-full max-w-md" />
          </div>
        ))}
        <Skeleton className="h-9 w-28" />
      </CardContent>
    </Card>
  )
}
