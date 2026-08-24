import { z } from 'zod'

/**
 * Shared client/server validation for the branding editor.
 * lib/branding/mutations.ts parses against these before touching the
 * database; organizations_update RLS (20260822093700) is the last line, not
 * the first.
 */

/** `#rrggbb` only — the shape lib/branding/contrast.ts's hexToRgb() expects. */
export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-f]{6}$/i, 'Enter a color as #rrggbb.')

/**
 * A color field the form may legitimately submit blank (the color picker's
 * text input, cleared by hand) — `''` is normalized to `null` BEFORE the hex
 * regex runs, not after. `.nullish()` alone only special-cases `null`/
 * `undefined`; an empty string is neither, so without this transform step it
 * would reach hexColorSchema's regex and fail validation instead of clearing
 * the color back to the resolver's default.
 */
const optionalHexColorSchema = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value ? value : null))
  .pipe(z.union([z.null(), hexColorSchema]))

export const brandingSettingsSchema = z.object({
  brandName: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value ? value : undefined)),
  primaryColor: optionalHexColorSchema,
  secondaryColor: optionalHexColorSchema,
})
export type BrandingSettingsInput = z.infer<typeof brandingSettingsSchema>

/**
 * 512 KiB — matches organization-assets' bucket-level `file_size_limit`
 * (20260824091100_create_organization_assets_storage_bucket.sql). Kept as one
 * named constant imported by both the client-side dropzone and the bucket
 * migration's own comment, rather than two numbers that have to be kept in
 * sync by memory.
 */
export const LOGO_MAX_BYTES = 512 * 1024

export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type LogoMimeType = (typeof LOGO_MIME_TYPES)[number]

/**
 * File-signature ("magic bytes") check — the third and final layer after the
 * client's <input accept> and the server's declared Content-Type, neither of
 * which can be trusted: a renamed executable can claim to be
 * `image/png` just by setting the header. Checking the file's actual first
 * bytes is what a spoofed MIME type cannot get past.
 */
const MAGIC_BYTES: Record<LogoMimeType, readonly number[]> = {
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/jpeg': [0xff, 0xd8, 0xff],
  // RIFF????WEBP — bytes 0-3 are "RIFF", 8-11 are "WEBP"; bytes 4-7 are a
  // file-size field, not a signature, so they're skipped rather than matched.
  'image/webp': [0x52, 0x49, 0x46, 0x46],
}

export function sniffLogoMimeType(bytes: Uint8Array): LogoMimeType | null {
  for (const [mime, signature] of Object.entries(MAGIC_BYTES) as [LogoMimeType, readonly number[]][]) {
    if (signature.every((byte, index) => bytes[index] === byte)) {
      if (mime === 'image/webp') {
        const webpTag = [0x57, 0x45, 0x42, 0x50] // "WEBP"
        if (!webpTag.every((byte, index) => bytes[8 + index] === byte)) continue
      }
      return mime
    }
  }
  return null
}
