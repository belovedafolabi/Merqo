'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleHelp } from 'lucide-react'
import 'driver.js/dist/driver.css'

import { Button } from '@/components/ui/button'
import { completeTourAction } from '@/app/(app)/tour-actions'
import { ADMIN_TOUR_STEPS, POS_TOUR_STEPS, type TourStep } from '@/components/tour/steps'

const SEEN_KEY = 'merqo.tour.seen'

/**
 * The in-app product tour (driver.js). On the ADMIN shell it auto-starts
 * once for a user whose users.tour_completed_at is null (passed in as
 * `autoStart`); on the POS it never auto-starts — the till is speed-first
 * (docs/UXUI_Design_System_Specification.md §16/§33) and a modal overlay the
 * instant a cashier opens it to serve someone would be exactly the wrong
 * thing. Both shells keep the floating "Take a tour" button for on-demand
 * replay.
 *
 * Which steps show is decided at run time by whether each step's target
 * element is on the page, so the POS track drops its admin steps and vice
 * versa. `area` only picks the ordering of the candidate list.
 */
export function ProductTour({ area, autoStart }: { area: 'admin' | 'pos'; autoStart: boolean }) {
  const [running, setRunning] = useState(false)
  const startedRef = useRef(false)
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
          side: step.side ?? 'bottom',
          align: 'start' as const,
        },
      }))

    if (steps.length === 0) {
      startedRef.current = false
      setRunning(false)
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
        startedRef.current = false
        setRunning(false)
        markDone()
      },
    })
    d.drive()
  }, [area, markDone])

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
