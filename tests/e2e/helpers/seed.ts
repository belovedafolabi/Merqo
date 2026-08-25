import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

/**
 * Seeds one disposable, fully-onboarded organization for the authenticated
 * E2E suite, per docs/milestones/14-hardware-integration-and-pos-ux.md's
 * Testing Requirements ("Playwright checks at tablet and phone viewport
 * widths confirm the checkout flow remains fully usable"). Until this
 * milestone the E2E suite had no authenticated coverage at all — the note in
 * tests/e2e/responsive-shell.spec.ts deferring it "to a later milestone with
 * a seeded E2E test user" is the gap this module closes.
 *
 * Deliberately does NOT import tests/integration/helpers/*. Those modules
 * pull in ./db, which constructs a `pg` Pool at module load that this
 * process would then have to remember to end() — and they assume a
 * DATABASE_URL that only exists when Postgres is reachable directly.
 * Duplicating the ~20 lines of "sign up, bootstrap an org" is cheaper than
 * that coupling, and it keeps this harness working unchanged against a
 * remote Supabase project (where there is no direct Postgres port) later.
 *
 * Everything here runs through the OWNER'S OWN authenticated client, never
 * the service-role key: create_organization_with_owner() grants the signup
 * user every permission, and each write below has an exact counterpart in
 * lib/business-structure/mutations.ts that the real onboarding wizard
 * performs the same way. That means this seed exercises the same RLS
 * policies the application does — if a policy regresses, the harness fails
 * loudly instead of masking it with a privileged bypass.
 */

// Same zero-setup fallbacks as tests/integration/helpers/supabase.ts — the
// standard public demo JWTs every `supabase start` prints on every machine,
// allowlisted in .gitleaks.toml. CI overrides them with real env values.
const DEFAULT_LOCAL_URL = 'http://127.0.0.1:54321'
const DEFAULT_LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEFAULT_LOCAL_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? DEFAULT_LOCAL_ANON_KEY

/** The barcode the scanner spec types as a rapid burst. */
export const E2E_BARCODE = 'E2EBARCODE0001'
/** The product that barcode resolves to, and the term the search spec types. */
export const E2E_BARCODE_PRODUCT_NAME = 'E2E Scan Milk'
/** A second, search-only product — proves search and scan are separate paths. */
export const E2E_SEARCH_PRODUCT_NAME = 'E2E Search Bread'

const SEEDED_STOCK_QUANTITY = 500

export interface E2EFixture {
  email: string
  password: string
  organizationId: string
  branchId: string
  businessUnitId: string
  barcode: string
  barcodeProductName: string
  searchProductName: string
}

function assertOk(step: string, error: { message: string } | null): void {
  if (error) throw new Error(`E2E seed failed at "${step}": ${error.message}`)
}

/**
 * Signs up, then falls back to signing in if that reports a failure.
 *
 * Not paranoia — an observed failure mode. GoTrue enforces a ~10s deadline
 * on /signup and returns 504 when it trips, but the auth.users row is
 * already committed by then: the client sees "Processing this request timed
 * out" for a signup that actually succeeded. On a loaded machine (a Next.js
 * production build and a browser running alongside a local Supabase) that is
 * reachable, and treating it as fatal would fail the whole authenticated
 * suite over a slow container. Signing in proves whether the account exists;
 * only if that ALSO fails is the signup genuinely lost.
 */
async function signUpOrSignIn(
  supabase: SupabaseClient,
  email: string,
  password: string,
): Promise<void> {
  const { data: signUp, error: signUpError } = await supabase.auth.signUp({ email, password })
  if (!signUpError && signUp.session) return

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
  if (!signInError) return

  throw new Error(
    `E2E seed could not establish a session for ${email}. ` +
      `signUp: ${signUpError?.message ?? 'returned no session (is [auth.email] enable_confirmations still false?)'}; ` +
      `signIn: ${signInError.message}`,
  )
}

