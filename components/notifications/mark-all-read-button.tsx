'use client'

import { useActionState } from 'react'
import { CheckCheck } from 'lucide-react'

import { markAllReadAction, type NotificationActionState } from '@/app/(app)/notifications/actions'
import { Button } from '@/components/ui/button'

const initialState: NotificationActionState = { error: null }

export function MarkAllReadButton({
  organizationId,
  disabled,
}: {
  organizationId: string
  disabled: boolean
}) {
  const [, formAction, pending] = useActionState(markAllReadAction, initialState)

  return (
    <form
      action={(formData) => {
        formData.set('organizationId', organizationId)
        formAction(formData)
      }}
    >
      <Button type="submit" variant="outline" size="sm" disabled={disabled || pending}>
        <CheckCheck />
        {pending ? 'Marking…' : 'Mark all as read'}
      </Button>
    </form>
  )
}
