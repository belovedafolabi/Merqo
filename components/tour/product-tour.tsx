'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleHelp } from 'lucide-react'
import 'driver.js/dist/driver.css'

import { Button } from '@/components/ui/button'
import { useSidebarOptional } from '@/components/ui/sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import { completeTourAction } from '@/app/(app)/tour-actions'
import { ADMIN_TOUR_STEPS, POS_TOUR_STEPS, type TourStep } from '@/components/tour/steps'
import { buildStepList } from '@/components/tour/tour-step-list'

const SEEN_KEY = 'merqo.tour.seen'

/** Enough steps to count as a real tour — below this we assume targets failed
 *  to resolve and don't burn the user's one-time run. */
const MIN_REAL_STEPS = 2

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Is this element actually rendered? A `display:none` element (e.g. a
 * `hidden lg:flex` cart panel on a phone) still answers `querySelector`, but
 * has no client rects — driver.js would then compute a 0×0 spotlight and drop
 * the popover in the middle of the screen pointing at nothing.
 */
function isRendered(el: Element): boolean {
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
}

/**
 * The first *rendered* match for `selector`. Several tour targets exist twice
 * in the DOM — a desktop copy hidden below `lg`, a mobile copy — and a plain
 * `querySelector` returns whichever comes first in source order, often the
 * hidden one.
 */
function firstRenderedElement(selector: string): Element | null {
  for (const el of document.querySelectorAll(selector)) {
    if (isRendered(el)) return el
  }
  return null
}

/** Polls for `selector` to be present *and rendered*, up to `timeoutMs`. */
async function waitForSelector(selector: string, timeoutMs = 1500): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (firstRenderedElement(selector)) return true
    await sleep(60)
  }
  return firstRenderedElement(selector) !== null
}

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
    // steps have targets, and remember we did so we can close it after. Poll
    // for a real nav target rather than guessing at the Sheet's mount+animate
    // time (a fixed 350ms was too short on a slow device — the nav steps got
    // filtered out and the menu looked like it never opened).
    const openedMobileNav = area === 'admin' && isMobile && !!sidebar && !sidebar.openMobile
    if (openedMobileNav) {
      sidebar!.setOpenMobile(true)
      await waitForSelector('[data-tour="business-unit-switcher"], nav a[href="/products"]')
    }

    const { driver } = await import('driver.js')

    const source: TourStep[] =
      area === 'pos' ? POS_TOUR_STEPS : [...ADMIN_TOUR_STEPS, ...POS_TOUR_STEPS]
    const steps = source
      .map((step) => ({ step, element: firstRenderedElement(step.selector) }))
      .filter((entry): entry is { step: TourStep; element: Element } => entry.element !== null)
      .map(({ step, element }) => ({
        // The resolved element, not the selector — so driver.js highlights the
        // rendered copy, not a `display:none` twin that shares the selector.
        element,
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

    const stepTitles = steps.map((step) => ({ title: step.popover.title }))

    const d = driver({
      showProgress: true,
      allowClose: true,
      overlayOpacity: 0.6,
      // Scroll an off-screen target into view before positioning the popover,
      // and do it visibly rather than jumping.
      smoothScroll: true,
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Done',
      popoverClass: 'merqo-tour',
      steps,
      // Milestone 17 Part D: a clickable list of every step in this track.
      // Appended to the popover WRAPPER (below the footer), not into the footer
      // itself — the footer is a flex row of "1 of N" + Back/Next, and adding a
      // full-width block there knocked those out of line. driver.js tears the
      // popover down between steps, so this runs fresh each render and needs no
      // manual cleanup — but listeners are attached to the new nodes every
      // time, which buildStepList does.
      onPopoverRender: (popover) => {
        // driver.js appends the popover to <body>, outside the Admin shell's
        // `.dark` wrapper, so its `var(--popover)`-based theming resolved
        // light. Mirror the shell's resolved theme onto the popover itself —
        // `.dark { --popover: … }` matches the element it is set on.
        const shellDark =
          document.querySelector('[data-theme-pref]')?.classList.contains('dark') ?? false
        popover.wrapper.classList.toggle('dark', shellDark)
        if (steps.length < MIN_REAL_STEPS) return
        popover.wrapper.appendChild(
          buildStepList(stepTitles, d.getActiveIndex() ?? 0, (index) => d.moveTo(index), isMobile),
        )
      },
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
