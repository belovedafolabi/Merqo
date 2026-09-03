import { notFound, redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth/guard'
import { getOrganizationBranding } from '@/lib/branding/queries'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { findStandardReport } from '@/lib/reports/catalog'
import { parseReportParams, type ReportSearchParams } from '@/lib/reports/params'
import { runStandardReport } from '@/lib/reports/queries'
import { PrintReport } from '@/components/reports/print-report'

/**
 * The print/PDF view of a report.
 *
 * Gated on `reports.export`, not merely `reports.view`. A print view is a
 * take-away copy of the data in exactly the way a CSV is, and Milestone 10's
 * Security Requirements treat export as "a higher-risk data-exfiltration
 * surface than on-screen viewing" — leaving this on `reports.view` would be an
 * unlocked side door next to a locked front one.
 *
 * Renders without the admin shell: this route sits outside the sidebar layout
 * by rendering its own full-page container, so what reaches the printer is the
 * report rather than the application around it.
 */
export default async function ReportPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ reportId: string }>
  searchParams: Promise<ReportSearchParams>
}) {
  const { reportId } = await params
  const report = findStandardReport(reportId)
  if (!report) notFound()

  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  await requirePermission('reports.export', { organizationId })

  const resolvedSearchParams = await searchParams
  const parameters = parseReportParams(organizationId, report, resolvedSearchParams)
  const [result, branding] = await Promise.all([
    runStandardReport(report.id, parameters),
    // The printed header carries the organization's own brand name where one
    // is set — a report that leaves the building should say whose it is.
    getOrganizationBranding(),
  ])

  return (
    <PrintReport
      result={result}
      organizationName={branding?.displayName ?? 'Merqo'}
      logoUrl={branding?.logoUrl ?? null}
      brandColor={branding?.primaryColor ?? null}
      // Only the Print button sets this. See PrintReport's own doc for why the
      // dialog is opt-in rather than automatic.
      autoPrint={resolvedSearchParams.print === '1'}
    />
  )
}
