import { CheckIcon } from 'lucide-react'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

export interface WizardStep {
  label: string
}

/**
 * The onboarding wizard's step indicator (docs/milestones/
 * 05-business-structure-and-onboarding.md Frontend Changes: "multi-step form
 * flow"; UX guideline `multi-step-progress`: "show step indicator... allow
 * back navigation" — back navigation here is simply re-visiting /onboarding,
 * since every step's own page already resolves from persisted data, not
 * client-side wizard state).
 */
export function WizardProgress({
  steps,
  currentIndex,
}: {
  steps: WizardStep[]
  currentIndex: number
}) {
  const percent = ((currentIndex + 1) / steps.length) * 100

  return (
    <div className="flex flex-col gap-3">
      <Progress value={percent} />
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {steps.map((step, index) => {
          const isComplete = index < currentIndex
          const isCurrent = index === currentIndex
          return (
            <li
              key={step.label}
              className={cn(
                'flex items-center gap-1.5',
                isCurrent && 'font-medium text-foreground',
                !isCurrent && !isComplete && 'text-muted-foreground',
                isComplete && 'text-muted-foreground',
              )}
            >
              {isComplete ? (
                <CheckIcon className="size-3.5 text-primary" />
              ) : (
                <span
                  className={cn(
                    'flex size-3.5 items-center justify-center rounded-full text-[10px]',
                    isCurrent ? 'bg-primary text-primary-foreground' : 'bg-muted',
                  )}
                >
                  {index + 1}
                </span>
              )}
              {step.label}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
