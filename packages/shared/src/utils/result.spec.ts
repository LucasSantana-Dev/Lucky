/**
 * Unit tests for Result utility functions
 */

import { describe, it, expect } from '@jest/globals'
import {
    createSuccess,
    createFailure,
    isSuccess,
    isFailure,
    map,
    mapError,
    flatMap,
    getOrElse,
    getOrThrow,
} from './result'

describe('Result Utilities', () => {
    describe('createSuccess', () => {
        it('should create a success result', () => {
            const result = createSuccess('test data')
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data).toBe('test data')
            }
        })
    })

    describe('createFailure', () => {
        it('should create a failure result', () => {
            const result = createFailure('error message')
            expect(result.success).toBe(false)
            if (!result.success) {
                expect(result.error).toBe('error message')
            }
        })
    })

    describe('isSuccess', () => {
        it('should return true for success results', () => {
            const success = createSuccess('data')
            expect(isSuccess(success)).toBe(true)
        })

        it('should return false for failure results', () => {
            const failure = createFailure('error')
            expect(isSuccess(failure)).toBe(false)
        })
    })

    describe('isFailure', () => {
        it('should return true for failure results', () => {
            const failure = createFailure('error')
            expect(isFailure(failure)).toBe(true)
        })

        it('should return false for success results', () => {
            const success = createSuccess('data')
            expect(isFailure(success)).toBe(false)
        })
    })

    describe('map', () => {
        it('should transform success data', () => {
            const result = createSuccess(5)
            const mapped = map(result, x => x * 2)
            expect(mapped.success).toBe(true)
            if (mapped.success) {
                expect(mapped.data).toBe(10)
            }
        })

        it('should preserve failure state', () => {
            const result = createFailure('error')
            const mapped = map(result, x => x * 2)
            expect(mapped.success).toBe(false)
        })
    })

    describe('mapError', () => {
        it('should transform error in failure results', () => {
            const result = createFailure('original error')
            const mapped = mapError(result, err => `Modified: ${err}`)
            expect(mapped.success).toBe(false)
            if (!mapped.success) {
                expect(mapped.error).toBe('Modified: original error')
            }
        })

        it('should preserve success state', () => {
            const result = createSuccess('data')
            const mapped = mapError(result, err => `Modified: ${err}`)
            expect(mapped.success).toBe(true)
        })
    })

    describe('flatMap', () => {
        it('should chain success results', () => {
            const result = createSuccess(5)
            const chained = flatMap(result, x => createSuccess(x * 2))
            expect(chained.success).toBe(true)
            if (chained.success) {
                expect(chained.data).toBe(10)
            }
        })

        it('should chain failure results', () => {
            const result = createSuccess(5)
            const chained = flatMap(result, _x => createFailure('chained error'))
            expect(chained.success).toBe(false)
            if (!chained.success) {
                expect(chained.error).toBe('chained error')
            }
        })
    })

    describe('getOrElse', () => {
        it('should return data for success results', () => {
            const result = createSuccess('success data')
            expect(getOrElse(result, 'default')).toBe('success data')
        })

        it('should return default for failure results', () => {
            const result = createFailure('error')
            expect(getOrElse(result, 'default')).toBe('default')
        })
    })

    describe('getOrThrow', () => {
        it('should return data for success results', () => {
            const result = createSuccess('success data')
            expect(getOrThrow(result)).toBe('success data')
        })

        it('should throw error for failure results', () => {
            const result = createFailure('error message')
            expect(() => getOrThrow(result)).toThrow('error message')
        })
    })
})
