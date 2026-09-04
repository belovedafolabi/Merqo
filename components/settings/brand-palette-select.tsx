'use client'

import { useState } from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { BRAND_PALETTES, findBrandPalette } from '@/lib/branding/palettes'
import { BrandColorField } from '@/components/settings/brand-color-field'

const CUSTOM_OPTION = 'custom'

/** Two overlapping color dots — the same shape used in the select's own options, just larger for the standalone preview below the dropdown. */
function PaletteSwatch({
  primary,
  secondary,
  size = 'sm',
}: {
  primary: string
  secondary: string
  size?: 'sm' | 'lg'
}) {
  const dot = size === 'lg' ? 'size-6' : 'size-4'
  return (
    <span className="inline-flex shrink-0 items-center">
      <span
        className={`${dot} rounded-full border border-black/10 shadow-sm`}
        style={{ backgroundColor: primary }}
      />
      <span
        className={`${dot} -ml-2 rounded-full border border-black/10 shadow-sm`}
        style={{ backgroundColor: secondary }}
      />
    </span>
  )
}

/**
 * Milestone 17 post-launch UX fix: replaces two independent free-hex/native
 * color-picker fields (BrandColorField x2) with one guided choice — most
 * operators don't know their brand's exact hex code, and picking a primary
 * and secondary independently made it easy to land on a combination that
 * clashes or silently falls back to gray for failing contrast. Every preset
 * in lib/branding/palettes.ts is verified (tests/unit/branding/palettes.test.ts)
 * to pass the same WCAG check the server applies on save, so nothing in the
 * dropdown can surprise the operator with a fallback.
 *
 * "Custom…" drops back to the original two BrandColorFields (still name=
 * primaryColor/secondaryColor) for a client whose brand color isn't in the
 * curated list — the escape hatch this milestone's UX pass explicitly kept.
 */
export function BrandPaletteSelect({
  defaultPrimary,
  defaultSecondary,
}: {
  defaultPrimary: string | null
  defaultSecondary: string | null
}) {
  const matched = findBrandPalette(defaultPrimary, defaultSecondary)
  const [selectedId, setSelectedId] = useState<string>(matched?.id ?? CUSTOM_OPTION)
  const selectedPalette = BRAND_PALETTES.find((palette) => palette.id === selectedId)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="brand-palette">Color combination</Label>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger id="brand-palette" className="w-full">
            <SelectValue placeholder="Choose a combination" />
          </SelectTrigger>
          <SelectContent>
            {BRAND_PALETTES.map((palette) => (
              <SelectItem key={palette.id} value={palette.id}>
                <PaletteSwatch primary={palette.primary} secondary={palette.secondary} />
                {palette.name}
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_OPTION}>Custom…</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selectedPalette ? (
        <>
          <input type="hidden" name="primaryColor" value={selectedPalette.primary} />
          <input type="hidden" name="secondaryColor" value={selectedPalette.secondary} />
          {/* Live preview of the combination applied, per this fix's requirement — a
              mock primary button + secondary badge, not just the two dropdown dots. */}
          <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <PaletteSwatch
              primary={selectedPalette.primary}
              secondary={selectedPalette.secondary}
              size="lg"
            />
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <span
                className="rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-sm"
                style={{ backgroundColor: selectedPalette.primary }}
              >
                Checkout
              </span>
              <span
                className="rounded-full px-2.5 py-1 text-xs font-medium text-white"
                style={{ backgroundColor: selectedPalette.secondary }}
              >
                New
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <BrandColorField
            name="primaryColor"
            label="Primary color"
            defaultValue={defaultPrimary}
          />
          <BrandColorField
            name="secondaryColor"
            label="Secondary color"
            defaultValue={defaultSecondary}
          />
        </div>
      )}
    </div>
  )
}
