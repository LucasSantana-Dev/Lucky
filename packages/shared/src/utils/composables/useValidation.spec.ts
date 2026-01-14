/**
 * Unit tests for validation utilities
 */

import { describe, it, expect } from '@jest/globals'
import {
    validateRequired,
    validateLength,
    validateUrl,
    validateNumber,
    validateRange,
    validateGuildId,
    validateUserId,
} from './useValidation'

describe('Validation Utilities', () => {
    describe('validateRequired', () => {
        it('should return success for valid strings', () => {
            const result = validateRequired('hello', 'name')
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data).toBe('hello')
            }
        })

        it('should trim whitespace', () => {
            const result = validateRequired('  hello  ', 'name')
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data).toBe('hello')
            }
        })

        it('should return failure for empty strings', () => {
            const result = validateRequired('', 'name')
            expect(result.success).toBe(false)
            if (!result.success) {
                expect(result.error.message).toBe('name is required')
            }
        })

        it('should return failure for whitespace-only strings', () => {
            const result = validateRequired('   ', 'name')
            expect(result.success).toBe(false)
            if (!result.success) {
                expect(result.error.message).toBe('name is required')
            }
        })

        it('should return failure for non-strings', () => {
            expect(validateRequired(123, 'name').success).toBe(false)
            expect(validateRequired(null, 'name').success).toBe(false)
            expect(validateRequired(undefined, 'name').success).toBe(false)
            expect(validateRequired({}, 'name').success).toBe(false)
        })
    })

    describe('validateLength', () => {
        it('should return success for valid length', () => {
            const result = validateLength('hello', 3, 10, 'name')
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data).toBe('hello')
            }
        })

        it('should return failure for too short', () => {
            const result = validateLength('hi', 3, 10, 'name')
            expect(result.success).toBe(false)
            if (!result.success) {
                expect(result.error.message).toBe('name must be at least 3 characters')
            }
        })

        it('should return failure for too long', () => {
            const result = validateLength('very long string', 3, 10, 'name')
            expect(result.success).toBe(false)
            if (!result.success) {
                expect(result.error.message).toBe('name must be no more than 10 characters')
            }
        })
    })

    describe('validateUrl', () => {
        it('should return success for valid URLs', () => {
            const result = validateUrl('https://example.com', 'url')
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data).toBe('https://example.com')
            }
        })

        it('should return failure for invalid URLs', () => {
            const result = validateUrl('not-a-url', 'url')
            expect(result.success).toBe(false)
            if (!result.success) {
                expect(result.error.message).toBe('url must be a valid URL')
            }
        })
    })

    describe('validateNumber', () => {
        it('should return success for valid numbers', () => {
            const result = validateNumber(123, 'age')
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data).toBe(123)
            }
        })

        it('should handle string numbers', () => {
            const result = validateNumber('123', 'age')
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data).toBe(123)
            }
        })

        it('should return failure for invalid numbers', () => {
            const result = validateNumber('abc', 'age')
            expect(result.success).toBe(false)
            if (!result.success) {
                expect(result.error.message).toBe('age must be a valid number')
            }
        })
    })

    describe('validateRange', () => {
        it('should return success for values in range', () => {
            const result = validateRange(5, 1, 10, 'score')
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data).toBe(5)
            }
        })

        it('should return failure for values below range', () => {
            const result = validateRange(0, 1, 10, 'score')
            expect(result.success).toBe(false)
            if (!result.success) {
                expect(result.error.message).toBe('score must be between 1 and 10')
            }
        })

        it('should return failure for values above range', () => {
            const result = validateRange(11, 1, 10, 'score')
            expect(result.success).toBe(false)
            if (!result.success) {
                expect(result.error.message).toBe('score must be between 1 and 10')
            }
        })
    })

    describe('validateGuildId', () => {
        it('should return success for valid guild IDs', () => {
            const result = validateGuildId('123456789012345678')
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data).toBe('123456789012345678')
            }
        })

        it('should return failure for invalid guild IDs', () => {
            expect(validateGuildId('123').success).toBe(false)
            expect(validateGuildId('abc123').success).toBe(false)
            expect(validateGuildId('').success).toBe(false)
        })
    })

    describe('validateUserId', () => {
        it('should return success for valid user IDs', () => {
            const result = validateUserId('123456789012345678')
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data).toBe('123456789012345678')
            }
        })

        it('should return failure for invalid user IDs', () => {
            expect(validateUserId('123').success).toBe(false)
            expect(validateUserId('abc123').success).toBe(false)
            expect(validateUserId('').success).toBe(false)
        })
    })
})
