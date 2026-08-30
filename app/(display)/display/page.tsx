import { CustomerDisplayScreen } from '@/components/pos/customer-display-screen'
import { getOrganizationBranding } from '@/lib/branding/queries'

/**
 * The customer-facing display. Opened from the POS header via window.open, so
 * it lands in a second window on the same machine — typically the counter's
 * customer-facing monitor.
 *
 * Branding is read here, on the server, and handed down as props: it is fixed
 * for the whole session, so the client component has nothing to fetch and no
 * reason to hold a Supabase client.
 */
export default async function CustomerDisplayPage() {
  const branding = await getOrganizationBranding()

  return (
    <CustomerDisplayScreen
      displayName={branding?.displayName ?? 'Welcome'}
      logoUrl={branding?.logoUrl ?? null}
    />
  )
}
