export default function Home() {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Merqo</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Point of sale, inventory and reporting for your business — on the till, the shop floor and
        the back office.
      </p>
      <a
        href="/sign-in"
        className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Sign in
      </a>
    </main>
  )
}
