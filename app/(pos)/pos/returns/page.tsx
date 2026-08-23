import { ReturnsScreen } from '@/components/pos/returns-screen'

/**
 * Returns/refunds screen (this milestone's Frontend Changes). Permission
 * checks for the actual mutations live server-side in
 * lib/sales/mutations.ts (returns.create/refund.initiate/refund.approve) —
 * this route itself has no separate gate, matching how /pos has none either
 * (the POS shell is reachable by anyone signed in; individual actions are
 * what's permission-checked).
 */
export default function ReturnsPage() {
  return <ReturnsScreen />
}
