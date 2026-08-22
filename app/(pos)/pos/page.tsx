import { Package } from 'lucide-react'

import { PosSearch } from '@/components/pos/pos-search'
import { CartPanel } from '@/components/pos/cart-panel'
import { MobileCartBar } from '@/components/pos/mobile-cart-bar'
import { EmptyState } from '@/components/states/empty-state'

/**
 * POS terminal screen — search+grid / cart split per
 * docs/UXUI_Design_System_Specification.md §15. No product/cart data exists
 * yet (Milestone 08's scope) — this milestone ships the layout and
 * components, exercised here with an empty product grid.
 */
export default function PosPage() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          <PosSearch />
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={Package}
              title="No products yet"
              description="The product catalog (Milestone 06) populates this grid."
            />
          </div>
        </div>
        <CartPanel />
      </div>
      <MobileCartBar />
    </div>
  )
}
