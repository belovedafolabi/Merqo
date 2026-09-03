'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleHelp } from 'lucide-react'
import 'driver.js/dist/driver.css'

import { Button } from '@/components/ui/button'
import { useSidebarOptional } from '@/components/ui/sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import { completeTourAction } from '@/app/(app)/tour-actions'
import { ADMIN_TOUR_STEPS, POS_TOUR_STEPS, type TourStep } from '@/components/tour/steps'

const SEEN_KEY = 'merqo.tour.seen'

/** Enough steps to count as a real tour — below this we assume targets failed
 *  to resolve and don't burn the user's one-time run. */
const MIN_REAL_STEPS = 2

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The in-app product tour (driver.js). On the ADMIN shell it auto-starts once
 * for a user whose users.tour_completed_at is null (passed in as `autoStart`);
 * on the POS it never auto-starts.
 *
 * RESPONSIVE. On a phone the Admin nav lives in a Radix Sheet that is closed
 * until the hamburger is tapped, so every sidebar/nav step's target is absent
 * from the DOM when the tour builds its step list. Before building steps we
 * open that Sheet (useSidebarOptional().setOpenMobile) and wait for it to
 * mount, then close it again when the tour ends. Step `side` also flips from
 * the desktop `right` to `over` on a narrow screen, where a right-anchored
 * popover would spill off-screen.
 */
export function ProductTour({ area, autoStart }: { area: 'admin' | 'pos'; autoStart: boolean }) {
  const [running, setRunning] = useState(false)
  const startedRef = useRef(false)
  const sidebar = useSidebarOptional()
  const isMobile = useIsMobile()
  const autoStartEnabled = autoStart && area === 'admin'

  const markDone = useCallback(() => {
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      // private mode / storage disabled — the server flag still covers it
    }
    void completeTourAction()
  }, [])

  const start = useCallback(async () => {
    if (startedRef.current) return
    startedRef.current = true
    setRunning(true)

    // On a phone, the Admin nav is inside a closed Sheet — open it so its
    // steps have targets, and remember we did so we can close it after.
    const openedMobileNav = area === 'admin' && isMobile && !!sidebar && !sidebar.openMobile
    if (openedMobileNav) {
      sidebar!.setOpenMobile(true)
      await sleep(350)
    }

    const { driver } = await import('driver.js')

    const source: TourStep[] =
      area === 'pos' ? POS_TOUR_STEPS : [...ADMIN_TOUR_STEPS, ...POS_TOUR_STEPS]
    const steps = source
      .filter((step) => document.querySelector(step.selector))
      .map((step) => ({
        element: step.selector,
        popover: {
          title: step.title,
          description: step.body,
          // A right-anchored popover has nowhere to go on a 375px screen;
          // bottom is the one side that always fits.
          side: isMobile ? ('bottom' as const) : (step.side ?? 'bottom'),
          align: 'start' as const,
        },
      }))

    const finish = () => {
      startedRef.current = false
      setRunning(false)
      if (openedMobileNav) sidebar!.setOpenMobile(false)
    }

    if (steps.length === 0) {
      finish()
      return
    }

    const d = driver({
      showProgress: true,
      allowClose: true,
      overlayOpacity: 0.6,
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Done',
      popoverClass: 'merqo-tour',
      steps,
      onDestroyed: () => {
        finish()
        // Don't burn the one-time tour on a degenerate run (targets missing).
        if (steps.length >= MIN_REAL_STEPS) markDone()
      },
    })
    d.drive()
  }, [area, isMobile, sidebar, markDone])

  useEffect(() => {
    if (!autoStartEnabled) return
    let seen = false
    try {
      seen = localStorage.getItem(SEEN_KEY) === '1'
    } catch {
      seen = false
    }
    if (seen) return
    // Let the page settle so every target is mounted before we highlight it.
    const timer = window.setTimeout(() => void start(), 900)
    return () => window.clearTimeout(timer)
  }, [autoStartEnabled, start])

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        startedRef.current = false
        void start()
      }}
      disabled={running}
      className="fixed bottom-4 left-4 z-40 gap-1.5 rounded-full shadow-md"
    >
      <CircleHelp className="size-4" />
      Take a tour
    </Button>
  )
}
