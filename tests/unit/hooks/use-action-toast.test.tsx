import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'

vi.mock('sonner', () => ({
  toast: {
    loading: vi.fn(() => 'toast-id'),
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { useActionToast } from '@/hooks/use-action-toast'

const mockToast = vi.mocked(toast)

/**
 * Milestone 17 Part D. Two things to prove: the settle toast fires on the
 * falling edge of `pending` (never on mount, never on a re-render that didn't
 * run the action), and the `TOAST_DELAY_MS` guard suppresses a loading toast
 * for an action that resolves under 300ms.
 */

type State = { error: string | null }
const OK: State = { error: null }

function run(initial: { state: State; pending: boolean }) {
  return renderHook(
    ({ state, pending }: { state: State; pending: boolean }) =>
      useActionToast(state, pending, { loading: 'Saving…', success: 'Saved' }),
    { initialProps: initial },
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  mockToast.loading.mockClear()
  mockToast.dismiss.mockClear()
  mockToast.success.mockClear()
  mockToast.error.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useActionToast', () => {
  it('does not toast on mount when idle', () => {
    run({ state: OK, pending: false })
    vi.advanceTimersByTime(1000)
    expect(mockToast.loading).not.toHaveBeenCalled()
    expect(mockToast.success).not.toHaveBeenCalled()
    expect(mockToast.error).not.toHaveBeenCalled()
  })

  it('fires a success toast on the falling edge of pending', () => {
    const { rerender } = run({ state: OK, pending: false })

    rerender({ state: OK, pending: true })
    expect(mockToast.success).not.toHaveBeenCalled()

    rerender({ state: OK, pending: false })
    expect(mockToast.success).toHaveBeenCalledWith('Saved')
    expect(mockToast.error).not.toHaveBeenCalled()
  })

  it('fires an error toast with the action error on failure', () => {
    const { rerender } = run({ state: OK, pending: false })
    rerender({ state: OK, pending: true })
    rerender({ state: { error: 'Name is required.' }, pending: false })

    expect(mockToast.error).toHaveBeenCalledWith('Name is required.')
    expect(mockToast.success).not.toHaveBeenCalled()
  })

  it('does not re-fire when state re-renders without another run', () => {
    const { rerender } = run({ state: OK, pending: false })
    rerender({ state: OK, pending: true })
    rerender({ state: OK, pending: false })
    mockToast.success.mockClear()

    // A fresh state object, but pending never went true again.
    rerender({ state: { error: null }, pending: false })
    expect(mockToast.success).not.toHaveBeenCalled()
  })

  it('suppresses the loading toast for an action that settles under 300ms', () => {
    const { rerender } = run({ state: OK, pending: false })

    rerender({ state: OK, pending: true })
    vi.advanceTimersByTime(200)
    rerender({ state: OK, pending: false })

    expect(mockToast.loading).not.toHaveBeenCalled()
    expect(mockToast.success).toHaveBeenCalledWith('Saved')
  })

  it('shows the loading toast once an action runs past 300ms', () => {
    const { rerender } = run({ state: OK, pending: false })

    rerender({ state: OK, pending: true })
    vi.advanceTimersByTime(350)

    expect(mockToast.loading).toHaveBeenCalledWith('Saving…')
  })
})
