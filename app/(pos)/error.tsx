'use client'

import { RouteError } from '@/components/states/route-error'

export default function PosError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteError error={error} reset={reset} />
}
