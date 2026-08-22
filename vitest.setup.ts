import '@testing-library/jest-dom/vitest'

// vitest-axe@0.1.0's own `vitest-axe/extend-expect` entrypoint ships an
// empty compiled file (a packaging bug in that release) — the real
// `toHaveNoViolations` matcher lives in `vitest-axe/matchers`, so it's
// registered directly here instead. See types/vitest-axe.d.ts for the
// matching type augmentation this package also fails to provide correctly
// against the installed Vitest version.
import { expect } from 'vitest'
import * as axeMatchers from 'vitest-axe/matchers'

expect.extend(axeMatchers)
