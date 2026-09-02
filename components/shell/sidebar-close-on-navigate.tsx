'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

import { useSidebar } from '@/components/ui/sidebar'

/**
 * Closes the mobile sidebar Sheet whenever the route changes.
 *
 * The Sheet (components/ui/sidebar.tsx's `isMobile` branch) only dismissed
 * on overlay-click/Esc — tapping a nav item, the account footer link, or the
 * business-structure link navigated with the menu still covering the screen.
 * A single pathname effect here closes it for every in-sheet link at once,
 * rather than wiring an onClick into each `<Link>`. No-op on desktop
 * (`setOpenMobile` only drives the mobile state) and on first mount
 * (`openMobile` starts false).
 */
export function SidebarCloseOnNavigate() {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()

  useEffect(() => {
    setOpenMobile(false)
  }, [pathname, setOpenMobile])

  return null
}
