import { notFound } from 'next/navigation'
import { Package } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatCard } from '@/components/ui/stat-card'
import { DataTable } from '@/components/ui/data-table'
import { EmptyState } from '@/components/states/empty-state'
import { CardSkeleton, ListSkeleton, TableSkeleton } from '@/components/states/skeletons'

const COLOR_SWATCHES = [
  'background',
  'foreground',
  'card',
  'primary',
  'secondary',
  'muted',
  'accent',
  'destructive',
  'success',
  'warning',
  'info',
  'border',
  'sidebar',
  'sidebar-accent',
] as const

const TYPE_SCALE = [
  ['display', 'text-display'],
  ['h1', 'text-h1'],
  ['h2', 'text-h2'],
  ['h3', 'text-h3'],
  ['h4', 'text-h4'],
  ['body', 'text-body'],
  ['body-sm', 'text-body-sm'],
  ['caption', 'text-caption'],
  ['label', 'text-label'],
] as const

/**
 * Dev-only component/token catalog — this milestone's Definition of Done:
 * "a markdown component catalog is sufficient" (Storybook explicitly
 * skipped as unnecessary infrastructure cost). Living documentation for
 * every later milestone's screens: what tokens and components already
 * exist, so none of them invents new base styles
 * (docs/milestones/04-design-system-and-app-shell.md Functional
 * Requirements).
 */
export default function StyleGuidePage() {
  if (process.env.NODE_ENV === 'production') notFound()

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 p-8">
      <div>
        <h1 className="text-h1 font-semibold">Merqo style guide</h1>
        <p className="text-body-sm text-muted-foreground">
          Dev-only catalog of design tokens and shared components — see
          docs/milestones/04-design-system-and-app-shell.md.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-h3 font-semibold">Colors</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {COLOR_SWATCHES.map((name) => (
            <div key={name} className="flex flex-col gap-1.5">
              {/* Inline style, not a dynamic `bg-${name}` class: Tailwind's
                  scanner only generates utilities it sees as literal
                  strings, so an interpolated class name would silently
                  produce no CSS for names not already used verbatim
                  elsewhere. Reads the raw `--name` variable (the one
                  actually defined in :root/.dark), not the `--color-name`
                  alias — app/globals.css's `@theme inline` block only
                  *inlines* those into generated utility classes (bg-primary,
                  text-success, …), it doesn't also materialize them as
                  separate real custom properties on :root. */}
              <div
                className="h-14 rounded-lg border"
                style={{ backgroundColor: `var(--${name})` }}
              />
              <span className="text-caption text-muted-foreground">{name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h3 font-semibold">Typography</h2>
        <div className="flex flex-col gap-3">
          {TYPE_SCALE.map(([name, className]) => (
            <div key={name} className="flex items-baseline gap-4">
              <span className="w-20 shrink-0 text-caption text-muted-foreground">{name}</span>
              <span className={className}>The quick brown fox jumps over the lazy dog</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h3 font-semibold">Buttons</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button className="rounded-full">Pill</Button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h3 font-semibold">Badges</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h3 font-semibold">Form controls</h2>
        <div className="flex max-w-sm flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="example-input">Label</Label>
            <Input id="example-input" placeholder="Placeholder…" />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="example-checkbox" />
            <Label htmlFor="example-checkbox">Checkbox</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="example-switch" />
            <Label htmlFor="example-switch">Switch</Label>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h3 font-semibold">Alerts</h2>
        <Alert>
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>A neutral, informational alert.</AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>A destructive/error alert.</AlertDescription>
        </Alert>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h3 font-semibold">Tabs</h2>
        <Tabs defaultValue="one" className="max-w-sm">
          <TabsList>
            <TabsTrigger value="one">One</TabsTrigger>
            <TabsTrigger value="two">Two</TabsTrigger>
          </TabsList>
          <TabsContent value="one">First tab content.</TabsContent>
          <TabsContent value="two">Second tab content.</TabsContent>
        </Tabs>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h3 font-semibold">Stat cards</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Sales today"
            value="₦1.2m"
            delta={{ label: '12% vs. yesterday', direction: 'up', positive: true }}
            tone="inverted"
          />
          <StatCard
            label="Transactions"
            value="184"
            delta={{ label: '4% vs. yesterday', direction: 'down', positive: false }}
          />
          <StatCard
            label="Average sale"
            value="₦6,521"
            delta={{ label: '2% vs. yesterday', direction: 'up', positive: true }}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h3 font-semibold">Data table + empty state</h2>
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Products</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { header: 'Product', cell: () => null },
                { header: 'Price', cell: () => null },
              ]}
              rows={[]}
              getRowKey={() => ''}
              emptyState={
                <EmptyState
                  icon={Package}
                  title="No products yet"
                  description="Create your first product to start selling."
                />
              }
            />
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h3 font-semibold">Loading skeletons</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <CardSkeleton />
          <div className="rounded-lg border p-4">
            <TableSkeleton rows={3} columns={3} />
          </div>
          <div className="rounded-lg border p-4">
            <ListSkeleton items={3} />
          </div>
        </div>
      </section>
    </div>
  )
}
