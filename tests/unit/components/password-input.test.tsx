import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { PasswordInput } from '@/components/ui/password-input'

afterEach(cleanup)

/**
 * The show/hide toggle added post-Milestone-17. It must forward every input
 * prop, own only `type`, and never submit the form it sits in.
 */
describe('PasswordInput', () => {
  it('starts masked and forwards input props', () => {
    render(<PasswordInput name="password" required defaultValue="hunter2" aria-label="Password" />)
    const input = screen.getByLabelText('Password') as HTMLInputElement
    expect(input.type).toBe('password')
    expect(input.name).toBe('password')
    expect(input.required).toBe(true)
    expect(input.value).toBe('hunter2')
  })

  it('the toggle reveals and re-masks, updating its label and aria-pressed', () => {
    render(<PasswordInput name="password" aria-label="Password" />)
    const input = screen.getByLabelText('Password') as HTMLInputElement
    const toggle = screen.getByRole('button', { name: 'Show password' })

    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    expect(input.type).toBe('text')
    expect(screen.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')).toBe(
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(input.type).toBe('password')
  })

  it('the toggle is type="button" so it cannot submit a form', () => {
    render(<PasswordInput name="password" aria-label="Password" />)
    expect(screen.getByRole('button').getAttribute('type')).toBe('button')
  })

  it('a disabled field keeps the value masked and the toggle inert', () => {
    render(<PasswordInput name="password" aria-label="Password" defaultValue="x" disabled />)
    const input = screen.getByLabelText('Password') as HTMLInputElement
    const toggle = screen.getByRole('button')
    fireEvent.click(toggle)
    expect(input.type).toBe('password')
    expect(toggle).toBeDisabled()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <>
        <label htmlFor="pw">Password</label>
        <PasswordInput id="pw" name="password" />
      </>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
