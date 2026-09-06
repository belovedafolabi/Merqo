'use client'

import * as React from 'react'
import { EyeIcon, EyeOffIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

/**
 * A password field with a show/hide toggle. Drop-in for `<Input type="password">`
 * — forwards every input prop (name, id, autoComplete, required, defaultValue,
 * value/onChange, maxLength, disabled, …); `type` is owned here and flips
 * between `password` and `text`.
 *
 * The toggle is `type="button"` so it never submits the form, carries a state
 * label ("Show password" / "Hide password") + `aria-pressed`, and stays
 * keyboard-reachable. Reveal resets to hidden whenever the field is disabled.
 */
function PasswordInput({
  className,
  disabled,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'type'>) {
  const [visible, setVisible] = React.useState(false)
  const shown = visible && !disabled

  return (
    <div className="relative">
      <Input
        {...props}
        type={shown ? 'text' : 'password'}
        disabled={disabled}
        className={cn('pr-10', className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        tabIndex={disabled ? -1 : 0}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
      >
        {shown ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  )
}

export { PasswordInput }
