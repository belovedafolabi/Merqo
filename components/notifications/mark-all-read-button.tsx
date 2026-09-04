'use client'

import { useActionState } from 'react'
import { CheckCheck } from 'lucide-react'

import { markAllReadAction, type NotificationActionState } from '@/app/(app)/notifications/actions'
import { useActionToast } from '@/hooks/use-action-toast'
import { Button } from '@/components/ui/button'

const initialState: NotificationActionState = { error: null }

export function MarkAllReadButton({
  organizationId,
  disabled,
}: {
  organizationId: string
  disabled: boolean
}) {
  const [state, formAction, pending] = useActionState(markAllReadAction, initialState)
  useActionToast(state, pending, {
    loading: 'Marking all as read…',
    success: 'All notifications marked read',
  })

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
