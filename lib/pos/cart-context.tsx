'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

import {
  calculateSaleTotals,
  type CartDiscountInput,
  type SaleTotals,
} from '@/lib/sales/calculations'
import { usePosSession } from '@/lib/pos/session-context'

/**
 * Client-side cart state for the POS shell — plain React Context (no state
 * library is installed in this project; lib/auth/permissions-context.tsx is
 * the established precedent for this shape). Holds only what the checkout
 * screen needs to *display* — the live totals here are a preview only.
 * lib/sales/mutations.ts's createSale() re-derives every price and total
 * server-side from Milestone 06's resolveEffectivePrice() and this Business
 * Unit's own POS config before a sale is ever written, per this milestone's
 * Security Requirements ("no client-supplied price/discount/tax value is
 * trusted").
 */
export interface CartLine {
  productId: string
  variantId: string | null
  name: string
  unitPrice: number
  quantity: number
}

interface CartState {
  lines: CartLine[]
  discount: CartDiscountInput
  discountReason: string
  addItem: (item: {
    productId: string
    variantId?: string | null
    name: string
    unitPrice: number
  }) => void
  updateQuantity: (productId: string, variantId: string | null, quantity: number) => void
  removeItem: (productId: string, variantId: string | null) => void
  setDiscount: (discount: CartDiscountInput, reason?: string) => void
  loadLines: (lines: CartLine[]) => void
  clear: () => void
}

const CartContext = createContext<CartState | null>(null)

function lineKey(productId: string, variantId: string | null): string {
  return `${productId}:${variantId ?? ''}`
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([])
  const [discount, setDiscountState] = useState<CartDiscountInput>({})
  const [discountReason, setDiscountReason] = useState('')

  const addItem = useCallback<CartState['addItem']>((item) => {
    setLines((prev) => {
      const variantId = item.variantId ?? null
      const existing = prev.find(
        (line) => line.productId === item.productId && line.variantId === variantId,
      )
      if (existing) {
        return prev.map((line) =>
          line === existing ? { ...line, quantity: line.quantity + 1 } : line,
        )
      }
      return [
        ...prev,
        {
          productId: item.productId,
          variantId,
          name: item.name,
          unitPrice: item.unitPrice,
          quantity: 1,
        },
      ]
    })
  }, [])

  const updateQuantity = useCallback<CartState['updateQuantity']>(
    (productId, variantId, quantity) => {
      setLines((prev) =>
        quantity <= 0
          ? prev.filter(
              (line) => lineKey(line.productId, line.variantId) !== lineKey(productId, variantId),
            )
          : prev.map((line) =>
              lineKey(line.productId, line.variantId) === lineKey(productId, variantId)
                ? { ...line, quantity }
                : line,
            ),
      )
    },
    [],
  )

  const removeItem = useCallback<CartState['removeItem']>((productId, variantId) => {
    setLines((prev) =>
      prev.filter(
        (line) => lineKey(line.productId, line.variantId) !== lineKey(productId, variantId),
      ),
    )
  }, [])

  const setDiscount = useCallback<CartState['setDiscount']>((next, reason) => {
    setDiscountState(next)
    setDiscountReason(reason ?? '')
  }, [])

  const loadLines = useCallback<CartState['loadLines']>((next) => {
    setLines(next)
  }, [])

  const clear = useCallback(() => {
    setLines([])
    setDiscountState({})
    setDiscountReason('')
  }, [])

  const value = useMemo(
    () => ({
      lines,
      discount,
      discountReason,
      addItem,
      updateQuantity,
      removeItem,
      setDiscount,
      loadLines,
      clear,
    }),
    [
      lines,
      discount,
      discountReason,
      addItem,
      updateQuantity,
      removeItem,
      setDiscount,
      loadLines,
      clear,
    ],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartState {
  const cart = useContext(CartContext)
  if (!cart) throw new Error('useCart() called outside <CartProvider>.')
  return cart
}

/** The cart's live preview totals — see this module's own doc comment for why these are a preview only. */
export function useCartTotals(): SaleTotals {
  const { lines, discount } = useCart()
  const { posConfig } = usePosSession()

  return useMemo(
    () =>
      calculateSaleTotals(
        lines.map((line) => ({ quantity: line.quantity, unitPrice: line.unitPrice })),
        discount,
        posConfig,
      ),
    [lines, discount, posConfig],
  )
}
