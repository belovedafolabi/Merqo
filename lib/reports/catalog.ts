import type { ReportColumnType } from '@/lib/reports/types'

/**
 * The standard report catalog — docs/PRD.md §28's four families (Sales,
 * Inventory, Financial, Customer) as data rather than as fourteen hand-written
 * screens.
 *
 * Each entry names the SQL function that computes it, the columns it produces,
 * and the permissions it needs. `app/(app)/reports/[reportId]/page.tsx` renders
 * any of them from this table, so adding a report is an entry here plus a
 * function in
 * supabase/migrations/20260823141000_create_report_functions.sql — never a new
 * page, a new action and a new component that have to agree with each other.
 *
 * COLUMN-LEVEL PERMISSIONS. A `permission` on a *column* is not decoration.
 * `report_sales_by_item()` always returns `cogs` and `gross_profit`, because
 * splitting the SQL by caller permission would mean two functions to keep in
 * step. Instead lib/reports/queries.ts drops columns the caller may not see
 * before the result leaves the server. The distinction that matters: the
 * stripping happens server-side, so an unauthorised client never receives the
 * values, not merely fails to render them.
 */

export type ReportCategory = 'sales' | 'financial' | 'inventory' | 'customer'

export interface ReportColumnDef {
  key: string
  header: string
  type: ReportColumnType
  /** Additional permission required to see this column at all. */
  permission?: string
  /** Whether a column total belongs in the footer and the export's last row. */
  total?: boolean
}

export interface ReportGroupingDef {
  /** The token passed to the SQL function's `p_group_by`. */
  value: string
  label: string
}

export interface StandardReportDef {
  id: string
  title: string
  description: string
  category: ReportCategory
  /** The `public.` function lib/reports/queries.ts calls via supabase.rpc(). */
  rpc: string
  /** Beyond `reports.view`, which every report requires. */
  permission?: string
  /**
   * Groupings offered, or an empty list for a report with a fixed shape. The
   * first entry is the default. These values reach `p_group_by`, and each SQL
   * function validates them against its own list — this array is the UI's copy,
   * not the enforcement.
   */
  groupings: readonly ReportGroupingDef[]
  columns: readonly ReportColumnDef[]
  /**
   * True where the report has a natural time axis, so the UI offers a date
   * range. A current-stock listing is a snapshot and has none — offering a
   * date picker that changes nothing would be a lie about what the report does.
   */
  dateRanged: boolean
}

const FINANCIALS = 'reports.view_financials'

const PERIOD_GROUPINGS: readonly ReportGroupingDef[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'branch', label: 'Branch' },
  { value: 'business_unit', label: 'Business unit' },
  { value: 'employee', label: 'Employee' },
]

