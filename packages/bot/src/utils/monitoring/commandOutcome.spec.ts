import { describe, expect, it } from '@jest/globals'
import { classifyOutcome } from './commandOutcome'

class CustomFailure extends Error {}

describe('classifyOutcome', () => {
    it('returns ok with no signal', () => {
        expect(classifyOutcome({})).toEqual({ outcome: 'ok' })
    })

    it('returns error with constructor name for thrown errors', () => {
        expect(classifyOutcome({ error: new TypeError('x') })).toEqual({
            outcome: 'error',
            errorClass: 'TypeError',
        })
        expect(classifyOutcome({ error: new CustomFailure('x') })).toEqual({
            outcome: 'error',
            errorClass: 'CustomFailure',
        })
    })

    it('classifies non-Error throws', () => {
        expect(classifyOutcome({ error: 'boom' }).errorClass).toBe('string')
        expect(classifyOutcome({ error: { a: 1 } }).errorClass).toBe('Object')
    })

    it.each(['missing_bot_permissions'] as const)(
        'maps %s to denied',
        (reason) => {
            expect(classifyOutcome({ reason })).toEqual({ outcome: 'denied' })
        },
    )

    it.each(['feature_disabled', 'not_found'] as const)(
        'maps %s to user_error',
        (reason) => {
            expect(classifyOutcome({ reason })).toEqual({
                outcome: 'user_error',
            })
        },
    )

    it('lets a thrown error win over a stop reason', () => {
        expect(
            classifyOutcome({
                error: new Error('x'),
                reason: 'missing_bot_permissions',
            }).outcome,
        ).toBe('error')
    })

    it('treats a thrown undefined as an error', () => {
        expect(classifyOutcome({ error: undefined })).toEqual({
            outcome: 'error',
            errorClass: 'undefined',
        })
    })

    it('never classifies an unknown stop reason as ok', () => {
        expect(classifyOutcome({ reason: 'weird' as never }).outcome).toBe(
            'error',
        )
    })
})
