import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { fetchPermissionGrants } from '@/lib/auth/context'
import { resolvePermission } from '@/lib/auth/permissions'
import { pool } from './helpers/db'
import { bootstrapOrganization, createTestUser } from './helpers/supabase'

/**
 * Milestone 11's Risks section names this directly: "self-elevation and
 * privilege-escalation bugs are the primary risk in a custom-role builder —
 * this milestone's authorization tests must explicitly attempt escalation
 * paths ... and confirm they fail." This file is that suite, plus the
 * companion property that makes the feature worth building at all: a custom
 * role, once created, behaves exactly like a built-in one.
 *
 * Everything that matters runs through real signed-in supabase-js clients —
 * `.from('roles').insert(...)`, `.from('role_permissions').insert(...)`,
 * `.from('user_roles').insert(...)` — never through a Server Action. The
 * threat this suite is written against is `POST /rest/v1/role_permissions`
 * with a stolen or malicious low-privilege JWT, which skips
 * lib/roles/mutations.ts entirely; only RLS is between that request and the
 * database.
 *
 * CRITICAL: an Owner passes every one of these checks trivially, because
 * supabase/seed.sql §6 cross-joins Owner against the whole permission
 * catalog — an escalation test written as Owner passes vacuously and proves
 * nothing. Every negative case below therefore uses a purpose-built,
 * low-privilege "Role Author" fixture that holds `roles.create` and, for the
 * assignment tests, `roles.assign` — and nothing else — assigned via the
 * `pg` pool (test setup, bypassing RLS) so the assignment itself is not what
 * is under test.
 */

interface Fixture {
  organizationId: string
  owner: { client: SupabaseClient; userId: string }
  /** Holds only roles.create. Used for the role/role_permissions escalation cases. */
  roleAuthor: { client: SupabaseClient; userId: string }
  /** Holds only roles.assign. Used for the direct-assignment escalation case. */
  roleAssigner: { client: SupabaseClient; userId: string }
  cashierRoleId: string
}

let fixture: Fixture

async function permissionId(key: string): Promise<string> {
  const result = await pool.query(`select id from public.permissions where key = $1`, [key])
  if (result.rows.length === 0) throw new Error(`unknown permission key: ${key}`)
  return result.rows[0].id as string
}

async function grantPermission(
  organizationId: string,
  userId: string,
  roleSlug: string,
  permissionKeys: readonly string[],
): Promise<void> {
  const roleResult = await pool.query(
    `insert into public.roles (name, slug, description, is_system_role)
     values ($1, $2, 'test fixture role', false)
     returning id`,
    [roleSlug, roleSlug],
  )
  const roleId = roleResult.rows[0].id as string

  for (const key of permissionKeys) {
    await pool.query(
      `insert into public.role_permissions (role_id, permission_id) values ($1, $2)`,
      [roleId, await permissionId(key)],
    )
  }

  await pool.query(
    `insert into public.user_roles (user_id, role_id, organization_id) values ($1, $2, $3)`,
    [userId, roleId, organizationId],
  )
}

beforeAll(async () => {
  const suffix = randomUUID().slice(0, 8)

  const owner = await createTestUser()
  const { organizationId } = await bootstrapOrganization(owner, `RoleBuilder${suffix}`)

  const roleAuthor = await createTestUser()
  await grantPermission(organizationId, roleAuthor.userId, `role-author-${suffix}`, [
    'roles.create',
  ])

  const roleAssigner = await createTestUser()
  await grantPermission(organizationId, roleAssigner.userId, `role-assigner-${suffix}`, [
    'roles.assign',
    'inventory.view',
  ])

  const cashierResult = await pool.query(`select id from public.roles where slug = 'cashier'`)

  fixture = {
    organizationId,
    owner: { client: owner.client, userId: owner.userId },
    roleAuthor: { client: roleAuthor.client, userId: roleAuthor.userId },
    roleAssigner: { client: roleAssigner.client, userId: roleAssigner.userId },
    cashierRoleId: cashierResult.rows[0].id as string,
  }
})

afterAll(async () => {
  await pool.end()
})

