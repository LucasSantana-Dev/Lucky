import 'vitest'
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

// @testing-library/jest-dom 7 augments vitest's Assertion with a single type
// parameter. Vitest 5 changed it to Assertion<R, T>, so declare it here.
declare module 'vitest' {
    interface Assertion<R extends void | Promise<void> = void, T = unknown>
        extends TestingLibraryMatchers<any, R> {}
    interface AsymmetricMatchersContaining
        extends TestingLibraryMatchers<any, any> {}
}
