'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import {
  createBusinessUnitAction,
  updateBusinessUnitAction,
  type BusinessStructureActionState,
} from '@/app/(app)/business-structure/actions'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BusinessTypePicker } from '@/components/business-structure/business-type-picker'
import type { Branch, BusinessType, BusinessUnit } from '@/lib/business-structure/queries'
import { InfoHint } from '@/components/ui/field-hint'
import { FORM_HINTS } from '@/lib/form-hints'

const initialState: BusinessStructureActionState = { error: null }

/**
 * Create/edit Business Unit. Business type is chosen once, at creation —
 * editing one afterward would need to re-derive capability defaults, which
 * is out of this milestone's scope (see lib/business-structure/mutations.ts's
 * updateBusinessUnit(), which only ever touches `name`), so edit mode shows
 * the type as read-only context, not an editable field.
 */
export function BusinessUnitFormDialog({
  organizationId,
  branches,
  businessTypes,
  businessUnit,
  open,
  onOpenChange,
}: {
  organizationId: string
  branches: Branch[]
  businessTypes: BusinessType[]
  businessUnit?: BusinessUnit | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const action = businessUnit ? updateBusinessUnitAction : createBusinessUnitAction
  const [state, formAction, pending] = useActionState(action, initialState)

  useEffect(() => {
    if (state !== initialState && state.error === null) {
      onOpenChange(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const activeBranches = branches.filter((branch) => branch.archivedAt === null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{businessUnit ? 'Edit business unit' : 'New business unit'}</DialogTitle>
          <DialogDescription>
            {businessUnit
              ? 'Update this business unit’s name.'
              : 'What you actually sell through — its type sets capability defaults.'}
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            if (businessUnit) {
              formData.set('businessUnitId', businessUnit.id)
              formData.set('branchId', businessUnit.branchId)
            }
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

          {!businessUnit && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="branchId">
                Branch
                <InfoHint text={FORM_HINTS.businessUnit.branch} />
              </Label>
              <Select name="branchId" required>
                <SelectTrigger id="branchId" className="w-full">
                  <SelectValue placeholder="Select a branch" />
                </SelectTrigger>
                <SelectContent>
                  {activeBranches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="business-unit-name">
              Name
              <InfoHint text={FORM_HINTS.businessUnit.name} />
            </Label>
            <Input
              id="business-unit-name"
              name="name"
              defaultValue={businessUnit?.name}
              required
              autoFocus
            />
          </div>

          {!businessUnit && (
            <div className="flex flex-col gap-2">
              <Label>
                Business type
                <InfoHint text={FORM_HINTS.businessUnit.businessType} />
              </Label>
              <BusinessTypePicker businessTypes={businessTypes} name="businessTypeId" />
            </div>
          )}
          {businessUnit && (
            <p className="text-sm text-muted-foreground">
              Business type: <span className="font-medium">{businessUnit.businessTypeName}</span>{' '}
              (set at creation, not editable here)
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : businessUnit ? 'Save changes' : 'Create business unit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
