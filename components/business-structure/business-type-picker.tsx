'use client'

import { useId } from 'react'

import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import type { BusinessType } from '@/lib/business-structure/queries'

/**
 * A visual card-grid picker over the (small, flat) 13-row business_types
 * catalog — reusable from both the onboarding wizard's Business Type step
 * and the Business Unit management screen's create form
 * (docs/milestones/05-business-structure-and-onboarding.md Frontend
 * Changes: "Business-type picker component (reusable across onboarding and
 * later business-unit creation)"). A plain Radix RadioGroup with a native
 * `name`, not a combobox — 13 items fit comfortably in a grid, so a
 * searchable list would be over-engineering for this catalog's size.
 */
export function BusinessTypePicker({
  businessTypes,
  name,
  defaultValue,
}: {
  businessTypes: BusinessType[]
  name: string
  defaultValue?: string
}) {
  const groupId = useId()

  return (
    <RadioGroup
      name={name}
      defaultValue={defaultValue}
      required
      className="grid gap-3 sm:grid-cols-2"
    >
      {businessTypes.map((businessType) => {
        const itemId = `${groupId}-${businessType.id}`
        return (
          <Label
            key={businessType.id}
            htmlFor={itemId}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-4 text-sm font-normal transition-colors hover:bg-accent/50',
              'has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5',
            )}
          >
            <RadioGroupItem value={businessType.id} id={itemId} className="mt-0.5" />
            <span className="flex flex-col gap-1">
              <span className="font-medium">{businessType.name}</span>
              {businessType.description && (
                <span className="text-muted-foreground">{businessType.description}</span>
              )}
            </span>
          </Label>
        )
      })}
    </RadioGroup>
  )
}
