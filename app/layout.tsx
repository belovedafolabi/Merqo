import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'

// Inter — docs/UXUI_Design_System_Specification.md §6 ("A strong default
// would be Inter, with system fallbacks"). Mapped to Tailwind's `font-sans`
// via `--font-sans` in app/globals.css, so `font-sans`/the `body` base style
// pick it up everywhere without every component reaching for the font
// directly.
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Merqo',
  description: 'A configurable, multi-business-type Point-of-Sale platform.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  )
}
