'use client'

import { ScanLine, Search } from 'lucide-react'

import { Input } from '@/components/ui/input'

/**
 * Search/barcode input — docs/UXUI_Design_System_Specification.md §18's
 * scan workflow ("Search input remains focused" through repeated scans).
 * Large touch target (h-12) per §15/§17. Autofocus + refocus-after-submit
 * behavior lands with Milestone 08, once there's a real product lookup to
 * wire it to — this milestone ships the input's shape/placement only.
 */
export function PosSearch() {
  return (
    <div className="relative">
      <Search className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Search products or scan a barcode…"
        className="h-12 rounded-xl pl-11 text-body"
        aria-label="Search products or scan a barcode"
      />
      <ScanLine className="absolute top-1/2 right-4 size-5 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}
