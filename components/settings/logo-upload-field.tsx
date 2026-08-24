'use client'

import { useActionState, useRef, useState } from 'react'
import { TriangleAlert, Upload, X } from 'lucide-react'

import {
  removeLogoAction,
  uploadLogoAction,
  type SettingsActionState,
} from '@/app/(app)/settings/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { LOGO_MAX_BYTES, LOGO_MIME_TYPES } from '@/lib/branding/schemas'

const initialState: SettingsActionState = { error: null }

/**
 * Logo upload — the repo's first Storage write UI. Client-side checks here
 * are a fast error message only; the real enforcement is three layers deep
 * on the server (size/MIME re-check, magic-byte sniff, bucket-level
 * file_size_limit/allowed_mime_types — see lib/branding/mutations.ts and
 * 20260824091100_create_organization_assets_storage_bucket.sql).
 */
export function LogoUploadField({
  organizationId,
  currentLogoUrl,
}: {
  organizationId: string
  currentLogoUrl: string | null
}) {
  const [uploadState, uploadAction, uploadPending] = useActionState(uploadLogoAction, initialState)
  const [removeState, removeAction, removePending] = useActionState(removeLogoAction, initialState)
  const [clientError, setClientError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const logoUrl = uploadState.logoUrl ?? currentLogoUrl
  const error = clientError ?? uploadState.error ?? removeState.error

  function validateAndSubmit(file: File) {
    setClientError(null)

    if (!LOGO_MIME_TYPES.includes(file.type as (typeof LOGO_MIME_TYPES)[number])) {
      setClientError('Logo must be a PNG, JPEG, or WebP image.')
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      setClientError(`Logo must be ${Math.floor(LOGO_MAX_BYTES / 1024)} KB or smaller.`)
      return
    }

    const formData = new FormData()
    formData.set('organizationId', organizationId)
    formData.set('logo', file)
    uploadAction(formData)
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive" role="alert">
          <TriangleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-4">
        <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Organization logo" className="size-full object-contain" />
          ) : (
            <Upload className="size-5 text-muted-foreground" />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={LOGO_MIME_TYPES.join(',')}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) validateAndSubmit(file)
                event.target.value = ''
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadPending}
              onClick={() => inputRef.current?.click()}
            >
              {uploadPending ? 'Uploading…' : logoUrl ? 'Replace' : 'Upload logo'}
            </Button>
            {logoUrl && (
              <form
                action={(formData) => {
                  formData.set('organizationId', organizationId)
                  removeAction(formData)
                }}
              >
                <Button type="submit" variant="outline" size="sm" disabled={removePending}>
                  <X /> Remove
                </Button>
              </form>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            PNG, JPEG, or WebP. Up to {Math.floor(LOGO_MAX_BYTES / 1024)} KB.
          </p>
        </div>
      </div>
    </div>
  )
}
