'use client'

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
 * (docs/UXUI_Design_System_Specification.md §13/§14: "the application needs
 * a very clear context switcher" for the user's active Branch/Business Unit
 * context). A placeholder here — real Branch/Business Unit CRUD is
 * Milestone 05's scope, so this milestone ships the *slot* this control
 * lives in and its visual treatment, not live data or the context-switching
 * behavior itself. Documented as a placeholder in the style guide
 * (app/(dev)/style-guide/page.tsx).
 */
export function BusinessUnitSwitcher() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <span className="flex min-w-0 items-center gap-2">
            <MapPin className="size-4 shrink-0" />
            <span className="truncate text-sm">No branch configured</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem disabled>Branches arrive in Milestone 05</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
