'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Bookmark, Trash2 } from 'lucide-react'

import { archiveSavedReportAction, type ReportActionState } from '@/app/(app)/reports/actions'
import { useActionToast } from '@/hooks/use-action-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/states/empty-state'
import { REPORT_DATASETS, type DatasetKey } from '@/lib/reports/registry'
import type { SavedReport } from '@/lib/reports/saved'

const initialState: ReportActionState = { error: null }

const VISIBILITY_LABELS: Record<SavedReport['visibility'], string> = {
  private: 'Only me',
  branch: 'My branch',
  organization: 'Everyone',
}

/**
 * Saved custom reports. Each opens the builder pre-loaded with its config
 * (`?saved=<id>`) rather than rendering the result directly — a saved report
 * is a starting point to adjust, and its author's date range is rarely the one
 * the next reader wants.
 *
 * Only reports whose stored config still validates appear here; the rest are
 * dropped by lib/reports/saved.ts on load. That is deliberate: a config that
 * no longer parses is either tampering or a registry change that orphaned a
 * field, and offering to run it would only produce a server error later.
 */
export function SavedReportsList({
  organizationId,
  reports,
}: {
  organizationId: string
  reports: SavedReport[]
}) {
  const [state, archiveAction, pending] = useActionState(archiveSavedReportAction, initialState)
  useActionToast(state, pending, {
    loading: 'Archiving report…',
    success: 'Saved report archived',
  })

  if (reports.length === 0) {
    return (
      <EmptyState
        icon={Bookmark}
        title="No saved reports"
        description="Build a report above and save it to keep the configuration for next time."
      />
    )
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>Saved reports</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {state.error && (
          <p role="alert" className="text-body-sm text-destructive">
            {state.error}
          </p>
        )}

        {reports.map((report) => (
          <div key={report.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <Link
                href={`/reports/builder?saved=${report.id}`}
                className="truncate font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {report.name}
              </Link>
              {report.description && (
                <span className="truncate text-body-sm text-muted-foreground">
                  {report.description}
                </span>
              )}
            </div>

            <Badge variant="outline">
              {REPORT_DATASETS[report.dataset as DatasetKey]?.label ?? report.dataset}
            </Badge>
            <Badge variant="secondary">{VISIBILITY_LABELS[report.visibility]}</Badge>

            <form
              action={(formData) => {
                formData.set('organizationId', organizationId)
                formData.set('savedReportId', report.id)
                archiveAction(formData)
              }}
            >
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                disabled={pending}
                aria-label={`Archive ${report.name}`}
              >
                <Trash2 />
              </Button>
            </form>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
