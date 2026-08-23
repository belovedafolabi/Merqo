import { redirect } from 'next/navigation'

import { getCurrentOrganizationId } from '@/lib/auth/context'
import {
  getBusinessUnitPosConfig,
  listBranches,
  listBusinessTypes,
  listBusinessUnitCapabilities,
  listBusinessUnits,
  type CapabilityRow,
  type PosConfig,
} from '@/lib/business-structure/queries'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { BusinessStructureView } from '@/components/business-structure/business-structure-view'

/**
 * Branch and Business Unit management (docs/milestones/
 * 05-business-structure-and-onboarding.md Frontend Changes). Reachable from
 * the Admin sidebar's "Business Structure" item (lib/shell/nav-items.ts),
 * gated on `branches.view` there since Milestone 04.
 */
export default async function BusinessStructurePage() {
  const organizationId = await getCurrentOrganizationId()
  if (!organizationId) redirect('/sign-in')

  const [branches, businessUnits, businessTypes] = await Promise.all([
    listBranches(organizationId),
    listBusinessUnits(organizationId),
    listBusinessTypes(),
  ])

  const capabilitiesEntries = await Promise.all(
    businessUnits.map(
      async (unit) => [unit.id, await listBusinessUnitCapabilities(unit.id)] as const,
    ),
  )
  const posConfigEntries = await Promise.all(
    businessUnits.map(async (unit) => [unit.id, await getBusinessUnitPosConfig(unit.id)] as const),
  )

  const capabilitiesByBusinessUnit = Object.fromEntries(capabilitiesEntries) as Record<
    string,
    CapabilityRow[]
  >
  const posConfigByBusinessUnit = Object.fromEntries(posConfigEntries) as Record<
    string,
    PosConfig | null
  >

  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Business Structure" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <BusinessStructureView
          organizationId={organizationId}
          branches={branches}
          businessUnits={businessUnits}
          businessTypes={businessTypes}
          capabilitiesByBusinessUnit={capabilitiesByBusinessUnit}
          posConfigByBusinessUnit={posConfigByBusinessUnit}
        />
      </div>
    </div>
  )
}
