'use client'

import { useState } from 'react'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { CapabilityRow } from '@/lib/business-structure/queries'

/**
 * The capability-review/override step both the onboarding wizard and the
 * Business Unit management screen use (docs/milestones/05-business-structure-
 * and-onboarding.md Scope: "capability toggle overrides"). Capabilities are
 * pre-checked from the Business Type's defaults (already seeded server-side
 * by the seed_business_unit_capabilities() trigger — see
 * lib/business-structure/queries.ts's listBusinessUnitCapabilities()); this
 * component only lets the user flip individual switches before submitting.
 *
 * Serializes to a single hidden `overrides` input as JSON rather than one
 * checkbox per capability, since the *array shape* (capabilityId + enabled
 * for every row, not just the checked ones) is what
 * updateBusinessUnitCapabilities() needs — a plain checkbox FormData entry
 * only reports checked boxes, losing which ones were deliberately unchecked.
 */
export function CapabilityToggleList({
  capabilities,
  formId,
}: {
  capabilities: CapabilityRow[]
  formId?: string
}) {
  const [overrides, setOverrides] = useState(() =>
    Object.fromEntries(
      capabilities.map((capability) => [capability.capabilityId, capability.enabled]),
    ),
  )

  return (
    <div className="flex flex-col gap-3">
      <input
        type="hidden"
        name="overrides"
        form={formId}
        value={JSON.stringify(
          capabilities.map((capability) => ({
            capabilityId: capability.capabilityId,
            enabled: overrides[capability.capabilityId] ?? capability.enabled,
          })),
        )}
      />

      {capabilities.map((capability) => (
        <div
          key={capability.capabilityId}
          className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4"
        >
          <div className="flex flex-col gap-0.5">
            <Label htmlFor={`capability-${capability.capabilityId}`} className="font-medium">
              {capability.name}
            </Label>
            {capability.description && (
              <span className="text-sm text-muted-foreground">{capability.description}</span>
            )}
          </div>
          <Switch
            id={`capability-${capability.capabilityId}`}
            checked={overrides[capability.capabilityId] ?? capability.enabled}
            onCheckedChange={(checked) =>
              setOverrides((current) => ({ ...current, [capability.capabilityId]: checked }))
            }
          />
        </div>
      ))}
    </div>
  )
}
