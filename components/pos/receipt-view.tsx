'use client'

import { useEffect, useState } from 'react'

import { getSaleAction } from '@/app/(pos)/pos/actions'
import { Separator } from '@/components/ui/separator'
import { formatDateTime } from '@/lib/utils'
import type { Sale } from '@/lib/sales/queries'

function money(value: number): string {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'NGN' })
}

/**
 * Digital receipt — this milestone's Scope: "Receipt generation (digital;
 * print output specifics are Milestone 14's hardware scope, but the receipt
 * *data model/template rendering* is built here)". Renders straight from
 * lib/sales/queries.ts's getSale() — the same rows the sale itself was
 * written from, never a recomputation, so the receipt can never drift from
 * what was actually charged.
 */
export function ReceiptView({ saleId }: { saleId: string }) {
  const [sale, setSale] = useState<Sale | null>(null)

  useEffect(() => {
    getSaleAction(saleId).then(setSale)
  }, [saleId])

  if (!sale) {
    return <p className="text-body-sm text-muted-foreground">Loading receipt…</p>
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-body-sm">
      <ul className="flex flex-col gap-1.5">
        {sale.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-2">
            <span className="min-w-0 truncate">
              {item.quantity} × {item.productName}
            </span>
            <span className="shrink-0 tabular-nums">{money(item.lineTotal)}</span>
          </li>
        ))}
      </ul>

      <Separator />

      <div className="flex flex-col gap-1 text-muted-foreground">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span className="tabular-nums">{money(sale.subtotal)}</span>
        </div>
        {sale.discountAmount > 0 && (
          <div className="flex justify-between">
            <span>Discount{sale.discountReason ? ` (${sale.discountReason})` : ''}</span>
            <span className="tabular-nums">−{money(sale.discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Tax</span>
          <span className="tabular-nums">{money(sale.taxAmount)}</span>
        </div>
        {sale.serviceChargeAmount > 0 && (
          <div className="flex justify-between">
            <span>Service charge</span>
            <span className="tabular-nums">{money(sale.serviceChargeAmount)}</span>
          </div>
        )}
      </div>

      <Separator />

      <div className="flex justify-between text-body font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{money(sale.total)}</span>
      </div>

      {sale.payments.map((payment) => (
        <div key={payment.id} className="flex justify-between text-muted-foreground">
          <span className="capitalize">Paid via {payment.method.replace('_', ' ')}</span>
          <span className="tabular-nums">{money(payment.amount)}</span>
        </div>
      ))}

      <p className="text-caption text-muted-foreground">
        {formatDateTime(sale.createdAt)} · Receipt #{sale.id.slice(0, 8).toUpperCase()}
      </p>
    </div>
  )
}
