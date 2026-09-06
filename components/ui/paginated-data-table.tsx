'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'

/**
 * DataTable with a client-side pager under it. The admin list views
 * (Customers, Products, Layaways, Inventory, Expenses) fetch their whole
 * list and filter it in the browser — a deliberate choice for the volumes
 * involved (see products-view.tsx's note) — so pagination is a rendering
 * concern here, not a query one: this slices whatever `rows` it's handed
 * (already filtered by the view) into pages of `pageSize`.
 *
 * `DataTable` itself stays a server-compatible component so RSCs that pass
 * `cell` render functions (insights sections, layaway detail) keep working;
 * this wrapper is the `'use client'` island the list views opt into.
 *
 * The page is clamped rather than reset in an effect (the project lint
 * forbids setState in an effect body): when a filter shrinks `rows`,
 * `currentPage` drops to the last real page on the next render; `setPage` is
 * only ever called by the buttons below.
 */
export function PaginatedDataTable<TRow>({
  pageSize = 25,
  rows,
  ...rest
}: {
  columns: DataTableColumn<TRow>[]
  rows: TRow[]
  getRowKey: (row: TRow) => string
  emptyState?: React.ReactNode
  footer?: (column: DataTableColumn<TRow>, index: number) => React.ReactNode
  className?: string
  pageSize?: number
}) {
  const [page, setPage] = useState(1)

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(Math.max(page, 1), pageCount)
  const start = (currentPage - 1) * pageSize
  const pageRows = rows.length > pageSize ? rows.slice(start, start + pageSize) : rows

  return (
    <div className="flex flex-col gap-3">
      <DataTable {...rest} rows={pageRows} />

      {pageCount > 1 && (
        <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
          <p className="text-body-sm text-muted-foreground" aria-live="polite">
            {(start + 1).toLocaleString()}–
            {Math.min(start + pageSize, rows.length).toLocaleString()} of{' '}
            {rows.length.toLocaleString()}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2 text-body-sm tabular-nums">
              {currentPage} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage >= pageCount}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </nav>
      )}
    </div>
  )
}
