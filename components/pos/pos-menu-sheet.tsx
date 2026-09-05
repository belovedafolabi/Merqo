'use client'

import Link from 'next/link'
import { LayoutDashboard, LogOut, Menu, RotateCcw, UserRound } from 'lucide-react'

import { signOut } from '@/app/(auth)/actions'
import { HeldSalesTabs } from '@/components/pos/held-sales-tabs'
import { OpenCustomerDisplayButton } from '@/components/pos/open-customer-display-button'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

/**
 * The POS header menu — the button was dead markup before Milestone 17 Part D
 * (no `onClick`, no drawer to open). It now opens a right-side sheet.
 *
 * The sheet is the phone's home for the actions the compact header drops below
 * `sm` (Returns, customer display, walk-in customer) and, at any width, for
 * the ones that never fit a till header: back to the Admin dashboard, held
 * sales, and sign out — the POS shell's first sign-out control.
 *
 * No business-unit switcher: components/shell/business-unit-switcher.tsx does
 * not actually switch anything (its one item links to /business-structure,
 * which a cashier can't open), so the current unit is shown as static text.
 *
 * "Back to Admin dashboard" is shown only when `canReachAdmin` — a
 * till-only operator (Cashier / Waiter / Kitchen Staff) has no business on
 * the admin side, and the item read as noise for every non-manager. The
 * flag is computed from the user's grants in app/(pos)/layout.tsx.
 *
 * Kept a server-free client island so components/pos/pos-header.tsx stays a
 * server component: Radix's SheetTrigger supplies `aria-expanded`,
 * `aria-controls`, and focus return on its own.
 */
export function PosMenuSheet({
  branchName,
  businessUnitName,
  cashierName,
  canReachAdmin,
}: {
  branchName: string
  businessUnitName: string
  cashierName: string
  canReachAdmin: boolean
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-touch" aria-label="Menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80 gap-0 sm:max-w-sm">
        <SheetHeader className="border-b">
          <SheetTitle>{businessUnitName}</SheetTitle>
          <p className="text-sm text-muted-foreground">{branchName}</p>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <UserRound className="size-4" /> {cashierName}
          </p>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {/* Compact-header overflow — only where the header actually hides it.
              These are full navigations, so they unmount the sheet on their
              own; no SheetClose wrapper needed (and nesting it inside asChild
              buttons broke the click). */}
          <div className="flex flex-col gap-1 sm:hidden">
            <Button asChild variant="ghost" className="w-full justify-start gap-2">
              <Link href="/pos/returns">
                <RotateCcw className="size-4" /> Returns
              </Link>
            </Button>
            <OpenCustomerDisplayButton label="Open customer display" />
            <Button variant="ghost" className="w-full justify-start gap-2" disabled>
              Walk-in customer
            </Button>
            <div className="my-1 border-t" />
          </div>

          <div className="px-2 pt-1 pb-2">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Held sales</p>
            <HeldSalesTabs />
          </div>

          {canReachAdmin && (
            <>
              <div className="my-1 border-t" />
              <Button asChild variant="ghost" className="w-full justify-start gap-2">
                <Link href="/dashboard">
                  <LayoutDashboard className="size-4" /> Back to Admin dashboard
                </Link>
              </Button>
            </>
          )}
        </div>

        <div className="border-t p-2">
          <form action={signOut}>
            <Button
              type="submit"
              variant="ghost"
              className="w-full justify-start gap-2 text-destructive hover:text-destructive"
            >
              <LogOut className="size-4" /> Sign out
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
