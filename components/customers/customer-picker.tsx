'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import { Search, UserPlus, UserRound, X } from 'lucide-react'

import { searchCustomersAction } from '@/app/(app)/customers/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePendingToast } from '@/hooks/use-pending-toast'
import type { Customer } from '@/lib/customers/queries'

/**
 * Find-or-attach a customer, shared by the POS checkout dialog and the
 * layaway creation dialog (this milestone's Frontend Changes: the customer
 * form is "reusable as a quick-add flow from the POS screen").
 *
 * Server-side search rather than filtering a preloaded list: at a till the
 * operator is looking through every customer in the business, not one page
 * of them, and searchCustomers() is backed by the pg_trgm and phone/email
 * indexes created in 20260823130000 for exactly this.
 *
 * Debounced at 250ms — fast enough to feel live while a cashier types, slow
 * enough not to fire a query per keystroke (Quick Reference §3
 * `debounce-throttle`).
 */
export function CustomerPicker({
  organizationId,
  selected,
  onSelect,
  onQuickAdd,
  label = 'Customer',
  helperText,
}: {
  organizationId: string
  selected: Customer | null
  onSelect: (customer: Customer | null) => void
  onQuickAdd?: () => void
  label?: string
  helperText?: string
}) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [isSearching, startSearch] = useTransition()
  usePendingToast(isSearching, 'Searching customers…', 400)
  const inputId = useId()

  // Clearing results belongs in the handler that clears the term, not in the
  // effect below — an effect that synchronously setStates is a cascading
  // render (react-hooks/set-state-in-effect), and "the user emptied the box"
  // is an event, not a synchronization.
  function handleTermChange(next: string) {
    setTerm(next)
    if (!next.trim()) setResults([])
  }

  useEffect(() => {
    if (selected) return
    const trimmed = term.trim()
    if (!trimmed) return

    const timer = setTimeout(() => {
      startSearch(async () => {
        setResults(await searchCustomersAction(organizationId, trimmed))
      })
    }, 250)

    return () => clearTimeout(timer)
  }, [term, selected, organizationId])

  if (selected) {
    return (
      <div className="flex flex-col gap-2">
        <Label>{label}</Label>
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3">
          <div className="flex min-w-0 items-center gap-2">
            <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{selected.name}</span>
              <span className="truncate text-xs text-muted-foreground tabular-nums">
                {selected.phone ?? selected.customerCode}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onSelect(null)
              handleTermChange('')
            }}
          >
            <X aria-hidden="true" />
            <span>Remove</span>
          </Button>
        </div>
        {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={inputId}>{label}</Label>
        {onQuickAdd && (
          <Button type="button" variant="ghost" size="sm" onClick={onQuickAdd}>
            <UserPlus aria-hidden="true" /> New
          </Button>
        )}
      </div>

      <div className="relative">
        <Search
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={inputId}
          value={term}
          onChange={(event) => handleTermChange(event.target.value)}
          placeholder="Search by name, phone, or email…"
          className="pl-9"
          autoComplete="off"
        />
      </div>

      {term.trim() && (
        <div
          role="listbox"
          aria-label="Matching customers"
          className="max-h-48 overflow-y-auto rounded-lg border"
        >
          {isSearching && results.length === 0 && (
            <p className="p-3 text-body-sm text-muted-foreground">Searching…</p>
          )}
          {!isSearching && results.length === 0 && (
            <p className="p-3 text-body-sm text-muted-foreground">
              No matching customer.{onQuickAdd ? ' Use “New” to add one.' : ''}
            </p>
          )}
          {results.map((customer) => (
            <button
              key={customer.id}
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => {
                onSelect(customer)
                handleTermChange('')
              }}
              className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            >
              <span className="font-medium">{customer.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {[customer.phone, customer.email, customer.customerCode]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </button>
          ))}
        </div>
      )}

      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
    </div>
  )
}
