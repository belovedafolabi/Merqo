'use client'

import Link from 'next/link'
import { ChevronsUpDown, MapPin } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

/**
 * Branch -> Business Unit context switcher
 * (docs/UXUI_Design_System_Specification.md §13/§14). Shows the
 * organization's current (first-created) Branch/Business Unit — real data
 * as of Milestone 05, replacing the "Branches arrive in Milestone 05"
 * placeholder this component previously rendered.
 *
 * Deliberately not a full multi-branch/business-unit *switcher* yet: doing
 * so would need a persisted "active context" (a cookie or session column)
 * this milestone's own Scope never asks for — Business Structure management
 * (the linked menu item below) is where multiple branches/units are created
 * and edited. Upgrading this to real switching, if a later milestone needs
 * it, only requires adding that persisted selection — the display slot
 * already exists here.
 */
export function BusinessUnitSwitcher({
  branchName,
  businessUnitName,
}: {
  branchName: string | null
  businessUnitName: string | null
}) {
  const label =
    businessUnitName && branchName ? `${businessUnitName} · ${branchName}` : 'No branch yet'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          data-tour="business-unit-switcher"
          variant="outline"
          className="w-full justify-between border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <span className="flex min-w-0 items-center gap-2">
            <MapPin className="size-4 shrink-0" />
            <span className="truncate text-sm">{label}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem asChild>
          <Link href="/business-structure">Manage business structure</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
