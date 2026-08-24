'use client'

import { useMemo, useState, useTransition } from 'react'
import { Play, Save, TriangleAlert, Wrench } from 'lucide-react'

import { runCustomReportAction } from '@/app/(app)/reports/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/states/empty-state'
import { ReportChart } from '@/components/reports/report-chart'
import { ReportTable } from '@/components/reports/report-table'
import { SaveReportDialog } from '@/components/reports/save-report-dialog'
import {
  DATASET_KEYS,
  MAX_DIMENSIONS,
  MAX_METRICS,
  REPORT_DATASETS,
  type DatasetKey,
} from '@/lib/reports/registry'
import type { CustomReportConfig } from '@/lib/reports/schemas'
import type { BranchOption } from '@/components/reports/report-filter-bar'
import type { ReportParameters, ReportResult } from '@/lib/reports/types'

/**
 * The custom report builder.
 *
 * Every control here is rendered from lib/reports/registry.ts. That is not a
 * convenience — it is the reason the UI can never offer a field the server
 * would reject, and the reason a field added to the registry appears here
 * without anyone editing this file. There is deliberately no free-text input
 * anywhere in the composition surface: the only things a user can express are
 * choices from closed lists, which is what "the builder only composes queries
 * from a fixed, permission-checked set of dimensions and metrics" means in
 * practice.
 *
 * Fields the caller lacks permission for are omitted rather than disabled. A
 * greyed-out "Gross profit" checkbox advertises the existence of data the user
 * is not trusted with, and invites them to go looking for another way to it.
 */
export function CustomReportBuilder({
  organizationId,
  parameters,
  branches,
  canSave,
  grantedPermissions,
  initialConfig,
  initialSavedReportId,
  initialName,
}: {
  organizationId: string
  parameters: ReportParameters
  branches: BranchOption[]
  canSave: boolean
  grantedPermissions: readonly string[]
  initialConfig?: CustomReportConfig
  initialSavedReportId?: string
  initialName?: string
}) {
  const [dataset, setDataset] = useState<DatasetKey>(initialConfig?.dataset ?? 'sales')
  const [dimensions, setDimensions] = useState<string[]>(initialConfig?.dimensions ?? ['day'])
  const [metrics, setMetrics] = useState<string[]>(initialConfig?.metrics ?? ['net_sales'])
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
    initialConfig?.sortDirection ?? 'desc',
  )

  const [result, setResult] = useState<ReportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const definition = REPORT_DATASETS[dataset]

  const availableDimensions = useMemo(
    () =>
      definition.dimensions.filter(
        (item) => !item.permission || grantedPermissions.includes(item.permission),
      ),
    [definition, grantedPermissions],
  )
  const availableMetrics = useMemo(
    () =>
      definition.metrics.filter(
        (item) => !item.permission || grantedPermissions.includes(item.permission),
      ),
    [definition, grantedPermissions],
  )

  const config: CustomReportConfig = {
    dataset,
    dimensions,
    metrics,
    sort: 'metric_1',
    sortDirection,
    limit: parameters.limit,
  }

  /**
   * Changing dataset resets the selection. Dimensions are per dataset — a
   * sales report grouped by employee has no expense equivalent — so carrying
   * them across would produce a config the server rejects, with an error the
   * user did nothing to deserve.
   */
  function changeDataset(next: DatasetKey) {
    setDataset(next)
    setDimensions(
      REPORT_DATASETS[next].dimensions[0] ? [REPORT_DATASETS[next].dimensions[0].key] : [],
    )
    setMetrics(REPORT_DATASETS[next].metrics[0] ? [REPORT_DATASETS[next].metrics[0].key] : [])
    setResult(null)
    setError(null)
  }

  function toggle(list: string[], key: string, max: number): string[] {
    if (list.includes(key)) return list.filter((item) => item !== key)
    if (list.length >= max) return list
    return [...list, key]
  }

  function run() {
    setError(null)
    startTransition(async () => {
      const preview = await runCustomReportAction(config, parameters)
      setResult(preview.result)
      setError(preview.error)
    })
  }

  const canRun = dimensions.length > 0 && metrics.length > 0

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit shadow-card">
          <CardHeader>
            <CardTitle>Build a report</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="builder-dataset">Data</Label>
              <Select value={dataset} onValueChange={(value) => changeDataset(value as DatasetKey)}>
                <SelectTrigger id="builder-dataset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATASET_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {REPORT_DATASETS[key].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-caption text-muted-foreground">{definition.description}</p>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-body-sm font-medium">
                Group by{' '}
                <span className="text-muted-foreground">
                  ({dimensions.length}/{MAX_DIMENSIONS})
                </span>
              </legend>
              {availableDimensions.map((item) => (
                <label key={item.key} className="flex items-center gap-2 text-body-sm">
                  <Checkbox
                    checked={dimensions.includes(item.key)}
                    onCheckedChange={() =>
                      setDimensions((current) => toggle(current, item.key, MAX_DIMENSIONS))
                    }
                    // Disabled only when the slot cap is reached, which is a
                    // fact about this report rather than about the user.
                    disabled={!dimensions.includes(item.key) && dimensions.length >= MAX_DIMENSIONS}
                  />
                  {item.label}
                </label>
              ))}
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-body-sm font-medium">
                Measure{' '}
                <span className="text-muted-foreground">
                  ({metrics.length}/{MAX_METRICS})
                </span>
              </legend>
              {availableMetrics.length === 0 ? (
                <p className="text-body-sm text-muted-foreground">
                  Your role does not include access to any figures on this dataset.
                </p>
              ) : (
                availableMetrics.map((item) => (
                  <label key={item.key} className="flex items-center gap-2 text-body-sm">
                    <Checkbox
                      checked={metrics.includes(item.key)}
                      onCheckedChange={() =>
                        setMetrics((current) => toggle(current, item.key, MAX_METRICS))
                      }
                      disabled={!metrics.includes(item.key) && metrics.length >= MAX_METRICS}
                    />
                    {item.label}
                  </label>
                ))
              )}
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="builder-sort">Sort</Label>
              <Select
                value={sortDirection}
                onValueChange={(value) => setSortDirection(value as 'asc' | 'desc')}
              >
                <SelectTrigger id="builder-sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Highest first</SelectItem>
                  <SelectItem value="asc">Lowest first</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Button onClick={run} disabled={!canRun || pending}>
                <Play /> {pending ? 'Running…' : 'Run report'}
              </Button>
              {canSave && (
                <Button variant="outline" onClick={() => setSaveOpen(true)} disabled={!canRun}>
                  <Save /> {initialSavedReportId ? 'Update saved report' : 'Save report'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          {error && (
            <Alert variant="destructive" role="alert">
              <TriangleAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{definition.label}</Badge>
                {dimensions.map((key) => (
                  <Badge key={key} variant="secondary">
                    {definition.dimensions.find((item) => item.key === key)?.label ?? key}
                  </Badge>
                ))}
              </div>

              <ReportChart result={result} />

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>{result.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ReportTable result={result} />
                </CardContent>
              </Card>
            </>
          ) : (
            <EmptyState
              icon={Wrench}
              title="Nothing run yet"
              description="Choose what to group by and what to measure, then run the report to see the result."
            />
          )}
        </div>
      </div>

      {canSave && (
        <SaveReportDialog
          organizationId={organizationId}
          config={config}
          branches={branches}
          savedReportId={initialSavedReportId}
          initialName={initialName}
          open={saveOpen}
          onOpenChange={setSaveOpen}
        />
      )}
    </div>
  )
}
