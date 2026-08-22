import { Menu, User, Wifi } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

/**
 * POS shell header — kept extremely compact per
 * docs/UXUI_Design_System_Specification.md §16 ("Avoid a large SaaS-style
 * header"): business unit, cashier, customer, connection status, quick
 * actions, menu. All placeholders here — real business-unit/customer data
 * arrives with Milestones 05/09.
 */
export function PosHeader({ cashierName }: { cashierName: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-card px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate text-body-sm font-semibold">No branch configured</span>
        <Badge variant="outline" className="hidden gap-1 sm:inline-flex">
          <Wifi className="size-3" /> Online
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-1.5 text-body-sm text-muted-foreground sm:flex">
          <User className="size-4" /> {cashierName}
        </span>
        <Button variant="outline" size="sm" className="rounded-full">
          Walk-in customer
        </Button>
        <Button variant="ghost" size="icon" aria-label="Menu">
          <Menu />
        </Button>
      </div>
    </header>
  )
}
