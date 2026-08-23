'use client'

import { useState } from 'react'
import { Building2, MapPin, MoreHorizontal, Plus } from 'lucide-react'

import {
  archiveBranchAction,
  archiveBusinessUnitAction,
} from '@/app/(app)/business-structure/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/states/empty-state'
import { BranchFormDialog } from '@/components/business-structure/branch-form-dialog'
import { BusinessUnitFormDialog } from '@/components/business-structure/business-unit-form-dialog'
import { CapabilitiesDialog } from '@/components/business-structure/capabilities-dialog'
import { PosConfigDialog } from '@/components/business-structure/pos-config-dialog'
import { ArchiveConfirmDialog } from '@/components/business-structure/archive-confirm-dialog'
import type {
  Branch,
  BusinessType,
  BusinessUnit,
  CapabilityRow,
  PosConfig,
} from '@/lib/business-structure/queries'

type DialogState =
  | { kind: 'branch-create' }
  | { kind: 'branch-edit'; branch: Branch }
  | { kind: 'branch-archive'; branch: Branch }
  | { kind: 'business-unit-create' }
  | { kind: 'business-unit-edit'; businessUnit: BusinessUnit }
  | { kind: 'business-unit-archive'; businessUnit: BusinessUnit }
  | { kind: 'capabilities'; businessUnit: BusinessUnit }
  | { kind: 'pos-config'; businessUnit: BusinessUnit }
  | null

/**
 * The Branch/Business Unit management screen (docs/milestones/
 * 05-business-structure-and-onboarding.md Frontend Changes: "Branch
 * management screen... Business Unit management screen"). Every dialog
 * shown here is the same one the onboarding wizard's steps use underneath
 * (same Server Actions, same form components) — this screen is what an
 * Owner/Admin returns to after onboarding to add more branches/business
 * units or revisit capabilities/POS settings.
 */
export function BusinessStructureView({
  organizationId,
  branches,
  businessUnits,
  businessTypes,
  capabilitiesByBusinessUnit,
  posConfigByBusinessUnit,
}: {
  organizationId: string
  branches: Branch[]
  businessUnits: BusinessUnit[]
  businessTypes: BusinessType[]
  capabilitiesByBusinessUnit: Record<string, CapabilityRow[]>
  posConfigByBusinessUnit: Record<string, PosConfig | null>
}) {
  const [dialog, setDialog] = useState<DialogState>(null)
  const closeDialog = () => setDialog(null)

  const branchColumns: DataTableColumn<Branch>[] = [
    { header: 'Name', cell: (row) => row.name },
    {
      header: 'Status',
      cell: (row) =>
        row.archivedAt ? (
          <Badge variant="outline">Archived</Badge>
        ) : (
          <Badge variant="secondary">Active</Badge>
        ),
    },
    {
      header: '',
      className: 'w-12 text-right',
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setDialog({ kind: 'branch-edit', branch: row })}>
              Edit
            </DropdownMenuItem>
            {!row.archivedAt && (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDialog({ kind: 'branch-archive', branch: row })}
              >
                Archive
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  const businessUnitColumns: DataTableColumn<BusinessUnit>[] = [
    { header: 'Name', cell: (row) => row.name },
    { header: 'Branch', cell: (row) => row.branchName },
    { header: 'Business type', cell: (row) => row.businessTypeName },
    {
      header: 'Status',
      cell: (row) =>
        row.archivedAt ? (
          <Badge variant="outline">Archived</Badge>
        ) : (
          <Badge variant="secondary">Active</Badge>
        ),
    },
    {
      header: '',
      className: 'w-12 text-right',
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => setDialog({ kind: 'business-unit-edit', businessUnit: row })}
            >
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setDialog({ kind: 'capabilities', businessUnit: row })}
            >
              Capabilities
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog({ kind: 'pos-config', businessUnit: row })}>
              POS configuration
            </DropdownMenuItem>
            {!row.archivedAt && (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDialog({ kind: 'business-unit-archive', businessUnit: row })}
              >
                Archive
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <>
      <Tabs defaultValue="branches" className="gap-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="branches">Branches</TabsTrigger>
            <TabsTrigger value="business-units">Business units</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="branches" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setDialog({ kind: 'branch-create' })}>
              <Plus /> New branch
            </Button>
          </div>
          <DataTable
            columns={branchColumns}
            rows={branches}
            getRowKey={(row) => row.id}
            emptyState={
              <EmptyState
                icon={MapPin}
                title="No branches yet"
                description="Create your first branch to start setting up business units."
              />
            }
          />
        </TabsContent>

        <TabsContent value="business-units" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => setDialog({ kind: 'business-unit-create' })}
              disabled={branches.every((branch) => branch.archivedAt !== null)}
            >
              <Plus /> New business unit
            </Button>
          </div>
          <DataTable
            columns={businessUnitColumns}
            rows={businessUnits}
            getRowKey={(row) => row.id}
            emptyState={
              <EmptyState
                icon={Building2}
                title="No business units yet"
                description="Create a business unit within a branch to configure what it sells."
              />
            }
          />
        </TabsContent>
      </Tabs>

      <BranchFormDialog
        organizationId={organizationId}
        branch={dialog?.kind === 'branch-edit' ? dialog.branch : null}
        open={dialog?.kind === 'branch-create' || dialog?.kind === 'branch-edit'}
        onOpenChange={(open) => !open && closeDialog()}
      />

      {dialog?.kind === 'branch-archive' && (
        <ArchiveConfirmDialog
          title="Archive branch?"
          description={`"${dialog.branch.name}" will be hidden from active use. This can't be undone from here.`}
          action={archiveBranchAction}
          buildFormData={() => {
            const fd = new FormData()
            fd.set('organizationId', organizationId)
            fd.set('branchId', dialog.branch.id)
            return fd
          }}
          open
          onOpenChange={(open) => !open && closeDialog()}
        />
      )}

      <BusinessUnitFormDialog
        organizationId={organizationId}
        branches={branches}
        businessTypes={businessTypes}
        businessUnit={dialog?.kind === 'business-unit-edit' ? dialog.businessUnit : null}
        open={dialog?.kind === 'business-unit-create' || dialog?.kind === 'business-unit-edit'}
        onOpenChange={(open) => !open && closeDialog()}
      />

      {dialog?.kind === 'business-unit-archive' && (
        <ArchiveConfirmDialog
          title="Archive business unit?"
          description={`"${dialog.businessUnit.name}" will be hidden from active use. This can't be undone from here.`}
          action={archiveBusinessUnitAction}
          buildFormData={() => {
            const fd = new FormData()
            fd.set('organizationId', organizationId)
            fd.set('businessUnitId', dialog.businessUnit.id)
            fd.set('branchId', dialog.businessUnit.branchId)
            return fd
          }}
          open
          onOpenChange={(open) => !open && closeDialog()}
        />
      )}

      {dialog?.kind === 'capabilities' && (
        <CapabilitiesDialog
          organizationId={organizationId}
          businessUnit={dialog.businessUnit}
          capabilities={capabilitiesByBusinessUnit[dialog.businessUnit.id] ?? []}
          open
          onOpenChange={(open) => !open && closeDialog()}
        />
      )}

      {dialog?.kind === 'pos-config' && (
        <PosConfigDialog
          organizationId={organizationId}
          businessUnit={dialog.businessUnit}
          posConfig={posConfigByBusinessUnit[dialog.businessUnit.id] ?? null}
          open
          onOpenChange={(open) => !open && closeDialog()}
        />
      )}
    </>
  )
}
