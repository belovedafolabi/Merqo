-- The bucket behind the branding editor's logo upload — the write path
-- 20260822211911_alter_organizations_add_branding.sql deferred to this
-- milestone ("branding's logo_url is a bare text URL — its own upload flow is
-- Milestone 11's scope", per 20260823101300's header).
--
-- Path convention, extending docs/TAS.md §35's:
--   organizations/{organization_id}/branding/{filename}
-- so segment 2 is the organization id and segment 3 is the asset kind. The
-- kind segment is not decoration: it is matched in every policy below, so a
-- future organization-level asset with different access rules gets its own
-- folder and its own policies rather than inheriting these by accident.
--
-- PUBLIC, unlike product-images. Deliberate, and the one meaningful
-- difference from that bucket:
--   - The logo renders in <BrandStyle>/AdminSidebar on essentially every
--     page, and those are cached Server Components. A signed URL would cost a
--     round trip per render AND expire inside the cache, serving a broken
--     image some time after the page was generated.
--   - It is printed on customer receipts, which are shown to people who have
--     no session at all.
--   - A logo is, by construction, the least secret thing an organization
--     owns — it is on the storefront.
-- Reads being public does not weaken writes: the three mutation policies
-- below are gated exactly as tightly as product-images', on
-- `organizations.update`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-assets',
  'organization-assets',
  true,
  524288, -- 512 KiB, matching LOGO_MAX_BYTES in lib/branding/schemas.ts
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- file_size_limit and allowed_mime_types on the bucket row are the THIRD
-- enforcement layer, under the client-side check in
-- components/settings/logo-upload-field.tsx and the server-side size + MIME +
-- magic-byte check in lib/branding/mutations.ts. Storage enforces them even
-- for a caller who skips both, which is the only reason the app-side checks
-- can be about giving a good error message rather than about safety.
--
-- SVG is absent from the list on purpose: an SVG is a script-bearing
-- document, and this bucket is publicly readable.

-- Scope resolves from the organization id in path segment 2 — no join
-- needed, since branding is organization-level (Milestone 11's Future
-- Considerations: "the branding editor here operates at the organization
-- level only"). `objects.name` is qualified for the same reason
-- 20260823101300 qualifies it. A path that doesn't match the convention
-- fails the ::uuid cast and is therefore denied.
create policy organization_assets_storage_select on storage.objects
  for select
  using (
    bucket_id = 'organization-assets'
    and (storage.foldername(objects.name))[3] = 'branding'
    and public.user_has_org_access(((storage.foldername(objects.name))[2])::uuid)
  );

-- Kept even though the bucket is public: `public` governs the unauthenticated
-- CDN path, while this policy governs authenticated API listing/reads. Without
-- it, a signed-in user could enumerate another organization's asset folder
-- through the Storage API.

create policy organization_assets_storage_insert on storage.objects
  for insert
  with check (
    bucket_id = 'organization-assets'
    and (storage.foldername(objects.name))[3] = 'branding'
    and public.user_has_permission(
      'organizations.update',
      ((storage.foldername(objects.name))[2])::uuid
    )
  );

create policy organization_assets_storage_update on storage.objects
  for update
  using (
    bucket_id = 'organization-assets'
    and (storage.foldername(objects.name))[3] = 'branding'
    and public.user_has_permission(
      'organizations.update',
      ((storage.foldername(objects.name))[2])::uuid
    )
  )
  with check (
    bucket_id = 'organization-assets'
    and (storage.foldername(objects.name))[3] = 'branding'
    and public.user_has_permission(
      'organizations.update',
      ((storage.foldername(objects.name))[2])::uuid
    )
  );

-- Delete is granted on the same permission because replacing a logo deletes
-- the previous object (lib/branding/mutations.ts), so upload and cleanup are
-- one user action and splitting their permissions would leave orphans behind.
create policy organization_assets_storage_delete on storage.objects
  for delete
  using (
    bucket_id = 'organization-assets'
    and (storage.foldername(objects.name))[3] = 'branding'
    and public.user_has_permission(
      'organizations.update',
      ((storage.foldername(objects.name))[2])::uuid
    )
  );
