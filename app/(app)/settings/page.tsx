import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Bell, Building2, Palette, Receipt } from 'lucide-react'

import { getOnboardingState } from '@/lib/business-structure/queries'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const SECTIONS = [
  {
    href: '/settings/organization',
    icon: Building2,
    title: 'Organization',
    description: 'Contact details and address printed on receipts and reports.',
  },
  {
    href: '/settings/branding',
    icon: Palette,
    title: 'Branding',
    description: 'Brand name, colors, and logo — shown across the Admin Dashboard and POS.',
  },
  {
    href: '/settings/receipts',
    icon: Receipt,
    title: 'Receipts',
    description: 'Choose a receipt layout and what it shows.',
  },
  {
    href: '/settings/notifications',
    icon: Bell,
    title: 'Notifications',
    description: 'Choose which alerts reach you in-app or by email.',
  },
]

export default async function SettingsOverviewPage() {
  const onboardingState = await getOnboardingState()
  if (!onboardingState.organizationId) redirect('/sign-in')

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {SECTIONS.map((section) => (
        <Link key={section.href} href={section.href}>
          <Card className="h-full transition-colors hover:bg-accent/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <section.icon className="size-4" />
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </div>
              <CardTitle className="mt-2">{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-body-sm text-muted-foreground">{section.description}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}
