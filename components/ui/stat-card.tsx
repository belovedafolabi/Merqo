import { TrendingDown, TrendingUp } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export interface StatCardDelta {
  label: string
  direction: 'up' | 'down'
  /** Whether this direction is the *good* outcome for this metric — a rising cost is `direction: 'up', positive: false`. */
  positive: boolean
}

/**
 * KPI/stat card — the reference design's small metric tiles (value, trend
 * delta, optional inline sparkline). `tone="inverted"` renders the dark
 * accent-card variant the reference mixes in among the lighter ones for
 * visual rhythm; both consume the same tokens, no bespoke colors.
 */
export function StatCard({
  label,
  value,
  delta,
  tone = 'default',
  children,
  className,
}: {
  label: string
  value: string
  delta?: StatCardDelta
  tone?: 'default' | 'inverted'
  children?: React.ReactNode
  className?: string
}) {
  const DeltaIcon = delta?.direction === 'up' ? TrendingUp : TrendingDown

  return (
    <Card
      className={cn(
        'gap-3 py-5 shadow-card',
        tone === 'inverted' && 'bg-foreground text-background',
        className,
      )}
    >
      <CardHeader className="gap-1 px-5">
        <span
          className={cn(
            'text-body-sm',
            tone === 'inverted' ? 'text-background/70' : 'text-muted-foreground',
          )}
        >
          {label}
        </span>
        <span className="text-h3 font-semibold tabular-nums">{value}</span>
      </CardHeader>
      {(delta || children) && (
        <CardContent className="flex items-center justify-between gap-3 px-5">
          {delta && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-body-sm font-medium',
                delta.positive ? 'text-success' : 'text-destructive',
              )}
            >
              <DeltaIcon className="size-3.5" />
              {delta.label}
            </span>
          )}
          {children}
        </CardContent>
      )}
    </Card>
  )
}
