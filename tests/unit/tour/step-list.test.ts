import { describe, expect, it, vi } from 'vitest'

import { buildStepList } from '@/components/tour/tour-step-list'

/**
 * Milestone 17 Part D. The jump list injected into the driver.js popover:
 * one entry per (already-filtered) step, the active one marked, and clicking
 * entry N calls moveTo(N). On mobile it collapses into a <details>.
 */

const steps = [{ title: 'Dashboard' }, { title: 'Sales' }, { title: 'Reports' }]

function items(el: HTMLElement): HTMLButtonElement[] {
  return [...el.querySelectorAll<HTMLButtonElement>('.merqo-tour-steps__item')]
}

describe('buildStepList', () => {
  it('renders one entry per step, in order', () => {
    const el = buildStepList(steps, 0, () => {}, false)
    expect(items(el).map((i) => i.textContent)).toEqual(['1. Dashboard', '2. Sales', '3. Reports'])
  })

  it('marks only the active entry with aria-current="step"', () => {
    const el = buildStepList(steps, 1, () => {}, false)
    expect(items(el).map((i) => i.getAttribute('aria-current'))).toEqual([null, 'step', null])
    expect(items(el).map((i) => i.classList.contains('is-active'))).toEqual([false, true, false])
  })

  it('calls onJump with the clicked entry index', () => {
    const onJump = vi.fn()
    const list = items(buildStepList(steps, 0, onJump, false))

    list[2]?.click()
    expect(onJump).toHaveBeenCalledWith(2)

    list[0]?.click()
    expect(onJump).toHaveBeenLastCalledWith(0)
  })

  it('wraps the list in a collapsed <details> on mobile', () => {
    const el = buildStepList(steps, 0, () => {}, true)
    expect(el.tagName).toBe('DETAILS')
    expect(el.hasAttribute('open')).toBe(false)
    expect(el.querySelector('summary')?.textContent).toBe('Jump to a step')
    expect(items(el)).toHaveLength(3)
  })

  it('is a bare list (no disclosure) on desktop', () => {
    const el = buildStepList(steps, 0, () => {}, false)
    expect(el.tagName).toBe('DIV')
    expect(el.classList.contains('merqo-tour-steps')).toBe(true)
  })
})
