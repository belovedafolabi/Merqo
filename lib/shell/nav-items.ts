/**
 * The Admin Dashboard's navigation structure — docs/UXUI_Design_System_Specification.md
 * §12's list, rendered dynamically per this milestone's functional
 * requirement ("a user only sees modules they are authorized to access").
 *
 * Feature screens for most of these modules don't exist until their own
 * milestone (Products: 06, Inventory: 07, Sales/POS: 08, Customers/Layaways:
 * 09, Reports: 10, Employees: 11) — per this milestone's explicit scope,
 * building those screens is out of bounds here. What this milestone *does*
 * own is the nav-generation mechanism itself, so every later milestone adds
 * a route without touching the shell. `href` already points at each
 * module's eventual route.
 *
 * `permission` gates a visible-but-inert item behind `<Can>`
 * (components/auth/can.tsx) only where a real permission already exists in
 * the seeded catalog (supabase/seed.sql) — "Business Structure"
 * (`branches.view`), since Milestone 06 "Products" (`products.view`), since
 * Milestone 07 "Inventory" (`inventory.view`), since Milestone 09
 * "Customers" (`customers.view`) and "Layaways" (`layaway.view`), and since
 * Milestone 10 "Reports" (`reports.view`) and "Expenses" (`expense.view`).
 * Items whose domain permission doesn't exist yet are intentionally left
 * ungated (`permission: null`): gating them on a
 * *different* module's permission, or hiding them for everyone, would be
 * more wrong than showing a module every authenticated user can eventually
 * reach once its own milestone lands and seeds its own permission.
 *
 * `icon` is a string key, not a Lucide component reference: this module is
 * imported by both components/shell/admin-sidebar.tsx (a Server Component)
 * and components/shell/nav-list.tsx ('use client'). A component/function
 * value crossing that Server->Client prop boundary isn't serializable
 * ("Only plain objects can be passed to Client Components...") — NavList
 * owns the actual icon-name -> component lookup, since it's the only
 * consumer that renders one. Every nav-gating permission scope so far is
 * just `{ organizationId }` (no item needs branch/business-unit scoping),
 * so `permission` carries only the key — NavList builds the scope itself
 * from the organization id it already reads via useCurrentOrganizationId().
 */
export interface NavItem {
  label: string
  href: string
  icon:
    | 'LayoutDashboard'
    | 'ShoppingCart'
    | 'Receipt'
    | 'Package'
    | 'Boxes'
    | 'Users'
    | 'Wallet'
    | 'ScrollText'
    | 'Banknote'
    | 'Building2'
    | 'Settings'
    | 'UserCog'
    | 'ShieldCheck'
  permission: { key: string } | null
  badge?: string
}

export const primaryNavItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: 'LayoutDashboard', permission: null },
  { label: 'POS', href: '/pos', icon: 'ShoppingCart', permission: null },
  { label: 'Sales', href: '/sales', icon: 'Receipt', permission: null },
  { label: 'Products', href: '/products', icon: 'Package', permission: { key: 'products.view' } },
  {
    label: 'Inventory',
    href: '/inventory',
    icon: 'Boxes',
    permission: { key: 'inventory.view' },
  },
  { label: 'Customers', href: '/customers', icon: 'Users', permission: { key: 'customers.view' } },
  { label: 'Layaways', href: '/layaways', icon: 'Wallet', permission: { key: 'layaway.view' } },
  { label: 'Reports', href: '/reports', icon: 'ScrollText', permission: { key: 'reports.view' } },
  { label: 'Expenses', href: '/expenses', icon: 'Banknote', permission: { key: 'expense.view' } },
  {
    label: 'Business Structure',
    href: '/business-structure',
    icon: 'Building2',
    permission: { key: 'branches.view' },
  },
  // Milestone 11: gated on users.view (Milestone 03), same key the directory
  // page itself requires — anyone who can see the employee list can see the
  // nav item that leads to it.
  { label: 'Employees', href: '/employees', icon: 'UserCog', permission: { key: 'users.view' } },
]

export const secondaryNavItems: NavItem[] = [
  // Milestone 11: gated on roles.view (Milestone 03) — every seeded role
  // already holds it except the operational five (Cashier, Salesperson,
  // Pharmacist, Waiter, Kitchen Staff), matching who could assign a role
  // even before the builder existed.
  { label: 'Roles', href: '/roles', icon: 'ShieldCheck', permission: { key: 'roles.view' } },
  // Was a dead link until Milestone 11 built /settings — see app/(app)/settings/page.tsx.
  { label: 'Settings', href: '/settings', icon: 'Settings', permission: null },
]