export const STANDARD_REPORTS: readonly StandardReportDef[] = [
  // ---------------------------------------------------------------- sales
  {
    id: 'sales-summary',
    title: 'Sales summary',
    description: 'Completed sales grouped by day, branch, business unit or employee.',
    category: 'sales',
    rpc: 'report_sales_by_scope',
    groupings: PERIOD_GROUPINGS,
    dateRanged: true,
    columns: [
      { key: 'group_label', header: 'Group', type: 'text' },
      { key: 'sale_count', header: 'Sales', type: 'number', total: true },
      { key: 'gross_sales', header: 'Gross sales', type: 'money', total: true },
      { key: 'discount_amount', header: 'Discount', type: 'money', total: true },
      { key: 'net_sales', header: 'Net sales', type: 'money', total: true },
      { key: 'tax_amount', header: 'Tax', type: 'money', total: true },
      { key: 'service_charge_amount', header: 'Service charge', type: 'money', total: true },
      { key: 'total', header: 'Total charged', type: 'money', total: true },
    ],
  },
  {
    id: 'sales-by-product',
    title: 'Sales by product',
    description: 'What sold, in what quantity, and at what margin.',
    category: 'sales',
    rpc: 'report_sales_by_item',
    groupings: [
      { value: 'product', label: 'Product' },
      { value: 'variant', label: 'Variant' },
      { value: 'category', label: 'Category' },
    ],
    dateRanged: true,
    columns: [
      { key: 'group_label', header: 'Product', type: 'text' },
      { key: 'quantity_sold', header: 'Quantity', type: 'quantity', total: true },
      { key: 'gross_sales', header: 'Gross sales', type: 'money', total: true },
      { key: 'line_discount', header: 'Discount', type: 'money', total: true },
      { key: 'net_sales', header: 'Net sales', type: 'money', total: true },
      { key: 'cogs', header: 'Cost of goods', type: 'money', total: true, permission: FINANCIALS },
      {
        key: 'gross_profit',
        header: 'Gross profit',
        type: 'money',
        total: true,
        permission: FINANCIALS,
      },
    ],
  },
  {
    id: 'sales-by-payment-method',
    title: 'Sales by payment method',
    description: 'How customers paid — cash, card, transfer or store credit.',
    category: 'sales',
    rpc: 'report_sales_by_payment_method',
    groupings: [],
    dateRanged: true,
    columns: [
      { key: 'group_label', header: 'Method', type: 'text' },
      { key: 'payment_count', header: 'Payments', type: 'number', total: true },
      { key: 'amount', header: 'Amount', type: 'money', total: true },
    ],
  },

  // ------------------------------------------------------------ financial
  {
    id: 'refunds',
    title: 'Refunds',
    description: 'Refunds by period, branch, method or reason, split by approval state.',
    category: 'financial',
    rpc: 'report_refunds',
    permission: FINANCIALS,
    groupings: [
      { value: 'day', label: 'Day' },
      { value: 'month', label: 'Month' },
      { value: 'branch', label: 'Branch' },
      { value: 'method', label: 'Method' },
      { value: 'reason', label: 'Reason' },
    ],
    dateRanged: true,
    columns: [
      { key: 'group_label', header: 'Group', type: 'text' },
      { key: 'refund_count', header: 'Refunds', type: 'number', total: true },
      { key: 'approved_amount', header: 'Approved', type: 'money', total: true },
      { key: 'pending_amount', header: 'Pending', type: 'money', total: true },
      { key: 'rejected_amount', header: 'Rejected', type: 'money', total: true },
    ],
  },
  {
    id: 'discounts',
    title: 'Discounts',
    description: 'Discounted sales only, with the till-level and order-level layers separated.',
    category: 'financial',
    rpc: 'report_discounts',
    permission: FINANCIALS,
    groupings: [
      { value: 'day', label: 'Day' },
      { value: 'month', label: 'Month' },
      { value: 'branch', label: 'Branch' },
      { value: 'employee', label: 'Employee' },
      { value: 'reason', label: 'Reason' },
    ],
    dateRanged: true,
    columns: [
      { key: 'group_label', header: 'Group', type: 'text' },
      { key: 'discounted_sale_count', header: 'Sales', type: 'number', total: true },
      { key: 'order_discount', header: 'Order discount', type: 'money', total: true },
      { key: 'line_discount', header: 'Line discount', type: 'money', total: true },
      { key: 'total_discount', header: 'Total discount', type: 'money', total: true },
      { key: 'gross_sales', header: 'Gross sales', type: 'money', total: true },
    ],
  },
  {
    id: 'expenses',
    title: 'Expenses',
    description: 'Recorded business expenses by category, branch, method or approval state.',
    category: 'financial',
    rpc: 'report_expenses',
    permission: FINANCIALS,
    groupings: [
      { value: 'category', label: 'Category' },
      { value: 'day', label: 'Day' },
      { value: 'month', label: 'Month' },
      { value: 'branch', label: 'Branch' },
      { value: 'payment_method', label: 'Payment method' },
      { value: 'status', label: 'Status' },
    ],
    dateRanged: true,
    columns: [
      { key: 'group_label', header: 'Group', type: 'text' },
      { key: 'expense_count', header: 'Expenses', type: 'number', total: true },
      { key: 'approved_amount', header: 'Approved', type: 'money', total: true },
      { key: 'pending_amount', header: 'Pending', type: 'money', total: true },
      { key: 'rejected_amount', header: 'Rejected', type: 'money', total: true },
      { key: 'voided_amount', header: 'Voided', type: 'money', total: true },
    ],
  },

  // ------------------------------------------------------------ inventory
  {
    id: 'inventory-stock',
    title: 'Current stock & valuation',
    description: 'On-hand, reserved and available quantities, valued at current cost price.',
    category: 'inventory',
    rpc: 'report_inventory_stock',
    groupings: [],
    dateRanged: false,
    columns: [
      { key: 'branch_name', header: 'Branch', type: 'text' },
      { key: 'product_name', header: 'Product', type: 'text' },
      { key: 'variant_name', header: 'Variant', type: 'text' },
      { key: 'sku', header: 'SKU', type: 'text' },
      { key: 'quantity', header: 'On hand', type: 'quantity', total: true },
      { key: 'reserved_quantity', header: 'Reserved', type: 'quantity', total: true },
      { key: 'available_quantity', header: 'Available', type: 'quantity', total: true },
      { key: 'cost_price', header: 'Cost price', type: 'money', permission: FINANCIALS },
      {
        key: 'valuation',
        header: 'Valuation',
        type: 'money',
        total: true,
        permission: FINANCIALS,
      },
    ],
  },
  {
    id: 'inventory-low-stock',
    title: 'Low stock',
    description: 'Products at or below their configured low-stock threshold.',
    category: 'inventory',
    rpc: 'report_inventory_stock',
    groupings: [],
    dateRanged: false,
    columns: [
      { key: 'branch_name', header: 'Branch', type: 'text' },
      { key: 'product_name', header: 'Product', type: 'text' },
      { key: 'variant_name', header: 'Variant', type: 'text' },
      { key: 'sku', header: 'SKU', type: 'text' },
      { key: 'available_quantity', header: 'Available', type: 'quantity' },
      { key: 'low_stock_threshold', header: 'Threshold', type: 'quantity' },
    ],
  },
  {
    id: 'inventory-movements',
    title: 'Stock movement',
    description: 'Every recorded stock change — sales, returns, adjustments and transfers.',
    category: 'inventory',
    rpc: 'report_inventory_movements',
    groupings: [],
    dateRanged: true,
    columns: [
      { key: 'occurred_at', header: 'When', type: 'datetime' },
      { key: 'branch_name', header: 'Branch', type: 'text' },
      { key: 'product_name', header: 'Product', type: 'text' },
      { key: 'variant_name', header: 'Variant', type: 'text' },
      { key: 'movement_type', header: 'Type', type: 'text' },
      { key: 'quantity_delta', header: 'Change', type: 'quantity', total: true },
      { key: 'quantity_after', header: 'Balance after', type: 'quantity' },
      { key: 'reason', header: 'Reason', type: 'text' },
      { key: 'performed_by', header: 'By', type: 'text' },
    ],
  },
  {
    id: 'inventory-expiry',
    title: 'Expiry',
    description: 'Batches already expired or expiring soon, while they still hold stock.',
    category: 'inventory',
    rpc: 'report_expiry',
    groupings: [],
    dateRanged: false,
    columns: [
      { key: 'branch_name', header: 'Branch', type: 'text' },
      { key: 'product_name', header: 'Product', type: 'text' },
      { key: 'variant_name', header: 'Variant', type: 'text' },
      { key: 'batch_number', header: 'Batch', type: 'text' },
      { key: 'expiry_date', header: 'Expires', type: 'date' },
      { key: 'days_remaining', header: 'Days left', type: 'number' },
      { key: 'quantity', header: 'Quantity', type: 'quantity', total: true },
    ],
  },

  // ------------------------------------------------------------- customer
  {
    id: 'customer-transactions',
    title: 'Customer transactions',
    description: 'What each customer has bought, how often, and how recently.',
    category: 'customer',
    rpc: 'report_customer_transactions',
    groupings: [],
    dateRanged: true,
    columns: [
      { key: 'customer_code', header: 'Code', type: 'text' },
      { key: 'customer_name', header: 'Customer', type: 'text' },
      { key: 'sale_count', header: 'Sales', type: 'number', total: true },
      { key: 'total_spent', header: 'Total spent', type: 'money', total: true },
      { key: 'average_sale', header: 'Average sale', type: 'money' },
      { key: 'first_purchase_at', header: 'First purchase', type: 'datetime' },
      { key: 'last_purchase_at', header: 'Last purchase', type: 'datetime' },
    ],
  },
  {
    id: 'customer-store-credit',
    title: 'Store credit',
    description: 'Outstanding credit balances and the movement behind them.',
    category: 'customer',
    rpc: 'report_store_credit',
    groupings: [],
    dateRanged: true,
    columns: [
      { key: 'customer_code', header: 'Code', type: 'text' },
      { key: 'customer_name', header: 'Customer', type: 'text' },
      { key: 'balance', header: 'Balance', type: 'money', total: true },
      { key: 'issued', header: 'Issued', type: 'money', total: true },
      { key: 'spent', header: 'Spent', type: 'money', total: true },
      { key: 'adjusted', header: 'Adjusted', type: 'money', total: true },
      { key: 'entry_count', header: 'Entries', type: 'number', total: true },
    ],
  },
  {
    id: 'customer-layaways',
    title: 'Layaways',
    description: 'Layaway commitments, what has been collected and what is still owed.',
    category: 'customer',
    rpc: 'report_layaways',
    groupings: [],
    dateRanged: true,
    columns: [
      { key: 'reference', header: 'Reference', type: 'text' },
      { key: 'customer_name', header: 'Customer', type: 'text' },
      { key: 'branch_name', header: 'Branch', type: 'text' },
      { key: 'status', header: 'Status', type: 'text' },
      { key: 'total_amount', header: 'Total', type: 'money', total: true },
      { key: 'amount_paid', header: 'Paid', type: 'money', total: true },
      { key: 'outstanding', header: 'Outstanding', type: 'money', total: true },
      { key: 'payment_count', header: 'Payments', type: 'number', total: true },
      { key: 'created_at', header: 'Created', type: 'datetime' },
    ],
  },
]

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  sales: 'Sales',
  financial: 'Financial',
  inventory: 'Inventory',
  customer: 'Customer',
}

export function findStandardReport(id: string): StandardReportDef | undefined {
  return STANDARD_REPORTS.find((report) => report.id === id)
}

export function reportsByCategory(category: ReportCategory): StandardReportDef[] {
  return STANDARD_REPORTS.filter((report) => report.category === category)
}
