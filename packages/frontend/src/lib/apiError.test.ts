import { describe, test, expect } from 'vitest'
import { ApiError } from '@/services/ApiError'
import { getApiErrorMessage } from './apiError'

describe('getApiErrorMessage', () => {
    test('keeps a message of exactly 200 chars on the 499 boundary', () => {
        const message = 'a'.repeat(200)
        expect(getApiErrorMessage(new ApiError(499, message), 'G')).toBe(
            message,
        )
    })

    test('returns the message of a 4xx ApiError', () => {
        expect(
            getApiErrorMessage(new ApiError(403, 'Missing permission'), 'x'),
        ).toBe('Missing permission')
    })

    test('uses the fallback for a plain Error', () => {
        expect(getApiErrorMessage(new Error('timeout of 10000ms'), 'G')).toBe(
            'G',
        )
    })

    test('uses the fallback for a 5xx ApiError', () => {
        expect(getApiErrorMessage(new ApiError(502, 'Bad gateway'), 'G')).toBe(
            'G',
        )
    })

    test('uses the fallback for status 0 ApiError', () => {
        expect(
            getApiErrorMessage(new ApiError(0, 'Unable to connect'), 'G'),
        ).toBe('G')
    })

    test('uses the fallback for an empty 4xx message', () => {
        expect(getApiErrorMessage(new ApiError(400, ''), 'G')).toBe('G')
    })

    test('uses the fallback for an over-long message', () => {
        expect(
            getApiErrorMessage(new ApiError(400, 'a'.repeat(201)), 'G'),
        ).toBe('G')
    })

    test('falls back for non-error values', () => {
        expect(getApiErrorMessage('boom', 'G')).toBe('G')
        expect(getApiErrorMessage(undefined, 'G')).toBe('G')
    })
})
