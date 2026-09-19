'use client'

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

/**
 * Theme is passed in by the caller (see components/ui/themed-toaster.tsx),
 * which mirrors the Admin shell's resolved light/dark. `next-themes` was never
 * wired (no ThemeProvider), so `useTheme()` here always returned 'system'.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        // Loading toasts (background work — "Signing you in…", "Uploading
        // logo…") get a shimmering title via `.merqo-toast-loading` in
        // app/globals.css. Falls back to plain text under prefers-reduced-motion.
        classNames: { loading: 'merqo-toast-loading' },
      }}
      {...props}
    />
  )
}

export { Toaster }