describe('custom role builder — grants exactly what it says', () => {
  it('a custom role, once created and assigned, grants exactly its selected permissions', async () => {
    const suffix = randomUUID().slice(0, 8)

    // The role-authoring path itself, run as Owner through the real client —
    // exercising roles_insert and role_permissions_insert, not a pg shortcut.
    const { data: role, error: roleError } = await fixture.owner.client
      .from('roles')
      .insert({
        name: `Stock Auditor ${suffix}`,
        slug: `stock-auditor-${suffix}`,
        description: 'Read-only inventory and product visibility.',
        is_system_role: false,
        created_by: fixture.owner.userId,
      })
      .select('id')
      .single()
    expect(roleError).toBeNull()

    const grantedKeys = ['inventory.view', 'products.view']
    for (const key of grantedKeys) {
      const { error } = await fixture.owner.client
        .from('role_permissions')
        .insert({ role_id: role!.id, permission_id: await permissionId(key) })
      expect(error).toBeNull()
    }

    const assignee = await createTestUser()
    const { error: assignError } = await fixture.owner.client.from('user_roles').insert({
      user_id: assignee.userId,
      role_id: role!.id,
      organization_id: fixture.organizationId,
    })
    expect(assignError).toBeNull()

    const grants = await fetchPermissionGrants(assignee.client)
    const grantedInOrg = grants
      .filter((g) => g.organizationId === fixture.organizationId)
      .map((g) => g.permissionKey)
      .sort()

    // Set-equality: no more, no less.
    expect(grantedInOrg).toEqual([...grantedKeys].sort())
    expect(resolvePermission(grants, 'inventory.view', { organizationId: fixture.organizationId })).toBe(
      true,
    )
    expect(
      resolvePermission(grants, 'products.update', { organizationId: fixture.organizationId }),
    ).toBe(false)
  })

  it('a custom role behaves identically to a built-in one: it gates the real RLS-protected write', async () => {
    const suffix = randomUUID().slice(0, 8)

    const branchResult = await pool.query(
      `insert into public.branches (organization_id, name, slug) values ($1, $2, $3) returning id`,
      [fixture.organizationId, `Role Builder Branch ${suffix}`, `role-builder-branch-${suffix}`],
    )
    const branchId = branchResult.rows[0].id as string

    const { data: role } = await fixture.owner.client
      .from('roles')
      .insert({
        name: `Expense Viewer ${suffix}`,
        slug: `expense-viewer-${suffix}`,
        is_system_role: false,
        created_by: fixture.owner.userId,
      })
      .select('id')
      .single()

    await fixture.owner.client
      .from('role_permissions')
      .insert({ role_id: role!.id, permission_id: await permissionId('expense.view') })

    const assignee = await createTestUser()
    await fixture.owner.client.from('user_roles').insert({
      user_id: assignee.userId,
      role_id: role!.id,
      organization_id: fixture.organizationId,
    })

    // expense.view lets them read...
    const { error: selectError } = await assignee.client
      .from('expenses')
      .select('id')
      .eq('organization_id', fixture.organizationId)
    expect(selectError).toBeNull()

    // ...but not create — the same expenses_insert policy every built-in
    // role is gated by, not a special case for custom roles.
    const { error: insertError } = await assignee.client.from('expenses').insert({
      organization_id: fixture.organizationId,
      branch_id: branchId,
      category: 'utilities',
      amount: 100,
      payment_method: 'cash',
      expense_date: new Date().toISOString().slice(0, 10),
      description: 'should be denied',
    })
    expect(insertError).not.toBeNull()
  })
})

