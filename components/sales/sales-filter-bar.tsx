'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePendingToast } from '@/hooks/use-pending-toast'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * Filters for the /sales list, kept in the URL — the same pattern
 * components/reports/report-filter-bar.tsx uses, and for the same reason:
 * the list is fetched and keyset-paginated server-side, so the filter has to
 * reach the server, and a shareable/bookmarkable URL is a bonus. Each change
 * is a `router.push` inside a transition so the table below can show it is
 * refetching.
 */
const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'store_credit', label: 'Store credit' },
]

const ALL = '__all__'

export function SalesFilterBar() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  usePendingToast(pending, 'Updating results…', 400)

  const get = (key: string) => searchParams.get(key) ?? ''
  const hasAny = ['q', 'from', 'to', 'method'].some((key) => searchParams.get(key))

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    startTransition(() => router.push(`?${next.toString()}`, { scroll: false }))
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card sm:flex-row sm:flex-wrap sm:items-end"
      aria-busy={pending}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-xs">
        <Label htmlFor="sales-search">Search</Label>
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="sales-search"
            defaultValue={get('q')}
            placeholder="Receipt # or cashier name"
            className="pl-8"
            onBlur={(event) => {
              if (event.target.value.trim() !== get('q')) update({ q: event.target.value.trim() })
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') update({ q: event.currentTarget.value.trim() })
            }}
          />
        </div>
      </div>

      {/* `min-w-0 w-full sm:w-auto` — a bare `flex flex-col` wrapper around a
          mobile `<input type="date">` (which carries a UA intrinsic min width
          for its spinner + calendar glyph) grows past the card's `p-4` on a
          narrow screen. Same guard report-filter-bar.tsx already applies. */}
      <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto">
        <Label htmlFor="sales-from">From</Label>
        <Input
          id="sales-from"
          type="date"
          value={get('from')}
          max={get('to') || undefined}
          onChange={(event) => update({ from: event.target.value })}
        />
      </div>

      <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto">
        <Label htmlFor="sales-to">To</Label>
        <Input
          id="sales-to"
          type="date"
          value={get('to')}
          min={get('from') || undefined}
          onChange={(event) => update({ to: event.target.value })}
        />
      </div>

      <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto">
        <Label htmlFor="sales-method">Payment</Label>
        <Select
          value={get('method') || ALL}
          onValueChange={(value) => update({ method: value === ALL ? null : value })}
        >
          <SelectTrigger id="sales-method" className="w-full sm:w-40">
            <SelectValue placeholder="Any method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any method</SelectItem>
            {PAYMENT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasAny && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => update({ q: null, from: null, to: null, method: null })}
          disabled={pending}
        >
          <X className="size-4" /> Clear
        </Button>
      )}
    </div>
  )
}
