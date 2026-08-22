// vitest-axe@0.1.0 ships its own type augmentation for an older Vitest
// version (`declare global { namespace Vi { ... } }`), which the installed
// Vitest 4's `declare module 'vitest' { interface Assertion... }` pattern
// doesn't pick up — the runtime matcher (registered by
// `vitest-axe/extend-expect` in vitest.setup.ts) works regardless; this
// just gives TypeScript the matching declaration.
import 'vitest'

declare module 'vitest' {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): T
  }
}

export {}
