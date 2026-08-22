'use client'

import { RouteError } from '@/components/states/route-error'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="flex min-h-svh items-center justify-center bg-background text-foreground">
        <RouteError error={error} reset={reset} />
      </body>
    </html>
  )
}
