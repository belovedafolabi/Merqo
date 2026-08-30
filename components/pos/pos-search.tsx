'use client'

import { ScanLine, Search } from 'lucide-react'

import { Input } from '@/components/ui/input'

/**
 * Search/barcode input — docs/UXUI_Design_System_Specification.md §18's
 * scan workflow ("Search input remains focused" through repeated scans).
 * Large touch target (h-12) per §15/§17. Controlled: components/pos/
 * product-grid.tsx owns the query/focus state and wires this milestone's
 * real search/barcode lookup — a barcode scanner types the code followed by
 * Enter, so `onScan` fires on Enter and the grid decides whether it was a
 * fast exact barcode match or a normal search-as-you-type result.
 *
 * No `autoFocus` since Milestone 14: on a phone it raised the on-screen
 * keyboard the moment /pos loaded, before the cashier had done anything.
 * product-grid.tsx now focuses this programmatically, and only on a device
 * with a real pointer. Scanning is unaffected — useBarcodeScanner catches a
 * burst regardless of where focus sits.
 */
export function PosSearch({
  value,
  onChange,
  onScan,
  inputRef,
}: {
  value: string
  onChange: (value: string) => void
  onScan: () => void
  inputRef?: React.Ref<HTMLInputElement>
}) {
  return (
    <div className="relative">
      <Search className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onScan()
          }
        }}
        placeholder="Search products or scan a barcode…"
        // `md:text-body` is not redundant with `text-body`. components/ui/
        // input.tsx's base class carries `md:text-sm`, and tailwind-merge
        // treats a bare utility and its `md:` variant as different keys, so
        // both survive — the box silently dropped to 14px at ≥768px, i.e. on
        // every tablet, which is under the 16px iOS needs to avoid zooming
        // the whole page on focus. The explicit variant is what overrides it.
        className="h-12 rounded-xl pl-11 text-body md:text-body"
        aria-label="Search products or scan a barcode"
        // A scanned code must reach the field verbatim; mobile autocorrect
        // and auto-capitalisation would otherwise mangle it.
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      <ScanLine className="absolute top-1/2 right-4 size-5 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}
