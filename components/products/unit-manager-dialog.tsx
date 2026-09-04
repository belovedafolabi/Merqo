'use client'

import { useActionState, useEffect, useState } from 'react'
import { Pencil, Ruler, TriangleAlert, X } from 'lucide-react'

import {
  archiveUnitAction,
  createUnitAction,
  updateUnitAction,
  type ProductsActionState,
} from '@/app/(app)/products/actions'
import { useActionToast } from '@/hooks/use-action-toast'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/states/empty-state'
import { ArchiveConfirmDialog } from '@/components/products/archive-confirm-dialog'
import type { UnitOfMeasure } from '@/lib/units/queries'

const initialState: ProductsActionState = { error: null }

/**
 * Units-of-measure management — the sibling of
 * components/products/category-manager-dialog.tsx. System units
 * (isSystem) are read-only and always shown first; an admin adds, renames
 * or archives their own organization's custom units. A single dialog, not a
 * route, for the same reason categories are: a lightweight supporting
 * resource to products.
 */
export function UnitManagerDialog({
  organizationId,
  units,
  open,
  onOpenChange,
}: {
  organizationId: string
  units: UnitOfMeasure[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [createState, createAction, createPending] = useActionState(createUnitAction, initialState)
  useActionToast(createState, createPending, { loading: 'Adding unit…', success: 'Unit added' })
  const [archiving, setArchiving] = useState<UnitOfMeasure | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const systemUnits = units.filter((unit) => unit.isSystem)
  const customUnits = units.filter((unit) => !unit.isSystem)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Units of measurement</DialogTitle>
          <DialogDescription>
            The system list is always available. Add your own for anything it doesn’t cover.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            createAction(formData)
          }}
          className="flex items-end gap-2"
        >
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="new-unit-name" className="sr-only">
              New unit name
            </Label>
            <Input id="new-unit-name" name="name" placeholder="Name, e.g. Half carton" required />
          </div>
          <div className="flex w-28 flex-col gap-2">
            <Label htmlFor="new-unit-abbr" className="sr-only">
              Abbreviation
            </Label>
            <Input id="new-unit-abbr" name="abbreviation" placeholder="Abbr." required />
          </div>
          <Button type="submit" size="sm" disabled={createPending}>
            {createPending ? 'Adding…' : 'Add'}
          </Button>
        </form>
        {createState.error && (
          <Alert variant="destructive" role="alert">
            <TriangleAlert />
            <AlertDescription>{createState.error}</AlertDescription>
          </Alert>
        )}

        <Separator />

        <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
          {customUnits.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-caption text-muted-foreground">Your units</p>
              {customUnits.map((unit) => (
                <UnitRow
                  key={unit.id}
                  organizationId={organizationId}
                  unit={unit}
                  isEditing={editingId === unit.id}
                  onStartEdit={() => setEditingId(unit.id)}
                  onStopEdit={() => setEditingId(null)}
                  onArchive={() => setArchiving(unit)}
                />
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <p className="text-caption text-muted-foreground">System units</p>
            {systemUnits.length === 0 ? (
              <EmptyState icon={Ruler} title="No units" description="The system list is empty." />
            ) : (
              systemUnits.map((unit) => (
                <div
                  key={unit.id}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5"
                >
                  <span className="text-sm">
                    {unit.name} <span className="text-muted-foreground">({unit.abbreviation})</span>
                  </span>
                  <Badge variant="outline">System</Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>

      {archiving && (
        <ArchiveConfirmDialog
          title="Archive unit?"
          description={`"${archiving.name}" will no longer be selectable for new products.`}
          action={archiveUnitAction}
          buildFormData={() => {
            const fd = new FormData()
            fd.set('organizationId', organizationId)
            fd.set('unitId', archiving.id)
            return fd
          }}
          open
          onOpenChange={(nextOpen) => !nextOpen && setArchiving(null)}
        />
      )}
    </Dialog>
  )
}

function UnitRow({
  organizationId,
  unit,
  isEditing,
  onStartEdit,
  onStopEdit,
  onArchive,
}: {
  organizationId: string
  unit: UnitOfMeasure
  isEditing: boolean
  onStartEdit: () => void
  onStopEdit: () => void
  onArchive: () => void
}) {
  const [state, formAction, pending] = useActionState(updateUnitAction, initialState)
  useActionToast(state, pending, { loading: 'Saving unit…', success: 'Unit saved' })

  useEffect(() => {
    if (state !== initialState && state.error === null) {
      onStopEdit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  if (isEditing) {
    return (
      <form
        action={(formData) => {
          formData.set('organizationId', organizationId)
          formData.set('unitId', unit.id)
          formAction(formData)
        }}
        className="flex flex-col gap-2 rounded-md border p-2"
      >
        {state.error && (
          <Alert variant="destructive" role="alert">
            <TriangleAlert />
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <div className="flex items-center gap-2">
          <Input name="name" defaultValue={unit.name} required autoFocus />
          <Input name="abbreviation" defaultValue={unit.abbreviation} required className="w-24" />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" size="icon" variant="ghost" onClick={onStopEdit}>
            <X className="size-4" />
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
      <span className="flex items-center gap-2 text-sm">
        {unit.name} <span className="text-muted-foreground">({unit.abbreviation})</span>
        {unit.archivedAt && <Badge variant="outline">Archived</Badge>}
      </span>
      {!unit.archivedAt && (
        <span className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label={`Edit ${unit.name}`}
            onClick={onStartEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 text-destructive hover:text-destructive"
            aria-label={`Archive ${unit.name}`}
            onClick={onArchive}
          >
            <X className="size-3.5" />
          </Button>
        </span>
      )}
    </div>
  )
}
