'use client'

import { Info } from 'lucide-react'

import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { EmptyState } from '@/components/states/empty-state'
import { formatDateTime } from '@/lib/utils'
import type { ReportCellValue, ReportColumn, ReportResult } from '@/lib/reports/types'

/**
 * Renders any `ReportResult` as a table — one component for all fourteen
 * standard reports and the custom builder, driven entirely by the result's own
 * `columns`. The alternative, a bespoke table per report, is fourteen places
 * for the on-screen formatting to drift away from what the CSV and Excel
 * exporters do with the same values.
 */

function formatCell(value: ReportCellValue, column: ReportColumn): string {
  if (value === null || value === '') return '—'

  switch (column.type) {
    case 'money':
      return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(
        Number(value),
      )
    case 'quantity':
      return new Intl.NumberFormat('en-NG', { maximumFractionDigits: 3 }).format(Number(value))
    case 'number':
      return new Intl.NumberFormat('en-NG').format(Number(value))
    case 'datetime':
      return formatDateTime(String(value))
    case 'date':
      return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(
        new Date(String(value)),
      )
    default:
      return String(value)
  }
}

/** Numbers right-align so digits line up column-wise and are comparable at a glance. */
function alignmentFor(column: ReportColumn): string {
  return column.type === 'text' ? '' : 'text-right tabular-nums'
}

export function ReportTable({ result }: { result: ReportResult }) {
  const columns: DataTableColumn<Record<string, ReportCellValue>>[] = result.columns.map(
    (column) => ({
      header: column.header,
      className: alignmentFor(column),
      cell: (row) => formatCell(row[column.key] ?? null, column),
    }),
  )

  return (
    <div className="flex flex-col gap-3">
      {result.truncated && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-body-sm text-muted-foreground"
        >
          <Info className="size-4 shrink-0" />
          Showing the first {result.rows.length} rows. Narrow the date range or filter by branch to
          see the rest.
        </p>
      )}

      {/* Wide reports scroll horizontally rather than breaking the page layout. */}
      <div className="overflow-x-auto">
        <DataTable
          columns={columns}
          rows={result.rows}
          // Report rows are aggregates with no natural id, so the key is the
          // row's own values. Safe here because a report result is replaced
          // wholesale on every run rather than mutated in place, and grouped
          // rows are distinct by construction.
          getRowKey={(row) => result.columns.map((column) => String(row[column.key])).join('|')}
          emptyState={
            <EmptyState
              icon={Info}
              title="Nothing to report"
              description="No data matched this report's filters. Try a wider date range or a different branch."
            />
          }
          footer={
            result.totals
              ? (_column, index) => {
                  const definition = result.columns[index]
                  if (!definition) return null
                  if (index === 0) return 'Total'

                  const total = result.totals?.[definition.key]
                  return total === undefined ? null : formatCell(total, definition)
                }
              : undefined
          }
        />
      </div>
    </div>
  )
}
