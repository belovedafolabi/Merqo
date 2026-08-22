import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

/**
 * Subtotal/discount/tax/total breakdown + the always-dominant CHECKOUT
 * button, per docs/UXUI_Design_System_Specification.md §20/§27. Shared by
 * the desktop cart panel and the mobile cart drawer so the two never drift.
 * All-zero placeholder totals — real cart math is Milestone 08's scope.
 */
export function CartSummary() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 text-body-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">₦0</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Discount</span>
          <span className="tabular-nums">−₦0</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Tax</span>
          <span className="tabular-nums">₦0</span>
        </div>
      </div>
      <Separator />
      <div className="flex items-baseline justify-between">
        <span className="text-body font-semibold">TOTAL</span>
        <span className="text-h3 font-semibold tabular-nums">₦0</span>
      </div>
      <Button size="lg" className="h-14 rounded-xl text-body font-semibold">
        Checkout
      </Button>
    </div>
  )
}
