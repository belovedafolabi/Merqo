/**
 * The product-tour script. Two tracks — the admin dashboard and the POS —
 * each a list of {selector, title, body}. The component
 * (components/tour/product-tour.tsx) turns these into driver.js steps and
 * drops any whose element isn't on the page, so a step gated behind a
 * permission the viewer lacks (its nav item never rendered) simply doesn't
 * appear. That's the persona handling: a Cashier on /pos gets the POS
 * track; an Owner gets every admin step their nav shows plus the POS track.
 */
export interface TourStep {
  /** CSS selector resolved against the live DOM when the tour runs. */
  selector: string
  title: string
  body: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export const ADMIN_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="app-sidebar"]',
    title: 'Your workspace',
    body: 'Everything is one click away from this sidebar. You only see the sections your role allows.',
    side: 'right',
  },
  {
    selector: '[data-tour="business-unit-switcher"]',
    title: 'Which outlet you’re working in',
    body: 'Products, stock and reports all apply to the branch and business unit shown here.',
    side: 'right',
  },
  {
    selector: 'a[href="/dashboard"]',
    title: 'Overview',
    body: 'Your daily snapshot — sales so far, low stock, and recent activity.',
    side: 'right',
  },
  {
    selector: 'a[href="/pos"]',
    title: 'Point of Sale',
    body: 'Where you actually ring up sales. We’ll walk through it in a moment.',
    side: 'right',
  },
  {
    selector: 'a[href="/sales"]',
    title: 'Sales',
    body: 'Every completed sale, with its receipt, refunds and returns.',
    side: 'right',
  },
  {
    selector: 'a[href="/products"]',
    title: 'Products',
    body: 'Add what you sell — name, price, SKU (auto-generated if you leave it blank), and unit of measurement. Manage categories and units from here too.',
    side: 'right',
  },
  {
    selector: 'a[href="/inventory"]',
    title: 'Inventory',
    body: 'Count stock in, adjust for damage or loss, and move stock between branches. A product must be stocked before it can be sold.',
    side: 'right',
  },
  {
    selector: 'a[href="/customers"]',
    title: 'Customers',
    body: 'Keep customer details, store credit and purchase history. Attach a customer at checkout to track it.',
    side: 'right',
  },
  {
    selector: 'a[href="/layaways"]',
    title: 'Layaways',
    body: 'Let customers pay for goods in instalments and collect once it’s paid off.',
    side: 'right',
  },
  {
    selector: 'a[href="/reports"]',
    title: 'Reports',
    body: 'Sales, payments, tax and profit — filter by date and branch, and save a report to re-run later.',
    side: 'right',
  },
  {
    selector: 'a[href="/expenses"]',
    title: 'Expenses',
    body: 'Log what you spend so your profit figures are real.',
    side: 'right',
  },
  {
    selector: 'a[href="/business-structure"]',
    title: 'Business structure',
    body: 'Your branches and the business units inside them, plus each one’s tax and discount rules.',
    side: 'right',
  },
  {
    selector: 'a[href="/employees"]',
    title: 'Employees',
    body: 'Invite staff, assign their role, and deactivate anyone who leaves.',
    side: 'right',
  },
  {
    selector: 'a[href="/roles"]',
    title: 'Roles',
    body: 'Build custom roles by ticking exactly the permissions each one should have.',
    side: 'right',
  },
  {
    selector: 'a[href="/settings"]',
    title: 'Settings',
    body: 'Business profile, branding, and the receipt layout. Try the Detailed or Compact receipt template here.',
    side: 'right',
  },
  {
    selector: '[data-tour="app-topbar"]',
    title: 'Page actions & alerts',
    body: 'The current page’s main action and your notifications live up here.',
    side: 'bottom',
  },
]

export const POS_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="pos-search"]',
    title: 'Find a product',
    body: 'Type a name or SKU, or scan a barcode. Just start typing anywhere on this screen — it jumps here automatically.',
    side: 'bottom',
  },
  {
    selector: '[data-tour="pos-cart"]',
    title: 'The cart',
    body: 'Items you add land here. Adjust quantities, apply a discount, or hold the sale to serve someone else and come back to it.',
    side: 'left',
  },
  {
    selector: '[data-tour="pos-checkout"]',
    title: 'Take payment',
    body: 'Opens checkout: choose cash, card, transfer or store credit, attach a customer if needed, then complete the sale.',
    side: 'left',
  },
  {
    selector: '[data-tour="pos-returns"]',
    title: 'Returns',
    body: 'Process a return or refund against an earlier sale from here.',
    side: 'bottom',
  },
]