export async function seedE2EFixture(): Promise<E2EFixture> {
  // A fresh UUID every execution, not a stable GITHUB_RUN_ID-derived
  // address. Playwright retries the setup project on failure, and a stable
  // email would make the second attempt collide with the first attempt's
  // half-built organization. A unique one is trivially idempotent: a retry
  // simply builds a clean org and never has to reason about what the
  // previous attempt already wrote. CI drops the whole Supabase instance
  // afterwards, and locally the rows are namespaced and inert.
  const runId = randomUUID()
  const email = `e2e-cashier-${runId}@example.com`
  const password = `E2E-${runId}`

  const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  await signUpOrSignIn(supabase, email, password)

  const { data: bootstrap, error: bootstrapError } = await supabase
    .rpc('create_organization_with_owner', {
      p_organization_name: 'E2E Retail',
      p_organization_slug: `e2e-retail-${runId.slice(0, 8)}`,
      p_full_name: 'E2E Cashier',
    })
    .single<{ organization_id: string; user_role_id: string }>()
  assertOk('create_organization_with_owner', bootstrapError)
  const organizationId = bootstrap!.organization_id

  const { data: branch, error: branchError } = await supabase
    .from('branches')
    .insert({
      organization_id: organizationId,
      name: 'Main',
      slug: `e2e-main-${runId.slice(0, 8)}`,
    })
    .select('id')
    .single<{ id: string }>()
  assertOk('insert branches', branchError)
  const branchId = branch!.id

  // 'supermarket' is guaranteed present — supabase/seed.sql seeds all 13
  // business types as reference data, asserted by tests/integration/seed.test.ts.
  const { data: businessType, error: businessTypeError } = await supabase
    .from('business_types')
    .select('id')
    .eq('slug', 'supermarket')
    .single<{ id: string }>()
  assertOk("select business_types slug='supermarket'", businessTypeError)

  const { data: businessUnit, error: businessUnitError } = await supabase
    .from('business_units')
    .insert({
      branch_id: branchId,
      business_type_id: businessType!.id,
      name: 'Front Store',
      slug: `e2e-front-store-${runId.slice(0, 8)}`,
    })
    .select('id')
    .single<{ id: string }>()
  assertOk('insert business_units', businessUnitError)
  const businessUnitId = businessUnit!.id

  // Required, or app/(pos)/layout.tsx redirects to /onboarding before any
  // spec can reach the till — getOnboardingState() treats a missing POS
  // config as an incomplete onboarding. Discount authorization is left off
  // so the checkout spec never trips the discount permission gate.
  const { error: posConfigError } = await supabase.from('business_unit_pos_config').insert({
    business_unit_id: businessUnitId,
    tax_rate: 7.5,
    service_charge_enabled: false,
    discount_requires_authorization: false,
    discount_reason_required: false,
    default_payment_method: 'cash',
  })
  assertOk('insert business_unit_pos_config', posConfigError)

  // The other half of the same gate — layout.tsx checks
  // onboardingCompletedAt separately from the branch/unit/config trio.
  // Mirrors completeOnboarding() in lib/business-structure/mutations.ts.
  const { error: completeError } = await supabase
    .from('organizations')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', organizationId)
  assertOk('complete onboarding', completeError)

  // A catalog large enough that search returns a proper grid but small
  // enough to stay well under searchProducts()' own .limit(50). The two
  // named products above are the ones the specs assert on; the filler
  // exists so the grid is never a single lonely tile.
  const products = [
    { name: E2E_BARCODE_PRODUCT_NAME, sku: 'E2E-MILK-001', barcode: E2E_BARCODE, base_price: 1200 },
    { name: E2E_SEARCH_PRODUCT_NAME, sku: 'E2E-BREAD-001', barcode: null, base_price: 850 },
    ...Array.from({ length: 22 }, (_, index) => ({
      name: `E2E Filler Item ${String(index + 1).padStart(2, '0')}`,
      sku: `E2E-FILL-${String(index + 1).padStart(3, '0')}`,
      barcode: null,
      base_price: 100 * (index + 1),
    })),
  ].map((product) => ({ ...product, business_unit_id: businessUnitId, cost_price: 0 }))

  const { data: inserted, error: productsError } = await supabase
    .from('products')
    .insert(products)
    .select('id, name')
  assertOk('insert products', productsError)

  // create_sale() deducts inventory and rejects a line it cannot cover, so
  // without this the checkout spec fails on its very last step. Goes through
  // record_inventory_movement() (20260823110400) rather than writing
  // inventory_balances directly — that function is the only supported write
  // path, and it keeps the balance and the movement ledger consistent the
  // same way lib/inventory does.
  //
  // Issued concurrently: the function locks one inventory_balances row per
  // (branch, product), and every call here targets a different product, so
  // there is no contention to serialize. Sequentially this was ~24 round
  // trips and the dominant cost of the whole seed.
  const stockResults = await Promise.all(
    inserted!.map(async (product) => ({
      product,
      result: await supabase.rpc('record_inventory_movement', {
        p_branch_id: branchId,
        p_product_id: product.id,
        p_variant_id: null,
        p_movement_type: 'ADJUSTMENT',
        p_quantity_delta: SEEDED_STOCK_QUANTITY,
        p_reason: 'e2e seed',
        p_reference_type: null,
        p_reference_id: null,
      }),
    })),
  )
  for (const { product, result } of stockResults) {
    assertOk(`stock up "${product.name}"`, result.error)
  }

  return {
    email,
    password,
    organizationId,
    branchId,
    businessUnitId,
    barcode: E2E_BARCODE,
    barcodeProductName: E2E_BARCODE_PRODUCT_NAME,
    searchProductName: E2E_SEARCH_PRODUCT_NAME,
  }
}
