import { Bolt, TriangleAlert } from 'lucide-react'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { WizardProgress, type WizardStep } from '@/components/onboarding/wizard-progress'

/**
 * The onboarding wizard's floating card shell — same visual language as
 * components/auth/auth-card.tsx (brand icon, shadow-elevated card on the
 * Admin shell's dark canvas backdrop) but wider, since a Business Type grid
 * and a capability/POS-config form need more room than a sign-in field.
 */
export function OnboardingShell({
  title,
  description,
  steps,
  currentStepIndex,
  error,
  children,
}: {
  title: string
  description?: string
  steps: WizardStep[]
  currentStepIndex: number
  error?: string | null
  children: React.ReactNode
}) {
  return (
    <Card className="w-full max-w-2xl gap-6 shadow-elevated">
      <CardHeader className="gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Bolt className="size-5" />
          </span>
          <div>
            <h1 className="text-h4 leading-none font-semibold">{title}</h1>
            {description && (
              <p className="mt-1 text-body-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        <WizardProgress steps={steps} currentIndex={currentStepIndex} />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive" role="alert">
            <TriangleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {children}
      </CardContent>
    </Card>
  )
}
