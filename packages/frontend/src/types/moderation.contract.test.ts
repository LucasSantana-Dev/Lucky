import { describe, test, expect } from 'vitest'
// Type-only import: never bundle shared services into the frontend.
import type { ModerationCase as WireCase } from '@lucky/shared/services'
import type { ModerationCase as UiCase } from './moderation'

// JSON wire shape: Date values arrive as ISO strings.
type Jsonify<T> = {
    [K in keyof T]: T[K] extends Date
        ? string
        : T[K] extends Date | null
          ? string | null
          : T[K]
}
type Wire = Jsonify<WireCase>

// UI-only fields that the backend does not send.
type UiOnly = 'userAvatar'
type Contract = Required<Omit<UiCase, UiOnly>>

// Fails typecheck when a UI key is missing from the wire type
// (e.g. `userName` vs `username`) or the UI type is wider than the wire.
type AssertContract = {
    [K in keyof Contract]-?: K extends keyof Wire
        ? Contract[K] extends Wire[K]
            ? true
            : { incompatible: K }
        : { missingOnWire: K }
}
const contract: Record<keyof Contract, true> = {} as AssertContract

describe('moderation case response contract', () => {
    test('UI case keys are a subset of the backend wire type', () => {
        expect(contract).toBeDefined()
    })
})
