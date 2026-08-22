import { Bolt, TriangleAlert } from 'lucide-react'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

/**
 * Shared floating auth card — one look for sign-in/sign-up/forgot/reset,
 * consuming the same tokens as the Admin shell (shadow-elevated, rounded-xl,
 * bg-card) so auth doesn't invent its own visual language.
 */
export function AuthCard({
  title,
  error,
  children,
  footer,
}: {
  title: string
  error?: string | null
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <Card className="w-full max-w-sm gap-6 shadow-elevated">
      <CardHeader className="items-center gap-3 text-center">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Bolt className="size-5" />
        </span>
        {/* A real <h1>, not shadcn's CardTitle (a plain, non-semantic div) —
            this is page-level content: each auth screen has exactly one
            heading, and it needs an actual accessible heading role. */}
        <h1 className="text-h4 leading-none font-semibold">{title}</h1>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive" role="alert">
            <TriangleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {children}
        {footer && <div className="text-center text-body-sm text-muted-foreground">{footer}</div>}
      </CardContent>
    </Card>
  )
}
