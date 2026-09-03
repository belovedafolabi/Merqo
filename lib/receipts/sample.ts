import type { Sale } from '@/lib/sales/queries'

/**
 * A hard-coded fixture sale, exercising every optional line a receipt can
 * show (a discount, tax, a service charge, a partial-tender payment split
 * would be overkill — one payment is enough to prove the row renders). Used
 * by the receipt-template picker and the settings preview route so both work
 * on a brand-new organization with zero real sales yet — the same reasoning
 * lib/reports/registry.ts's tests use fixtures instead of requiring seeded
 * data.
 */
export const SAMPLE_SALE: Sale = {
  id: '00000000-0000-0000-0000-000000000000',
  branchId: '00000000-0000-0000-0000-000000000000',
  businessUnitId: '00000000-0000-0000-0000-000000000000',
  branchName: 'Main Branch',
  branchAddressLine: '12 Market Street, Lagos',
  branchContactPhone: '+234 800 000 0000',
  subtotal: 15000,
  discountAmount: 1000,
  discountReason: 'Loyalty discount',
  taxAmount: 1050,
  serviceChargeAmount: 500,
  total: 15550,
  createdAt: new Date().toISOString(),
  createdBy: null,
  createdByName: 'Sample Cashier',
  items: [
    {
      id: 'sample-item-1',
      productId: 'sample-product-1',
      productName: 'House Blend Coffee (1kg)',
      variantId: null,
      quantity: 2,
      unitPrice: 5000,
      lineDiscount: 500,
      lineTotal: 9500,
      returnedQuantity: 0,
    },
    {
      id: 'sample-item-2',
      productId: 'sample-product-2',
      productName: 'Ceramic Mug',
      variantId: null,
      quantity: 1,
      unitPrice: 5500,
      lineDiscount: 500,
      lineTotal: 5000,
      returnedQuantity: 0,
    },
  ],
  payments: [
    {
      id: 'sample-payment-1',
      method: 'card',
      amount: 15550,
      reference: 'SAMPLE-REF',
      createdAt: new Date().toISOString(),
    },
  ],
}
