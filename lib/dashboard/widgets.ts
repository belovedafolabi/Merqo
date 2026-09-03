/**
 * The Admin dashboard's widget catalogue — the fixed set of cards a user can
 * show on their Overview screen, and the default composition.
 *
 * Mirrors dashboard_widgets_widget_id_check (20260903090400) the same way
 * lib/receipts/templates.ts mirrors organizations_receipt_template_id_check:
 * the id list is stated twice, in TypeScript and in Postgres, and
 * tests/unit/dashboard/widgets.test.ts reads this file and the migration and
 * asserts they stay identical — so adding a widget here without the matching
 * CHECK branch fails the build, not runtime.
 *
 * `permission`, where present, gates the widget: a user without it never
 * sees the card in the "Add widget" drawer and it is filtered from their
 * layout on read, the same belt-and-braces `<Can>` + server-filter shape the
 * rest of the app uses.
 */

export const WIDGET_IDS = [
  'sales_summary',
  'sales_overview',
  'low_stock',
  'recent_products',
  'recent_sales',
  'top_products',
] as const
export type WidgetId = (typeof WIDGET_IDS)[number]

export interface WidgetDef {
  id: WidgetId
  label: string
  description: string
  /** Extra permission required to see this widget, beyond being signed in. */
  permission: string | null
  /** Shown by default on a dashboard the user has never customised. */
  defaultEnabled: boolean
  /** Default position; ties fall back to this file's declaration order. */
  defaultPosition: number
  /** A two-column card spans the full width on `lg`; a one-column card is a third. */
  span: 1 | 2
}

export const WIDGETS: Record<WidgetId, WidgetDef> = {
  sales_summary: {
    id: 'sales_summary',
    label: 'Sales summary',
    description: 'Today’s sales, transaction count and average sale, with a day-on-day delta.',
    permission: null,
    defaultEnabled: true,
    defaultPosition: 0,
    span: 2,
  },
  sales_overview: {
    id: 'sales_overview',
    label: 'Sales overview',
    description: 'A day-by-day chart of net sales over the last two weeks.',
    permission: null,
    defaultEnabled: true,
    defaultPosition: 1,
    span: 2,
  },
  low_stock: {
    id: 'low_stock',
    label: 'Low stock',
    description: 'Products at or below their configured reorder threshold.',
    permission: 'inventory.view',
    defaultEnabled: true,
    defaultPosition: 2,
    span: 1,
  },
  recent_products: {
    id: 'recent_products',
    label: 'Recent products',
    description: 'The most recently added products in this business unit.',
    permission: 'products.view',
    defaultEnabled: true,
    defaultPosition: 3,
    span: 1,
  },
  recent_sales: {
    id: 'recent_sales',
    label: 'Recent sales',
    description: 'The last few completed sales at this branch.',
    permission: 'sales.view',
    defaultEnabled: false,
    defaultPosition: 4,
    span: 1,
  },
  top_products: {
    id: 'top_products',
    label: 'Top products',
    description: 'Best sellers by unit volume over the last 30 days.',
    permission: 'sales.view',
    defaultEnabled: false,
    defaultPosition: 5,
    span: 1,
  },
}

export const WIDGET_LIST: WidgetDef[] = WIDGET_IDS.map((id) => WIDGETS[id])

export function findWidget(id: string): WidgetDef | null {
  return (WIDGET_IDS as readonly string[]).includes(id) ? WIDGETS[id as WidgetId] : null
}
