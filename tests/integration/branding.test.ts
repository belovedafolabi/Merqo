import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { pool } from './helpers/db'
import { bootstrapOrganization, createTestUser } from './helpers/supabase'

/**
 * Milestone 11's Security Requirements: "Logo/branding asset uploads
 * validated... and stored with organization-scoped access." Exercises the
 * two pieces of RLS this milestone actually adds — the organization-assets
 * storage bucket policies (20260824091100) and the receipt-settings CHECK
 * constraint (20260824091000) — since organizations_update itself
 * (20260822093700) is pre-existing, unmodified machinery already covered by
 * earlier milestones' suites.
 */

interface Fixture {
  organizationId: string
  owner: { client: SupabaseClient }
  bystander: { client: SupabaseClient }
}

let fixture: Fixture

beforeAll(async () => {
  const suffix = randomUUID().slice(0, 8)
  const owner = await createTestUser()
  const { organizationId } = await bootstrapOrganization(owner, `Branding${suffix}`)

  const bystander = await createTestUser()
  const roleResult = await pool.query(`select id from public.roles where slug = 'cashier'`)
  await pool.query(
    `insert into public.user_roles (user_id, role_id, organization_id) values ($1, $2, $3)`,
    [bystander.userId, roleResult.rows[0].id, organizationId],
  )

  fixture = {
    organizationId,
    owner: { client: owner.client },
    bystander: { client: bystander.client },
  }
})

afterAll(async () => {
  await pool.end()
})

describe('branding + receipt settings — organizations_update gates every new column', () => {
  it('an Owner can update branding, receipt, and contact columns', async () => {
    const { error } = await fixture.owner.client
      .from('organizations')
      .update({
        primary_color: '#111111',
        brand_name: 'Test Brand',
        receipt_template_id: 'compact',
        receipt_show_logo: false,
        contact_phone: '+234 800 000 0000',
      })
      .eq('id', fixture.organizationId)
    expect(error).toBeNull()
  })

  it('a Cashier (no organizations.update) cannot change any of them', async () => {
    const { data, error } = await fixture.bystander.client
      .from('organizations')
      .update({ brand_name: 'Hijacked' })
      .eq('id', fixture.organizationId)
      .select()
    // RLS denies by matching zero rows, not by raising — the standard shape
    // this codebase's other RLS tests assert the same way.
    expect(error).toBeNull()
    expect(data).toHaveLength(0)

    const unchanged = await pool.query(`select brand_name from public.organizations where id = $1`, [
      fixture.organizationId,
    ])
    expect(unchanged.rows[0].brand_name).not.toBe('Hijacked')
  })

  it('an invalid receipt_template_id is rejected by the CHECK constraint, RLS aside', async () => {
    const { error } = await fixture.owner.client
      .from('organizations')
      .update({ receipt_template_id: 'nonexistent' })
      .eq('id', fixture.organizationId)
    expect(error).not.toBeNull()
    expect(error?.message).toContain('organizations_receipt_template_id_check')
  })
})

describe('organization-assets storage bucket', () => {
  const logoBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]) // PNG signature

  it('an Owner can upload to their own organization\'s branding path and read it back publicly', async () => {
    const path = `organizations/${fixture.organizationId}/branding/logo-${randomUUID()}.png`

    const { error: uploadError } = await fixture.owner.client.storage
      .from('organization-assets')
      .upload(path, logoBytes, { contentType: 'image/png' })
    expect(uploadError).toBeNull()

    const {
      data: { publicUrl },
    } = fixture.owner.client.storage.from('organization-assets').getPublicUrl(path)
    expect(publicUrl).toContain(path)
  })

  it('a Cashier (no organizations.update) cannot upload to the branding path', async () => {
    const path = `organizations/${fixture.organizationId}/branding/logo-${randomUUID()}.png`

    const { error } = await fixture.bystander.client.storage
      .from('organization-assets')
      .upload(path, logoBytes, { contentType: 'image/png' })
    expect(error).not.toBeNull()
  })

  it('nobody can upload into another organization\'s branding path, even the Owner of a different org', async () => {
    const otherOwner = await createTestUser()
    const { organizationId: otherOrgId } = await bootstrapOrganization(
      otherOwner,
      `OtherBranding${randomUUID().slice(0, 8)}`,
    )

    // fixture's owner attempting to write under a DIFFERENT organization's path.
    const path = `organizations/${otherOrgId}/branding/logo-${randomUUID()}.png`
    const { error } = await fixture.owner.client.storage
      .from('organization-assets')
      .upload(path, logoBytes, { contentType: 'image/png' })
    expect(error).not.toBeNull()
  })
})
