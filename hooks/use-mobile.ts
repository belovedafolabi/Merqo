import * as React from 'react'

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // Lazy initializer (not a setState call in the effect body below) so the
  // initial value is computed once, synchronously, without the "impure
  // during render" / "setState in effect" purity violations the project's
  // eslint config enforces. `typeof window` guards the SSR pass, matching
  // this hook's original SSR-then-correct-on-mount behavior.
  const [isMobile, setIsMobile] = React.useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT,
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
