import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyThemeLocally, isShellDark } from '@/lib/theme/apply-theme'

/**
 * applyThemeLocally() is the shared client-side theme choke point (nav toggle
 * + Settings → Appearance). These cover the `{ animate: true }` pop overlay —
 * that it is created inside the shell root, torn down on `animationend`, and
 * never created under `prefers-reduced-motion` — plus the plain path.
 */

const POP_ID = 'merqo-theme-pop'
let reduceMotion = false

function mockMatchMedia() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reduceMotion : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  }))
}

beforeEach(() => {
  reduceMotion = false
  mockMatchMedia()
  document.body.innerHTML = '<div data-theme-pref="light"></div>'
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const root = () => document.querySelector<HTMLElement>('[data-theme-pref]')!
const pop = () => document.getElementById(POP_ID)

describe('applyThemeLocally', () => {
  it('toggles .dark and writes the attribute + cookie (plain path)', () => {
    applyThemeLocally('dark')
    expect(root().classList.contains('dark')).toBe(true)
    expect(root().getAttribute('data-theme-pref')).toBe('dark')
    expect(document.cookie).toContain('merqo_theme=dark')
    expect(pop()).toBeNull()

    applyThemeLocally('light')
    expect(isShellDark()).toBe(false)
  })

  it('creates the pop overlay inside the shell root when animate:true', () => {
    applyThemeLocally('dark', { animate: true })

    const overlay = pop()
    expect(overlay).not.toBeNull()
    expect(overlay!.parentElement).toBe(root())
    expect(overlay!.style.animationName || overlay!.style.animation).toContain('merqo-theme-pop')
    // the theme still flipped
    expect(root().classList.contains('dark')).toBe(true)
  })

  it('removes the overlay on animationend', () => {
    applyThemeLocally('dark', { animate: true })
    expect(pop()).not.toBeNull()

    pop()!.dispatchEvent(new Event('animationend'))
    expect(pop()).toBeNull()
  })

  it('reuses one overlay across rapid toggles', () => {
    applyThemeLocally('dark', { animate: true })
    applyThemeLocally('light', { animate: true })
    expect(document.querySelectorAll(`#${POP_ID}`)).toHaveLength(1)
  })

  it('creates no overlay under prefers-reduced-motion', () => {
    reduceMotion = true
    applyThemeLocally('dark', { animate: true })

    expect(pop()).toBeNull()
    expect(root().classList.contains('dark')).toBe(true) // still swaps
  })
})
