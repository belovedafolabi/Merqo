'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import { saveReportAction, type ReportActionState } from '@/app/(app)/reports/actions'
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
import { Textarea } from '@/components/ui/textarea'
import { useState } from 'react'
import type { BranchOption } from '@/components/reports/report-filter-bar'
import type { CustomReportConfig } from '@/lib/reports/schemas'

const initialState: ReportActionState = { error: null }

/**
 * Names and saves the report currently composed in the builder.
 *
 * The config travels as a JSON string field — the same FormData-with-a-JSON-
 * blob shape components/inventory/stock-transfer-dialog.tsx already uses for
 * variable-length structured data. It is re-parsed and re-validated on the
 * server against customReportConfigSchema before it is stored, and validated
 * *again* whenever it is loaded (lib/reports/saved.ts), because a stored jsonb
 * config is untrusted input regardless of how it got there.
 */
export function SaveReportDialog({
  organizationId,
  config,
  branches,
  savedReportId,
  initialName,
  open,
  onOpenChange,
}: {
  organizationId: string
  config: CustomReportConfig
  branches: BranchOption[]
  savedReportId?: string
  initialName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, formAction, pending] = useActionState(saveReportAction, initialState)
  const [visibility, setVisibility] = useState<'private' | 'branch' | 'organization'>('private')

  useEffect(() => {
    if (state !== initialState && state.error === null) {
      onOpenChange(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{savedReportId ? 'Update saved report' : 'Save report'}</DialogTitle>
          <DialogDescription>
            Saves what to compute, not the numbers — the report is recalculated fresh each time it
            is opened.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            formData.set('config', JSON.stringify(config))
            if (savedReportId) formData.set('savedReportId', savedReportId)
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
            <Label htmlFor="saved-report-name">Name</Label>
            <Input
              id="saved-report-name"
              name="name"
              required
              maxLength={120}
              defaultValue={initialName}
              placeholder="Monthly sales by branch"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="saved-report-description">Description</Label>
            <Textarea
              id="saved-report-description"
              name="description"
              maxLength={500}
              rows={2}
              placeholder="Optional — what this report is for."
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="saved-report-visibility">Who can see it</Label>
            <Select
              value={visibility}
              onValueChange={(value) =>
                setVisibility(value as 'private' | 'branch' | 'organization')
              }
            >
              <SelectTrigger id="saved-report-visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Only me</SelectItem>
                <SelectItem value="branch">My branch</SelectItem>
                <SelectItem value="organization">Everyone in the organization</SelectItem>
              </SelectContent>
            </Select>
            <input type="hidden" name="visibility" value={visibility} />
            <p className="text-caption text-muted-foreground">
              Sharing a report shares the question, not the answer — each reader still sees only the
              branches they have access to.
            </p>
          </div>

          {visibility === 'branch' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="saved-report-branch">Branch</Label>
              <select
                id="saved-report-branch"
                name="branchId"
                className="h-9 rounded-md border bg-transparent px-3 text-body-sm"
                defaultValue={branches[0]?.id ?? ''}
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
