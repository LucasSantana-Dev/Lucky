import { describe, test, expect } from 'vitest'
import { ApiError } from '@/services/ApiError'
import { getApiErrorMessage } from './apiError'

describe('getApiErrorMessage', () => {
    test('returns the message of an ApiError', () => {
        expect(
            getApiErrorMessage(new ApiError(403, 'Missing permission'), 'x'),
        ).toBe('Missing permission')
    })

    test('falls back when the error has no message', () => {
        expect(getApiErrorMessage(new Error(''), 'Generic')).toBe('Generic')
    })

    test('falls back for non-error values', () => {
        expect(getApiErrorMessage('boom', 'Generic')).toBe('Generic')
        expect(getApiErrorMessage(undefined, 'Generic')).toBe('Generic')
    })
})
