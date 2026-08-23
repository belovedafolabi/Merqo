import Link from 'next/link'
import { Menu, RotateCcw, User, Wifi } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

/**
 * POS shell header — kept extremely compact per
 * docs/UXUI_Design_System_Specification.md §16 ("Avoid a large SaaS-style
 * header"): business unit, cashier, customer, connection status, quick
 * actions, menu. `branchName` arrives from Milestone 05's onboarding state
 * (app/(pos)/layout.tsx); real customer data arrives with Milestone 09.
 */
export function PosHeader({
  cashierName,
  branchName,
}: {
  cashierName: string
  branchName: string
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-card px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate text-body-sm font-semibold">{branchName}</span>
        <Badge variant="outline" className="hidden gap-1 sm:inline-flex">
          <Wifi className="size-3" /> Online
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-1.5 text-body-sm text-muted-foreground sm:flex">
          <User className="size-4" /> {cashierName}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="hidden gap-1.5 rounded-full sm:inline-flex"
          asChild
        >
          <Link href="/pos/returns">
            <RotateCcw className="size-3.5" /> Returns
          </Link>
        </Button>
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
