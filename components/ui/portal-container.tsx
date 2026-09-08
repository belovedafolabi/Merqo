'use client'

import { createContext, useContext, useSyncExternalStore } from 'react'

/**
 * Radix and vaul portals default to `document.body`, which sits OUTSIDE the
 * Admin shell's `.dark` wrapper (app/(app)/layout.tsx stamps `.dark` on a div,
 * not on <html>). So every dialog / drawer / sheet / menu / tooltip resolved
 * `--popover` / `--background` / `--border` from `:root` — i.e. light — while
 * the shell behind it was dark.
 *
 * This provider hands the shell's themed root down to those primitives as
 * their portal `container`, so portalled content inherits the same tokens as
 * the shell. Only the Admin shell mounts it; POS / auth / onboarding don't, so
 * their portals keep defaulting to <body> (those shells are always light and
 * unaffected).
 */
const PortalContainerContext = createContext<HTMLElement | null>(null)

const subscribe = () => () => {}
// `document.querySelector` returns the same node on every call once the shell
// has hydrated, so this snapshot is referentially stable (no useSyncExternalStore
// "getSnapshot should be cached" warning).
const getContainer = () => document.querySelector<HTMLElement>('[data-theme-pref]')
const getServerContainer = () => null

export function ThemedPortalProvider({ children }: { children: React.ReactNode }) {
  const container = useSyncExternalStore(subscribe, getContainer, getServerContainer)
  return (
    <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>
  )
}

/**
 * The themed portal container, or `undefined` when there is none (outside the
 * Admin shell) — pass straight to a Radix/vaul `Portal`'s `container` prop.
 */
export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined
}
