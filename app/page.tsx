import { cn } from '@/lib/utils'

export default function Home() {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Merqo</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Project foundation is running. The design system and application shell arrive in Milestone
        04.
      </p>
      <a href="/api/health" className="text-sm underline underline-offset-4 hover:no-underline">
        Check /api/health
      </a>
    </main>
  )
}
