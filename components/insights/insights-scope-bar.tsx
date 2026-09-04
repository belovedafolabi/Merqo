'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePendingToast } from '@/hooks/use-pending-toast'

export interface InsightsUnitOption {
  id: string
  label: string
}

/**
 * Milestone 17 Part A — the business-unit picker for the Insights page. Writes
 * to the URL (`?unit=`), not local state, the same way the Reports filter bar
 * does: the server component re-derives everything on navigation, so there is
 * no client fetch here. Insights v1 is per-business-unit, so there is no
 * "all units" option and no branch selector.
 */
export function InsightsScopeBar({
  units,
  selectedUnitId,
}: {
  units: InsightsUnitOption[]
  selectedUnitId: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  usePendingToast(pending, 'Loading insights…', 400)

  if (units.length < 2) return null

  function selectUnit(unitId: string) {
    const next = new URLSearchParams(searchParams.toString())
    next.set('unit', unitId)
    startTransition(() => router.push(`?${next.toString()}`, { scroll: false }))
  }

  return (
    <div className="flex flex-col gap-1.5 sm:w-72" aria-busy={pending}>
      <Label htmlFor="insights-unit">Business unit</Label>
      <Select value={selectedUnitId} onValueChange={selectUnit}>
        <SelectTrigger id="insights-unit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {units.map((unit) => (
            <SelectItem key={unit.id} value={unit.id}>
              {unit.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
