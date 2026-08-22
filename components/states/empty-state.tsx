import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Shared empty-state pattern — docs/UXUI_Design_System_Specification.md §49:
 * "Explain what the user should do" (e.g. "No products yet. Create your
 * first product to start selling."), never a bare blank area. Used by both
 * shells and every later milestone's list/table screens.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center',
        className,
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-body font-medium">{title}</p>
        {description && <p className="text-body-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}
