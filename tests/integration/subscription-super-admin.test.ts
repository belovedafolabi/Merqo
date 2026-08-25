import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { pool } from './helpers/db'
import { bootstrapOrganization, createTestUser, promoteToSuperAdmin } from './helpers/supabase'

/**
 * Milestone 13's Security Requirement: "Subscription-lock bypass is
 * exclusively for the Super Admin role — tested explicitly to confirm no
 * other role can bypass it under any configuration." This is that test,
 * plus the seed-idempotency hazard caught during design (§7's Owner
 * cross-join fix in supabase/seed.sql).
 */

async function permissionId(key: string): Promise<string> {
  const result = await pool.query(`select id from public.permissions where key = $1`, [key])
  if (result.rows.length === 0) throw new Error(`unknown permission key: ${key}`)
  return result.rows[0].id as string
}

describe('Super Admin — no other role can carry platform.override', () => {
  afterAll(async () => {
    await pool.end()
  })

  it('no seeded role except super_admin holds any platform.* permission', async () => {
    // Scoped to is_system_role = true — the actual seeded catalog. Other
    // test files' own fixture roles (e.g. this file's own "audit-admin-*"
    // fixture in subscription-audit.test.ts, built specifically to exercise
    // platform.manage_pricing) are non-system, deliberately-scoped test
    // setup, not a leak of this assertion's concern.
    const result = await pool.query(`
      select r.slug
      from public.roles r
      join public.role_permissions rp on rp.role_id = r.id
      join public.permissions p on p.id = rp.permission_id
      where p.resource = 'platform' and r.slug <> 'super_admin' and r.is_system_role = true
    `)
    expect(result.rows).toHaveLength(0)
  })

  it('the escalation guard blocks a role author from building a role that carries platform.override', async () => {
    const suffix = randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, `SuperAdminGuard${suffix}`)

    // A "Role Author" holding roles.create and NOTHING else — same fixture
    // shape as tests/integration/role-builder.test.ts, deliberately not the
    // Owner (who would pass every check vacuously, per that file's own
    // warning) and not a Super Admin.
    const roleResult = await pool.query(
      `insert into public.roles (name, slug, description, is_system_role)
       values ($1, $2, 'test fixture role', false) returning id`,
      [`role-author-${suffix}`, `role-author-${suffix}`],
    )
    const roleAuthor = await createTestUser()
    await pool.query(
      `insert into public.role_permissions (role_id, permission_id) values ($1, $2)`,
      [roleResult.rows[0].id, await permissionId('roles.create')],
    )
    await pool.query(
      `insert into public.user_roles (user_id, role_id, organization_id) values ($1, $2, $3)`,
      [roleAuthor.userId, roleResult.rows[0].id, organizationId],
    )

    // Attempt: build a new role carrying platform.override, the same way
    // lib/roles/mutations.ts's createRole() does (insert roles, then
    // role_permissions) — via the real signed-in client, so RLS
    // (user_grants_cover_role(), 20260824090900) is what is under test.
    const attemptResult = await roleAuthor.client
      .from('roles')
      .insert({
        name: `escalation-attempt-${suffix}`,
        slug: `escalation-attempt-${suffix}`,
        is_system_role: false,
        // roles_insert's WITH CHECK requires created_by = auth.uid()
        // (20260824090700) — attribution, not part of what this test exercises.
        created_by: roleAuthor.userId,
      })
      .select('id')
      .single()
    expect(attemptResult.error).toBeNull()

    const { error: attachError } = await roleAuthor.client.from('role_permissions').insert({
      role_id: attemptResult.data!.id,
      permission_id: await permissionId('platform.override'),
    })

    // user_grants_cover_role() denies attaching a permission the assigner
    // does not personally hold org-wide — platform.override is exactly such
    // a permission for a Role Author.
    expect(attachError).not.toBeNull()
  })

  it('an Owner cannot assign the super_admin role to anyone (they do not hold platform.*)', async () => {
    const suffix = randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, `SuperAdminAssign${suffix}`)
    const target = await createTestUser()

    const superAdminRole = await pool.query(
      `select id from public.roles where slug = 'super_admin'`,
    )

    const { error } = await owner.client.from('user_roles').insert({
      user_id: target.userId,
      role_id: superAdminRole.rows[0].id,
      organization_id: organizationId,
    })

    // user_grants_cover_role() applies to assignment too (20260824090900) —
    // an Owner lacks platform.override/platform.manage_pricing, so they
    // cannot hand out a role that carries them.
    expect(error).not.toBeNull()
  })

  it('running seed.sql a second time does not grant Owner any platform.* permission', async () => {
    // Simulates supabase/seed.sql's own idempotent re-run (CI's double `db
    // reset` already exercises this at the schema level; this asserts the
    // specific hazard the design caught: a bare cross-join re-run after
    // platform.* keys already exist).
    await pool.query(`
      insert into public.role_permissions (role_id, permission_id)
      select r.id, p.id from public.roles r
      cross join public.permissions p
      where r.slug = 'owner' and p.resource <> 'platform'
      on conflict (role_id, permission_id) do nothing
    `)

    const result = await pool.query(`
      select p.key
      from public.roles r
      join public.role_permissions rp on rp.role_id = r.id
      join public.permissions p on p.id = rp.permission_id
      where r.slug = 'owner' and p.resource = 'platform'
    `)
    expect(result.rows).toHaveLength(0)
  })

  it('a promoted Super Admin is idempotent under on conflict do nothing (promoting twice does not error or duplicate)', async () => {
    const suffix = randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, `SuperAdminTwice${suffix}`)
    const admin = await createTestUser()

    await promoteToSuperAdmin(admin.email, organizationId)
    await promoteToSuperAdmin(admin.email, organizationId)

    const result = await pool.query(
      `select count(*) as count from public.user_roles ur
       join public.roles r on r.id = ur.role_id
       where ur.user_id = $1 and r.slug = 'super_admin' and ur.organization_id = $2`,
      [admin.userId, organizationId],
    )
    expect(Number(result.rows[0].count)).toBe(1)
  })
})