describe('custom role builder — self-elevation is refused (RLS-level, curl-equivalent)', () => {
  it('control: a user with roles.create legally creates a role with no permissions', async () => {
    const suffix = randomUUID().slice(0, 8)
    const { error } = await fixture.roleAuthor.client.from('roles').insert({
      name: `Empty Role ${suffix}`,
      slug: `empty-role-${suffix}`,
      is_system_role: false,
      created_by: fixture.roleAuthor.userId,
    })
    expect(error).toBeNull()
  })

  it('(a) a user WITHOUT roles.create cannot insert into roles at all', async () => {
    const bystander = await createTestUser()
    const suffix = randomUUID().slice(0, 8)

    const { error } = await bystander.client.from('roles').insert({
      name: `Bystander Role ${suffix}`,
      slug: `bystander-role-${suffix}`,
      is_system_role: false,
      created_by: bystander.userId,
    })
    expect(error).not.toBeNull()
  })

  it('(b) a user WITH roles.create cannot grant a permission they do not hold', async () => {
    const suffix = randomUUID().slice(0, 8)
    const { data: role } = await fixture.roleAuthor.client
      .from('roles')
      .insert({
        name: `Escalation Attempt ${suffix}`,
        slug: `escalation-attempt-${suffix}`,
        is_system_role: false,
        created_by: fixture.roleAuthor.userId,
      })
      .select('id')
      .single()
    expect(role).not.toBeNull()

    // roleAuthor holds ONLY roles.create — never granted expense.delete.
    const { error } = await fixture.roleAuthor.client.from('role_permissions').insert({
      role_id: role!.id,
      permission_id: await permissionId('expense.delete'),
    })
    expect(error).not.toBeNull()
  })

  it('(c) a user WITH roles.create cannot attach a permission to a system role', async () => {
    // Cashier is seeded with zero permissions, so roleAuthor "holding" none of
    // Cashier's grants is not the reason this fails — the is_system_role
    // guard is. Prove that by attaching a permission roleAuthor DOES hold.
    const { error } = await fixture.roleAuthor.client.from('role_permissions').insert({
      role_id: fixture.cashierRoleId,
      permission_id: await permissionId('roles.create'),
    })
    expect(error).not.toBeNull()
  })

  it('(d) a user with roles.assign cannot assign a role richer than their own grants (cannot hand out Owner)', async () => {
    const ownerRoleResult = await pool.query(`select id from public.roles where slug = 'owner'`)
    const puppet = await createTestUser()

    const { error } = await fixture.roleAssigner.client.from('user_roles').insert({
      user_id: puppet.userId,
      role_id: ownerRoleResult.rows[0].id,
      organization_id: fixture.organizationId,
    })
    expect(error).not.toBeNull()
  })

  it('control: a user with roles.assign CAN assign a role that is a subset of their own grants', async () => {
    // roleAssigner holds inventory.view + roles.assign. A role granting only
    // inventory.view is therefore assignable by them.
    const suffix = randomUUID().slice(0, 8)
    const { data: role } = await fixture.owner.client
      .from('roles')
      .insert({
        name: `Inventory Viewer ${suffix}`,
        slug: `inventory-viewer-${suffix}`,
        is_system_role: false,
        created_by: fixture.owner.userId,
      })
      .select('id')
      .single()
    await fixture.owner.client
      .from('role_permissions')
      .insert({ role_id: role!.id, permission_id: await permissionId('inventory.view') })

    const assignee = await createTestUser()
    const { error } = await fixture.roleAssigner.client.from('user_roles').insert({
      user_id: assignee.userId,
      role_id: role!.id,
      organization_id: fixture.organizationId,
    })
    expect(error).toBeNull()
  })

  it('a system role cannot be edited, and a custom role cannot be promoted into one', async () => {
    const { error: editSystemRole } = await fixture.owner.client
      .from('roles')
      .update({ description: 'tampered' })
      .eq('id', fixture.cashierRoleId)
      .select()
    expect(editSystemRole).toBeNull() // no error, but...

    const unchanged = await pool.query(`select description from public.roles where id = $1`, [
      fixture.cashierRoleId,
    ])
    // ...zero rows matched (RLS's USING clause filtered it out), so the
    // description is untouched. This is RLS's normal "silent no-op" shape,
    // not a policy bug — asserting the row itself is what actually proves it.
    expect(unchanged.rows[0].description).not.toBe('tampered')

    const suffix = randomUUID().slice(0, 8)
    const { data: customRole } = await fixture.owner.client
      .from('roles')
      .insert({
        name: `Promotable ${suffix}`,
        slug: `promotable-${suffix}`,
        is_system_role: false,
        created_by: fixture.owner.userId,
      })
      .select('id')
      .single()

    await fixture.owner.client
      .from('roles')
      .update({ is_system_role: true })
      .eq('id', customRole!.id)
      .select()

    const stillCustom = await pool.query(
      `select is_system_role from public.roles where id = $1`,
      [customRole!.id],
    )
    expect(stillCustom.rows[0].is_system_role).toBe(false)
  })
})
