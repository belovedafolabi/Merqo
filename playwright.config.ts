import { defineConfig, devices, type Project } from '@playwright/test'

import { LIMITED_STORAGE_STATE, STORAGE_STATE } from './tests/e2e/helpers/fixture'

const PORT = Number(process.env.PORT ?? 3000)
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`

/**
 * Milestone 14 added the first authenticated E2E coverage (the checkout
 * flow at tablet and phone widths, barcode scanning, the customer display).
 * Those specs need a Supabase instance to seed against, which the `e2e` CI
 * job now provisions — but a fresh clone has none, and Milestone 01's
 * "clone, install, run" requirement means `pnpm test:e2e` must still work
 * there. So the authenticated projects are declared CONDITIONALLY: with no
 * Supabase configured they simply don't exist, and the three original public
 * specs run exactly as before, rather than every authenticated spec failing
 * on a missing storageState file.
 *
 * The trade-off is real and worth stating: a green local `pnpm test:e2e`
 * without `pnpm db:start` proves strictly less than a green CI run. Start
 * Supabase locally before trusting a local pass.
 */
const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)

/**
 * Milestone 15's cross-browser matrix. `PLAYWRIGHT_BROWSERS` is a
 * comma-separated list; unset means chromium only, so `ci.yml`'s `e2e` job
 * is unchanged and every PR stays fast. `.github/workflows/cross-browser.yml`
 * sets it to `chromium,firefox,webkit` on a nightly schedule. Switching to
 * per-PR is a one-line change to that env var in `ci.yml` (plus the matching
 * browser names on the `playwright install` step).
 */
type BrowserName = 'chromium' | 'firefox' | 'webkit'
const BROWSERS = (process.env.PLAYWRIGHT_BROWSERS ?? 'chromium')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean) as BrowserName[]

// Keeps the existing project names (`desktop-auth`, …) exactly as they were
// for the chromium arm, so nothing that greps the HTML report or CI logs by
// project name breaks. Non-chromium arms get a `-firefox` / `-webkit` suffix.
const suffix = (browser: BrowserName): string => (browser === 'chromium' ? '' : `-${browser}`)

const deviceFor: Record<BrowserName, (typeof devices)[string]> = {
  chromium: devices['Desktop Chrome'],
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
}

/**
 * The authenticated device projects for one browser.
 *
 * Encodes a real Playwright constraint rather than discovering it in CI:
 * `devices['Pixel 7']` and any `isMobile: true` descriptor are Chromium-only
 * — Firefox throws on `isMobile`. So the Firefox arm gets desktop + a
 * hand-rolled tablet and NO phone project; WebKit tolerates `isMobile`, so it
 * keeps one (via `devices['iPhone 14']`, which is a genuine WebKit descriptor).
 */
function authProjectsFor(browser: BrowserName): Project[] {
  const base = deviceFor[browser]
  const projects: Project[] = [
    {
      name: `desktop-auth${suffix(browser)}`,
      dependencies: ['setup'],
      testMatch: /authenticated\/.*\.spec\.ts/,
      testIgnore: /authenticated\/limited\//,
      use: { ...base, storageState: STORAGE_STATE },
    },
    {
      // Hand-rolled rather than devices['iPad …']: every iPad descriptor
      // carries defaultBrowserType 'webkit'. 1024px lands exactly on
      // Tailwind's `lg` breakpoint, which is where the POS swaps
      // MobileCartBar for the desktop CartPanel — so this is the viewport
      // that actually exercises the tablet layout decision.
      name: `tablet-auth${suffix(browser)}`,
      dependencies: ['setup'],
      testMatch: /authenticated\/.*\.spec\.ts/,
      testIgnore: /authenticated\/limited\//,
      use: {
        ...base,
        viewport: { width: 1024, height: 768 },
        deviceScaleFactor: 2,
        hasTouch: true,
        storageState: STORAGE_STATE,
      },
    },
  ]

  if (browser === 'chromium') {
    projects.push({
      // Pixel 7 (412x839) is a genuine Chromium descriptor with isMobile and
      // hasTouch set — below `lg`, so it exercises the mobile cart drawer.
      name: 'phone-auth',
      dependencies: ['setup'],
      testMatch: /authenticated\/.*\.spec\.ts/,
      testIgnore: /authenticated\/limited\//,
      use: { ...devices['Pixel 7'], storageState: STORAGE_STATE },
    })
  } else if (browser === 'webkit') {
    projects.push({
      name: 'phone-auth-webkit',
      dependencies: ['setup'],
      testMatch: /authenticated\/.*\.spec\.ts/,
      testIgnore: /authenticated\/limited\//,
      use: { ...devices['iPhone 14'], storageState: STORAGE_STATE },
    })
  }
  // Firefox: no phone project — isMobile is unsupported there.

  return projects
}

const authenticatedProjects: Project[] = [
  { name: 'setup', testMatch: /auth\.setup\.ts/ },
  ...BROWSERS.flatMap(authProjectsFor),
  {
    // Permission-boundary and cross-tenant specs. Chromium only — an
    // authorization decision is not browser-specific, and running these in
    // every matrix arm would triple their cost for no signal. Uses the
    // genuinely limited (Cashier) session; the storageState is the only
    // thing that distinguishes it from desktop-auth.
    name: 'limited-auth',
    dependencies: ['setup'],
    testMatch: /authenticated\/limited\/.*\.spec\.ts/,
    use: { ...devices['Desktop Chrome'], storageState: LIMITED_STORAGE_STATE },
  },
]

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // The original public/redirect specs only. Without this they'd also
      // run in the unauthenticated project and fail on a missing session.
      testIgnore: /authenticated\//,
    },
    ...(hasSupabase ? authenticatedProjects : []),
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // NOTE: NEXT_PUBLIC_* are inlined into the client bundle at BUILD
        // time, and the build happens here, inside the Playwright run. The
        // Supabase env must therefore already be exported before
        // `pnpm test:e2e` is invoked — see the `e2e` job in
        // .github/workflows/ci.yml.
        command: `pnpm build && pnpm start --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        // Raised from 180s for Milestone 14: with Supabase configured the
        // build no longer short-circuits every Supabase code path.
        timeout: 300_000,
      },
})
