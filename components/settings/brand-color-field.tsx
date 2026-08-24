'use client'

import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'

import { hexToRgb, resolveBrandColor } from '@/lib/branding/contrast'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Same two surfaces lib/branding/tokens.ts's ACCENT_SURFACES checks against
 *  — the light card surface and the always-dark sidebar — kept in sync by
 *  eye since that constant isn't exported (it's private to the resolver a
 *  color goes through at render time; this field only needs to preview the
 *  same check, not own it). */
const PREVIEW_SURFACES = ['#ffffff', '#10151a'] as const
const FALLBACK_HEX = '#059669'

/**
 * A single brand color input with a live WCAG contrast warning, per
 * Milestone 11's Functional Requirement: "unsafe color combinations are
 * flagged per Milestone 04's contrast utility." Runs the exact function
 * (resolveBrandColor) the server uses to decide whether a saved color is
 * actually applied or silently replaced by the fallback — so what this field
 * warns about while typing is what will really happen on save, not a
 * separate approximation of it.
 */
export function BrandColorField({
  name,
  label,
  defaultValue,
}: {
  name: string
  label: string
  defaultValue: string | null
}) {
  const [value, setValue] = useState(defaultValue ?? '')
  const rgb = hexToRgb(value)
  const resolved = rgb ? resolveBrandColor(value, FALLBACK_HEX, '#ffffff', PREVIEW_SURFACES) : null

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`color-${name}`}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={rgb ? value : FALLBACK_HEX}
          onChange={(event) => setValue(event.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded-md border"
          aria-label={`${label} color picker`}
        />
        <Input
          id={`color-${name}`}
          name={name}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="#059669"
          className="font-mono"
          maxLength={7}
        />
      </div>
      {resolved?.usedFallback && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <TriangleAlert className="size-3.5 shrink-0" />
          This color doesn&apos;t meet contrast requirements and will be replaced with a safe
          default.
        </p>
      )}
    </div>
  )
}
