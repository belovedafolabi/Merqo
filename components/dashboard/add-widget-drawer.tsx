'use client'

import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'

import { toggleDashboardWidgetAction } from '@/app/(app)/dashboard/actions'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Switch } from '@/components/ui/switch'
import type { ResolvedWidget } from '@/lib/dashboard/layout'

/**
 * The "Add widget" control — a real button now, opening a bottom sheet that
 * lists every widget the user may show with a per-widget toggle. Was a
 * decorative <Button> with no onClick since Milestone 04.
 *
 * Bottom drawer on every viewport (docs/UXUI_Design_System_Specification.md's
 * pattern for a "pick from a list" surface that isn't a full page): it is a
 * quick in-and-out, and a right-side drawer would fight the sidebar on
 * desktop.
 */
export function AddWidgetDrawer({ widgets }: { widgets: ResolvedWidget[] }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  // Optimistic: the switch flips immediately and the server revalidation
  // brings the dashboard grid in behind it.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})

  function toggle(widgetId: string, next: boolean) {
    setOverrides((current) => ({ ...current, [widgetId]: next }))
    const formData = new FormData()
    formData.set('widgetId', widgetId)
    formData.set('enabled', String(next))
    startTransition(async () => {
      const result = await toggleDashboardWidgetAction({ error: null }, formData)
      if (result.error) {
        setOverrides((current) => ({ ...current, [widgetId]: !next }))
        toast.error(result.error)
      }
    })
  }

  return (
    <Drawer open={open} onOpenChange={setOpen} direction="bottom">
      <Button size="sm" className="rounded-full" onClick={() => setOpen(true)}>
        <Plus /> Add widget
      </Button>
      <DrawerContent className="max-h-[75vh]">
        <DrawerHeader>
          <DrawerTitle>Dashboard widgets</DrawerTitle>
          <DrawerDescription>
            Choose which cards appear on your Overview. Changes are saved to your account.
          </DrawerDescription>
        </DrawerHeader>

        <ul className="flex flex-col gap-1 overflow-y-auto px-4 pb-4">
          {widgets.map((widget) => {
            const enabled = overrides[widget.id] ?? widget.enabled
            return (
              <li
                key={widget.id}
                className="flex items-center justify-between gap-4 rounded-lg px-2 py-3 hover:bg-accent"
              >
                <label htmlFor={`widget-${widget.id}`} className="flex min-w-0 flex-col">
                  <span className="text-body-sm font-medium">{widget.label}</span>
                  <span className="text-caption text-muted-foreground">{widget.description}</span>
                </label>
                <Switch
                  id={`widget-${widget.id}`}
                  checked={enabled}
                  disabled={pending}
                  onCheckedChange={(next) => toggle(widget.id, next)}
                  aria-label={`Show the ${widget.label} widget`}
                />
              </li>
            )
          })}
        </ul>

        <div className="px-4 pb-safe-b">
          <DrawerClose asChild>
            <Button variant="outline" className="w-full">
              Done
            </Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
