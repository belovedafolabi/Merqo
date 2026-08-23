'use client'

import { useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { PosConfig } from '@/lib/business-structure/queries'

const DEFAULT_CONFIG: Pick<
  PosConfig,
  | 'taxRate'
  | 'serviceChargeEnabled'
  | 'serviceChargeType'
  | 'serviceChargeValue'
  | 'discountRequiresAuthorization'
  | 'discountMaxPercentage'
  | 'discountMaxAmount'
  | 'discountReasonRequired'
  | 'defaultPaymentMethod'
> = {
  taxRate: 0,
  serviceChargeEnabled: false,
  serviceChargeType: 'percentage',
  serviceChargeValue: 0,
  discountRequiresAuthorization: true,
  discountMaxPercentage: 0,
  discountMaxAmount: null,
  discountReasonRequired: true,
  defaultPaymentMethod: 'cash',
}

/**
 * The Business Unit POS configuration fields (tax rate, service charge,
 * discount policy, default payment method) — docs/milestones/
 * 05-business-structure-and-onboarding.md Scope. Consumed by both the
 * onboarding wizard's POS-config step and the Business Unit management
 * screen's edit form; the parent supplies its own `<form action={...}>` and
 * the organizationId/businessUnitId/branchId hidden fields, since which
 * Server Action runs (redirect-to-next-step vs. revalidate-and-close)
 * differs between the two callers.
 *
 * Field names match upsertBusinessUnitPosConfig()'s FormData parsing
 * exactly (app/(app)/business-structure/actions.ts, app/(onboarding)/onboarding/actions.ts).
 */
export function PosConfigForm({ initialConfig }: { initialConfig?: PosConfig | null }) {
  const config = initialConfig ?? DEFAULT_CONFIG
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(config.serviceChargeEnabled)
  const [serviceChargeType, setServiceChargeType] = useState(config.serviceChargeType)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="taxRate">Tax rate (%)</Label>
        <Input
          id="taxRate"
          name="taxRate"
          type="number"
          min={0}
          max={100}
          step="0.01"
          defaultValue={config.taxRate}
          required
        />
      </div>

      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="serviceChargeEnabled" className="font-medium">
            Service charge
          </Label>
          <Switch
            id="serviceChargeEnabled"
            name="serviceChargeEnabled"
            checked={serviceChargeEnabled}
            onCheckedChange={setServiceChargeEnabled}
          />
          {/* Radix's Switch omits the hidden input entirely while unchecked,
              so the field is simply absent from FormData rather than "off" —
              upsertBusinessUnitPosConfig()'s `=== 'on'` check already treats
              absence as false, matching a plain checkbox's own behavior. */}
        </div>

        {serviceChargeEnabled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="serviceChargeType">Type</Label>
              <Select
                name="serviceChargeType"
                value={serviceChargeType}
                onValueChange={(value) => setServiceChargeType(value as 'percentage' | 'fixed')}
              >
                <SelectTrigger id="serviceChargeType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="fixed">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="serviceChargeValue">
                Value {serviceChargeType === 'percentage' ? '(%)' : '(₦)'}
              </Label>
              <Input
                id="serviceChargeValue"
                name="serviceChargeValue"
                type="number"
                min={0}
                max={serviceChargeType === 'percentage' ? 100 : undefined}
                step="0.01"
                defaultValue={config.serviceChargeValue}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
        <p className="font-medium">Discount policy</p>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="discountRequiresAuthorization">Require authorization to discount</Label>
          <Switch
            id="discountRequiresAuthorization"
            name="discountRequiresAuthorization"
            defaultChecked={config.discountRequiresAuthorization}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="discountReasonRequired">Require a reason for a discount</Label>
          <Switch
            id="discountReasonRequired"
            name="discountReasonRequired"
            defaultChecked={config.discountReasonRequired}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="discountMaxPercentage">Max discount (%)</Label>
            <Input
              id="discountMaxPercentage"
              name="discountMaxPercentage"
              type="number"
              min={0}
              max={100}
              step="0.01"
              defaultValue={config.discountMaxPercentage}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="discountMaxAmount">Max discount amount (₦, optional)</Label>
            <Input
              id="discountMaxAmount"
              name="discountMaxAmount"
              type="number"
              min={0}
              step="0.01"
              defaultValue={config.discountMaxAmount ?? ''}
              placeholder="No fixed-amount cap"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="defaultPaymentMethod">Default payment method</Label>
        <Select name="defaultPaymentMethod" defaultValue={config.defaultPaymentMethod}>
          <SelectTrigger id="defaultPaymentMethod" className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="transfer">Bank transfer</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
