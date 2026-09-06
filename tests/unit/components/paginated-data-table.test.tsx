import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { PaginatedDataTable } from '@/components/ui/paginated-data-table'
import type { DataTableColumn } from '@/components/ui/data-table'

afterEach(cleanup)

interface Row {
  id: string
  n: number
}
const columns: DataTableColumn<Row>[] = [{ header: 'N', cell: (row) => String(row.n) }]
const rows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: String(i), n: i + 1 }))

describe('PaginatedDataTable', () => {
  it('shows no pager and every row when the list fits one page', () => {
    render(
      <PaginatedDataTable columns={columns} rows={rows(4)} getRowKey={(r) => r.id} pageSize={10} />,
    )
    expect(screen.queryByLabelText('Pagination')).toBeNull()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('slices to pageSize and pages forward/back', () => {
    render(
      <PaginatedDataTable
        columns={columns}
        rows={rows(23)}
        getRowKey={(r) => r.id}
        pageSize={10}
      />,
    )
    // Page 1: rows 1..10, not 11.
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.queryByText('11')).toBeNull()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(screen.getByText('1–10 of 23')).toBeInTheDocument()
    expect(screen.getByLabelText('Previous page')).toBeDisabled()

    fireEvent.click(screen.getByLabelText('Next page'))
    expect(screen.getByText('11')).toBeInTheDocument()
    expect(screen.getByText('2 / 3')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Next page'))
    expect(screen.getByText('21')).toBeInTheDocument()
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
    expect(screen.getByText('21–23 of 23')).toBeInTheDocument()
    expect(screen.getByLabelText('Next page')).toBeDisabled()

    fireEvent.click(screen.getByLabelText('Previous page'))
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
  })

  it('clamps the visible page down when the row set shrinks under a filter', () => {
    const { rerender } = render(
      <PaginatedDataTable
        columns={columns}
        rows={rows(30)}
        getRowKey={(r) => r.id}
        pageSize={10}
      />,
    )
    fireEvent.click(screen.getByLabelText('Next page'))
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(screen.getByText('3 / 3')).toBeInTheDocument()

    // A filter cuts the list to 8 rows — the pager disappears and rows show.
    rerender(
      <PaginatedDataTable columns={columns} rows={rows(8)} getRowKey={(r) => r.id} pageSize={10} />,
    )
    expect(screen.queryByLabelText('Pagination')).toBeNull()
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('renders the empty state for an empty list', () => {
    render(
      <PaginatedDataTable
        columns={columns}
        rows={[]}
        getRowKey={(r) => r.id}
        emptyState={<div>nothing here</div>}
      />,
    )
    expect(screen.getByText('nothing here')).toBeInTheDocument()
  })
})
