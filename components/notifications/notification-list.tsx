'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Bell, Check } from 'lucide-react'

import { markReadAction, type NotificationActionState } from '@/app/(app)/notifications/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { EmptyState } from '@/components/states/empty-state'
import type { NotificationSummary } from '@/lib/notifications/queries'

const initialState: NotificationActionState = { error: null }

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diffMs = Date.now() - then
  const diffMin = Math.round(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  return `${diffDay}d ago`
}

function MarkReadButton({ notificationId }: { notificationId: string }) {
  const [, formAction, pending] = useActionState(markReadAction, initialState)

  return (
    <form
      action={(formData) => {
        formData.set('notificationId', notificationId)
        formAction(formData)
      }}
    >
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? 'Marking…' : 'Mark read'}
      </Button>
    </form>
  )
}

/**
 * The inbox table. `href` is only ever rendered when it starts with "/" —
 * notification content is system-generated (see the Security Requirement in
 * docs/milestones/12-notifications-and-communications.md and
 * notifications_select_self's RLS scoping), but this still validates at
 * render rather than trusting the stored string outright.
 */
export function NotificationList({ notifications }: { notifications: NotificationSummary[] }) {
  const columns: DataTableColumn<NotificationSummary>[] = [
    {
      header: '',
      className: 'w-6',
      cell: (row) =>
        row.readAt === null ? (
          <span aria-hidden="true" className="block size-2 rounded-full bg-primary" />
        ) : null,
    },
    {
      header: 'Notification',
      cell: (row) => {
        const body = (
          <div className="flex flex-col gap-0.5">
            <span className={row.readAt === null ? 'font-semibold' : 'font-medium'}>
              {row.title}
            </span>
            <span className="text-body-sm text-muted-foreground">{row.message}</span>
          </div>
        )
        return row.href && row.href.startsWith('/') ? (
          <Link href={row.href} className="hover:underline">
            {body}
          </Link>
        ) : (
          body
        )
      },
    },
    {
      header: 'Category',
      cell: (row) => (
        <Badge variant="outline" className="capitalize">
          {row.category}
        </Badge>
      ),
    },
    {
      header: 'When',
      className: 'text-muted-foreground',
      cell: (row) => formatRelativeTime(row.createdAt),
    },
    {
      header: '',
      className: 'text-right',
      cell: (row) =>
        row.readAt === null ? (
          <MarkReadButton notificationId={row.id} />
        ) : (
          <span className="inline-flex items-center gap-1 text-body-sm text-muted-foreground">
            <Check className="size-3.5" /> Read
          </span>
        ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={notifications}
      getRowKey={(row) => row.id}
      emptyState={
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="Low-stock alerts and account changes will show up here."
        />
      }
    />
  )
}
