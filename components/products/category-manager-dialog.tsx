'use client'

import { useActionState, useEffect, useState } from 'react'
import { FolderCog, Pencil, Plus, TriangleAlert, X } from 'lucide-react'

import {
  archiveCategoryAction,
  createCategoryAction,
  updateCategoryAction,
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
import type { Category } from '@/lib/products/queries'

const initialState: ProductsActionState = { error: null }

/**
 * Category management (docs/milestones/06-product-catalog-and-pricing.md
 * Frontend Changes: "Category management screen"), kept simple/flat per
 * this milestone's own Implementation Notes. Deliberately a single dialog
 * rather than a dedicated route — categories are a lightweight, low-risk
 * supporting resource to products (no pricing, no history, no variants),
 * so a full page for them would outweigh what they need.
 */
export function CategoryManagerDialog({
  organizationId,
  businessUnitId,
  categories,
  suggestions,
  open,
  onOpenChange,
}: {
  organizationId: string
  businessUnitId: string
  categories: Category[]
  /** Seeded starter category names for this Business Type — see
   *  lib/products/queries.ts's listCategorySuggestions(). */
  suggestions: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [createState, createAction, createPending] = useActionState(
    createCategoryAction,
    initialState,
  )
  useActionToast(createState, createPending, {
    loading: 'Adding category…',
    success: 'Category added',
  })
  const [archiving, setArchiving] = useState<Category | null>(null)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)

  // Suggestions the owner hasn't added yet (case-insensitive, ignoring
  // archived rows so a re-suggest is possible after archiving).
  const existingNames = new Set(
    categories
      .filter((category) => category.archivedAt === null)
      .map((category) => category.name.trim().toLowerCase()),
  )
  const openSuggestions = suggestions.filter(
    (name) => !existingNames.has(name.trim().toLowerCase()),
  )

  function addSuggestion(name: string) {
    const formData = new FormData()
    formData.set('organizationId', organizationId)
    formData.set('businessUnitId', businessUnitId)
    formData.set('name', name)
    createAction(formData)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Categories</DialogTitle>
          <DialogDescription>
            Organize this business unit’s products into categories.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            formData.set('businessUnitId', businessUnitId)
            createAction(formData)
          }}
          className="flex items-end gap-2"
        >
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="new-category-name" className="sr-only">
              New category name
            </Label>
            <Input id="new-category-name" name="name" placeholder="New category name" required />
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

        {openSuggestions.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-caption text-muted-foreground">Suggested for your business type</p>
            <div className="flex flex-wrap gap-1.5">
              {openSuggestions.map((name) => (
                <button
                  key={name}
                  type="button"
                  disabled={createPending}
                  onClick={() => addSuggestion(name)}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-body-sm text-muted-foreground transition-colors hover:border-solid hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  <Plus className="size-3.5" />
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        <Separator />

        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {categories.length === 0 ? (
            <EmptyState
              icon={FolderCog}
              title="No categories yet"
              description="Add a category above to start organizing products."
            />
          ) : (
            categories.map((category) => (
              <CategoryRow
                key={category.id}
                organizationId={organizationId}
                businessUnitId={businessUnitId}
                category={category}
                isEditing={editingCategoryId === category.id}
                onStartEdit={() => setEditingCategoryId(category.id)}
                onStopEdit={() => setEditingCategoryId(null)}
                onArchive={() => setArchiving(category)}
              />
            ))
          )}
        </div>
      </DialogContent>

      {archiving && (
        <ArchiveConfirmDialog
          title="Archive category?"
          description={`"${archiving.name}" will no longer be assignable to products.`}
          action={archiveCategoryAction}
          buildFormData={() => {
            const fd = new FormData()
            fd.set('organizationId', organizationId)
            fd.set('businessUnitId', businessUnitId)
            fd.set('categoryId', archiving.id)
            return fd
          }}
          open
          onOpenChange={(nextOpen) => !nextOpen && setArchiving(null)}
        />
      )}
    </Dialog>
  )
}

function CategoryRow({
  organizationId,
  businessUnitId,
  category,
  isEditing,
  onStartEdit,
  onStopEdit,
  onArchive,
}: {
  organizationId: string
  businessUnitId: string
  category: Category
  isEditing: boolean
  onStartEdit: () => void
  onStopEdit: () => void
  onArchive: () => void
}) {
  const [state, formAction, pending] = useActionState(updateCategoryAction, initialState)
  useActionToast(state, pending, { loading: 'Saving category…', success: 'Category saved' })

  // Calls the onStopEdit *prop* (owned by the parent's editingCategoryId
  // state), not a local setState — a prop callback isn't a hook setter the
  // set-state-in-effect lint rule can trace to this component, matching the
  // same "close via a passed-down onOpenChange-style callback" shape every
  // other dialog in this milestone uses (e.g. ProductFormDialog).
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
          formData.set('businessUnitId', businessUnitId)
          formData.set('categoryId', category.id)
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
          <Input name="name" defaultValue={category.name} required autoFocus />
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
        {category.name}
        {category.archivedAt && <Badge variant="outline">Archived</Badge>}
      </span>
      {!category.archivedAt && (
        <span className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label={`Edit ${category.name}`}
            onClick={onStartEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 text-destructive hover:text-destructive"
            aria-label={`Archive ${category.name}`}
            onClick={onArchive}
          >
            <X className="size-3.5" />
          </Button>
        </span>
      )}
    </div>
  )
}
