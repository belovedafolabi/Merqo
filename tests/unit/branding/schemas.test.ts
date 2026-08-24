import { describe, expect, it } from 'vitest'

import {
  LOGO_MAX_BYTES,
  brandingSettingsSchema,
  hexColorSchema,
  sniffLogoMimeType,
} from '@/lib/branding/schemas'

describe('hexColorSchema', () => {
  it('accepts #rrggbb, case-insensitively', () => {
    expect(hexColorSchema.safeParse('#059669').success).toBe(true)
    expect(hexColorSchema.safeParse('#FFAA00').success).toBe(true)
  })

  it('rejects shorthand, missing hash, and non-hex characters', () => {
    expect(hexColorSchema.safeParse('#fff').success).toBe(false)
    expect(hexColorSchema.safeParse('059669').success).toBe(false)
    expect(hexColorSchema.safeParse('#gggggg').success).toBe(false)
  })
})

describe('brandingSettingsSchema', () => {
  it('treats blank fields as absent rather than empty strings', () => {
    const result = brandingSettingsSchema.parse({
      brandName: '',
      primaryColor: '',
      secondaryColor: '',
    })
    expect(result).toEqual({ brandName: undefined, primaryColor: null, secondaryColor: null })
  })
})

/** Minimal valid signatures for each format — enough bytes to satisfy sniffLogoMimeType. */
function pngBytes(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])
}
function jpegBytes(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0])
}
function webpBytes(): Uint8Array {
  // RIFF????WEBP
  return new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
}

describe('sniffLogoMimeType — the third enforcement layer, defeating a spoofed Content-Type', () => {
  it('identifies PNG, JPEG, and WebP by their actual file signature', () => {
    expect(sniffLogoMimeType(pngBytes())).toBe('image/png')
    expect(sniffLogoMimeType(jpegBytes())).toBe('image/jpeg')
    expect(sniffLogoMimeType(webpBytes())).toBe('image/webp')
  })

  it('rejects a RIFF container that is not actually WEBP (the tag at byte 8 must also match)', () => {
    const notWebp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20]) // "AVI "
    expect(sniffLogoMimeType(notWebp)).toBeNull()
  })

  it('rejects an executable with a spoofed extension/MIME — the actual attack this exists to stop', () => {
    // MZ header (Windows PE/EXE)
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])
    expect(sniffLogoMimeType(exe)).toBeNull()
  })

  it('rejects an empty or too-short buffer', () => {
    expect(sniffLogoMimeType(new Uint8Array())).toBeNull()
    expect(sniffLogoMimeType(new Uint8Array([0x89, 0x50]))).toBeNull()
  })
})

describe('LOGO_MAX_BYTES', () => {
  it('matches the 512 KiB the organization-assets bucket enforces', () => {
    expect(LOGO_MAX_BYTES).toBe(512 * 1024)
  })
})
