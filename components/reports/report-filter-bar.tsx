'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fromDateInputValue, toDateInputValue } from '@/lib/reports/params'
import type { ReportGroupingDef } from '@/lib/reports/catalog'
import type { ReportParameters } from '@/lib/reports/types'

export interface BranchOption {
  id: string
  name: string
}

/**
 * The report filter bar. Every control writes to the URL rather than to local
 * state — see lib/reports/params.ts for why. The server component above re-runs
 * the report on navigation, so there is no client-side fetching here at all.
 *
 * BRANCH SCOPING. The branch selector only offers "All branches" to a user who
 * holds `reports.view_all_branches`. This is an affordance, not the security
 * boundary: the report functions are SECURITY INVOKER, so a branch-scoped user
 * who edits the URL by hand still gets only their own branch's rows back. What
 * pinning the selector avoids is a user with an org-wide role assignment
 * *defaulting* into cross-branch figures they were never meant to see at a
 * glance (docs/Business_Structure_Branche.md §24.42).
 */
export function ReportFilterBar({
  parameters,
  branches,
  groupings,
  dateRanged,
  canViewAllBranches,
}: {
  parameters: ReportParameters
  branches: BranchOption[]
  groupings: readonly ReportGroupingDef[]
  dateRanged: boolean
  canViewAllBranches: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

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
      // Marked busy while the server re-runs the report, so a screen reader
      // announces that the numbers below are being replaced.
      aria-busy={pending}
    >
      {dateRanged && (
        <>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="report-from">From</Label>
            <Input
              id="report-from"
              type="date"
              value={toDateInputValue(parameters.from)}
              onChange={(event) =>
                update({ from: fromDateInputValue(event.target.value, 'start') })
              }
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="report-to">To</Label>
            <Input
              id="report-to"
              type="date"
              // The stored `to` is the exclusive end (the following midnight),
              // so a day is subtracted to show the inclusive date the user
              // actually picked.
              value={toDateInputValue(
                parameters.to
                  ? new Date(new Date(parameters.to).getTime() - 86_400_000).toISOString()
                  : null,
              )}
              onChange={(event) => update({ to: fromDateInputValue(event.target.value, 'end') })}
            />
          </div>
        </>
      )}

      {branches.length > 0 && (
        <div className="flex min-w-0 flex-col gap-1.5 sm:w-48">
          <Label htmlFor="report-branch">Branch</Label>
          <Select
            value={parameters.branchId ?? 'all'}
            onValueChange={(value) => update({ branch: value === 'all' ? null : value })}
          >
            <SelectTrigger id="report-branch">
              <SelectValue placeholder="All branches" />
            </SelectTrigger>
            <SelectContent>
              {canViewAllBranches && <SelectItem value="all">All branches</SelectItem>}
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {groupings.length > 0 && (
        <div className="flex min-w-0 flex-col gap-1.5 sm:w-44">
          <Label htmlFor="report-group">Group by</Label>
          <Select
            value={parameters.groupBy ?? groupings[0]?.value}
            onValueChange={(value) => update({ group: value })}
          >
            <SelectTrigger id="report-group">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {groupings.map((grouping) => (
                <SelectItem key={grouping.value} value={grouping.value}>
                  {grouping.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Button
        variant="ghost"
        onClick={() => startTransition(() => router.push('?', { scroll: false }))}
        disabled={pending}
        className="sm:ml-auto"
      >
        <RotateCcw /> Reset
      </Button>
    </div>
  )
}
