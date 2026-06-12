/**
 * Unit tests for Result utility functions
 */

import { describe, it, expect, jest } from '@jest/globals'
import { createSuccess, createFailure, isSuccess, isFailure } from './result'

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
})
