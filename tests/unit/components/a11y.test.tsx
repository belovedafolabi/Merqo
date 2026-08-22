import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/states/empty-state'
import { DataTable } from '@/components/ui/data-table'
import { Package } from 'lucide-react'

/**
 * Automated axe-core checks on the shared component set
 * (docs/milestones/04-design-system-and-app-shell.md Testing Requirements:
 * "Component tests: shared components... meet accessibility basics").
 * These render each component in isolation, in its default state — full
 * shell-level a11y (landmarks, focus order across the whole page) is
 * covered by the Playwright responsive checks instead.
 */
describe('shared component accessibility', () => {
  it('Button has no violations', async () => {
    const { container } = render(<Button>Save</Button>)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('Badge has no violations', async () => {
    const { container } = render(<Badge>New</Badge>)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('Alert has no violations', async () => {
    const { container } = render(
      <Alert>
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>Something to know.</AlertDescription>
      </Alert>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('a labeled input has no violations', async () => {
    const { container } = render(
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" />
      </div>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('Card + StatCard have no violations', async () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Sales today</CardTitle>
        </CardHeader>
        <CardContent>
          <StatCard
            label="Sales today"
            value="₦0"
            delta={{ label: '0% vs. yesterday', direction: 'up', positive: true }}
          />
        </CardContent>
      </Card>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('EmptyState has no violations', async () => {
    const { container } = render(
      <EmptyState
        icon={Package}
        title="No products yet"
        description="Create your first product."
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('an empty DataTable (empty-state branch) has no violations', async () => {
    const { container } = render(
      <DataTable
        columns={[{ header: 'Name', cell: () => null }]}
        rows={[]}
        getRowKey={() => ''}
        emptyState={<EmptyState icon={Package} title="No rows yet" />}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('a populated DataTable has no violations', async () => {
    const { container } = render(
      <DataTable
        columns={[{ header: 'Name', cell: (row: { name: string }) => row.name }]}
        rows={[{ name: 'Coca-Cola' }]}
        getRowKey={(row) => row.name}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
