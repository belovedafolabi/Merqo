#!/usr/bin/env node
/**
 * Milestone 16 — post-deploy smoke test.
 *
 * Zero dependencies, plain fetch, mutates nothing, needs no secrets — safe to
 * point at a real client deployment. Run by .github/workflows/post-deploy-
 * smoke.yml on every successful Vercel production deploy, and by hand
 * (`pnpm smoke https://<domain>`) as the last step of provisioning a client.
 *
 * Usage: node scripts/smoke-test.mjs https://client.example.com
 */

const base = process.argv[2]?.replace(/\/$/, '')
if (!base) {
  console.error('usage: node scripts/smoke-test.mjs <base-url>')
  process.exit(2)
}

const TIMEOUT_MS = 15_000

async function get(path, { redirect = 'follow' } = {}) {
  const res = await fetch(`${base}${path}`, {
    redirect,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': 'merqo-smoke-test' },
  })
  return res
}

/** @type {{name: string, run: () => Promise<string|void>}[]} */
const checks = [
  {
    name: 'GET /api/health is 200 and every check is ok',
    async run() {
      const res = await get('/api/health')
      if (res.status !== 200) throw new Error(`status ${res.status}`)
      const body = await res.json()
      if (body.status !== 'ok') throw new Error(`status field is "${body.status}"`)
      for (const [k, v] of Object.entries(body.checks ?? {})) {
        if (v !== 'ok') throw new Error(`checks.${k} is "${v}"`)
      }
      return `checks: ${Object.keys(body.checks ?? {}).join(', ')}`
    },
  },
  {
    name: 'GET /sign-in renders',
    async run() {
      const res = await get('/sign-in')
      if (res.status !== 200) throw new Error(`status ${res.status}`)
      const html = await res.text()
      if (!/sign in|log ?in|password/i.test(html)) {
        throw new Error('response does not look like the sign-in page')
      }
    },
  },
  {
    name: 'GET /dashboard unauthenticated redirects to /sign-in (middleware is live)',
    async run() {
      const res = await get('/dashboard', { redirect: 'manual' })
      const location = res.headers.get('location') ?? ''
      const redirected = res.status >= 300 && res.status < 400 && /\/sign-in/.test(location)
      if (!redirected) {
        // Some hosts resolve the redirect server-side; accept landing on /sign-in.
        const followed = await get('/dashboard')
        const url = new URL(followed.url)
        if (!/\/sign-in/.test(url.pathname)) {
          throw new Error(`no redirect to /sign-in (status ${res.status}, location "${location}")`)
        }
      }
      return redirected ? `-> ${location}` : '-> /sign-in (followed)'
    },
  },
  {
    name: 'GET /api/cron/subscriptions without auth is refused (never 200)',
    async run() {
      const res = await get('/api/cron/subscriptions')
      if (res.status === 200)
        throw new Error('cron endpoint answered 200 with no Authorization header')
      if (![401, 403, 503].includes(res.status)) {
        throw new Error(`unexpected status ${res.status} (want 401/403/503)`)
      }
      return `status ${res.status}`
    },
  },
]

const rows = []
let failed = 0
for (const check of checks) {
  try {
    const detail = await check.run()
    rows.push(['PASS', check.name, detail ?? ''])
  } catch (err) {
    failed += 1
    rows.push(['FAIL', check.name, err instanceof Error ? err.message : String(err)])
  }
}

const w = Math.max(...rows.map((r) => r[1].length))
console.log(`\nsmoke test — ${base}\n`)
for (const [status, name, detail] of rows) {
  console.log(`  ${status}  ${name.padEnd(w)}  ${detail}`)
}
console.log(`\n${failed === 0 ? 'all checks passed' : `${failed} check(s) failed`}\n`)
process.exit(failed === 0 ? 0 : 1)
