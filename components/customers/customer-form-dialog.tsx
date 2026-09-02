'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import {
  createCustomerAction,
  updateCustomerAction,
  type CustomerActionState,
} from '@/app/(app)/customers/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Customer } from '@/lib/customers/queries'
import { InfoHint } from '@/components/ui/field-hint'
import { FORM_HINTS } from '@/lib/form-hints'

const initialState: CustomerActionState = { error: null }

/**
 * Create/edit a customer (docs/milestones/09-customer-store-credit-and-
 * layaway.md Frontend Changes: "Customer creation/edit form, reusable as a
 * quick-add flow from the POS screen"). Same one-dialog-for-both-modes
 * shape as components/products/product-form-dialog.tsx — `customer` present
 * means edit, absent means create.
 *
 * Only `name` is required. A cashier attaching a walk-in mid-queue should
 * not be blocked on an email address, and every other field here is
 * genuinely optional to the domain — the customer's identity for search
 * purposes is any one of name/phone/email.
 */
export function CustomerFormDialog({
  organizationId,
  customer,
  open,
  onOpenChange,
}: {
  organizationId: string
  customer?: Customer
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = Boolean(customer)
  const [state, formAction, pending] = useActionState(
    isEdit ? updateCustomerAction : createCustomerAction,
    initialState,
  )

  useEffect(() => {
    if (state !== initialState && state.error === null) {
      onOpenChange(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit customer' : 'New customer'}</DialogTitle>
          <DialogDescription>
            Customers are shared across every branch in this business — credit earned at one branch
            can be spent at another.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            if (customer) formData.set('customerId', customer.id)
            formAction(formData)
          }}
          className="flex flex-col gap-4"
        >
          {state.error && (
            <Alert variant="destructive" role="alert">
              <TriangleAlert />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="customer-name">
              Name <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
              <InfoHint text={FORM_HINTS.customer.name} />
            </Label>
            <Input
              id="customer-name"
              name="name"
              defaultValue={customer?.name ?? ''}
              placeholder="e.g. Adaeze Okonkwo"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="customer-phone">
                Phone
                <InfoHint text={FORM_HINTS.customer.phone} />
              </Label>
              <Input
                id="customer-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                defaultValue={customer?.phone ?? ''}
                placeholder="e.g. 0803 123 4567"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="customer-email">
                Email
                <InfoHint text={FORM_HINTS.customer.email} />
              </Label>
              <Input
                id="customer-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                defaultValue={customer?.email ?? ''}
                placeholder="e.g. ada@example.com"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="customer-address">
              Address
              <InfoHint text={FORM_HINTS.customer.address} />
            </Label>
            <Textarea
              id="customer-address"
              name="address"
              rows={2}
              defaultValue={customer?.address ?? ''}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="customer-notes">
              Notes
              <InfoHint text={FORM_HINTS.customer.notes} />
            </Label>
            <Textarea
              id="customer-notes"
              name="notes"
              rows={2}
              defaultValue={customer?.notes ?? ''}
              placeholder="Anything worth remembering next time they visit"
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create customer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
