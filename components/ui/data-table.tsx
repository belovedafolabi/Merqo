import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface DataTableColumn<TRow> {
  header: string
  cell: (row: TRow) => React.ReactNode
  className?: string
}

/**
 * Semantic-table wrapper per the ui-ux-pro-max shadcn guidance ("use Table
 * for tabular data display", "include proper table structure" —
 * TableHeader/TableBody/TableRow/TableHead all present, never a div grid).
 *
 * Deliberately plain — no sorting/filtering/pagination logic. Milestone 04
 * has no real dataset to sort (every management screen with actual rows is
 * a later milestone's scope); adding @tanstack/react-table now, for an
 * always-empty table, would be exactly the kind of speculative
 * infrastructure `docs/architecture/database-conventions.md`'s sibling
 * principle ("configuration over duplication", cost discipline) warns
 * against elsewhere in this project. The first milestone with a real
 * dataset (Products, 06) upgrades this wrapper — or swaps in
 * @tanstack/react-table — once sorting/filtering is an actual requirement,
 * not before.
 */
export function DataTable<TRow>({
  columns,
  rows,
  getRowKey,
  emptyState,
  className,
}: {
  columns: DataTableColumn<TRow>[]
  rows: TRow[]
  getRowKey: (row: TRow) => string
  emptyState?: React.ReactNode
  className?: string
}) {
  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>
  }

  return (
    <Table className={cn(className)}>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column.header} className={column.className}>
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={getRowKey(row)}>
            {columns.map((column) => (
              <TableCell key={column.header} className={column.className}>
                {column.cell(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
