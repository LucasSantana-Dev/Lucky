import { describe, test, expect } from 'vitest'
import { ApiError } from './ApiError'

describe('ApiError', () => {
    test('should create with status and message', () => {
        const err = new ApiError(404, 'Not found')
        expect(err.status).toBe(404)
        expect(err.message).toBe('Not found')
        expect(err.name).toBe('ApiError')
        expect(err).toBeInstanceOf(Error)
    })

    test('should store details', () => {
        const details = [{ field: 'name', message: 'required' }]
        const err = new ApiError(400, 'Validation failed', details)
        expect(err.details).toEqual(details)
    })

    test('should default details to undefined', () => {
        const err = new ApiError(500, 'Server error')
        expect(err.details).toBeUndefined()
    })

    describe('status helpers', () => {
        test('isValidation returns true for 400', () => {
            expect(new ApiError(400, 'bad').isValidation).toBe(true)
            expect(new ApiError(401, 'bad').isValidation).toBe(false)
        })

        test('isUnauthorized returns true for 401', () => {
            expect(new ApiError(401, 'unauth').isUnauthorized).toBe(true)
            expect(new ApiError(403, 'forbidden').isUnauthorized).toBe(false)
        })

        test('isForbidden returns true for 403', () => {
            expect(new ApiError(403, 'forbidden').isForbidden).toBe(true)
            expect(new ApiError(404, 'not found').isForbidden).toBe(false)
        })

        test('isNotFound returns true for 404', () => {
            expect(new ApiError(404, 'not found').isNotFound).toBe(true)
            expect(new ApiError(500, 'error').isNotFound).toBe(false)
        })
    })
})
