import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { errorHandler } from '../../../src/middleware/errorHandler'
import { AppError } from '../../../src/errors/AppError'

jest.mock('@lukbot/shared/utils', () => ({
    errorLog: jest.fn(),
}))

import { errorLog } from '@lukbot/shared/utils'

function createReq(method = 'GET', url = '/test') {
    return { method, originalUrl: url } as any
}

function createRes() {
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
    } as any
    return res
}

describe('errorHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('should handle AppError with correct status and message', () => {
        const err = AppError.badRequest('Invalid input')
        const res = createRes()

        errorHandler(err, createReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith({
            error: 'Invalid input',
        })
        expect(errorLog).not.toHaveBeenCalled()
    })

    test('should include details when present on AppError', () => {
        const details = [{ field: 'name', message: 'required' }]
        const err = AppError.badRequest('Validation failed', details)
        const res = createRes()

        errorHandler(err, createReq(), res, jest.fn())

        expect(res.json).toHaveBeenCalledWith({
            error: 'Validation failed',
            details,
        })
    })

    test('should handle 401 unauthorized', () => {
        const err = AppError.unauthorized()
        const res = createRes()

        errorHandler(err, createReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(401)
        expect(res.json).toHaveBeenCalledWith({
            error: 'Not authenticated',
        })
    })

    test('should handle 403 forbidden', () => {
        const err = AppError.forbidden('Admin only')
        const res = createRes()

        errorHandler(err, createReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(403)
        expect(res.json).toHaveBeenCalledWith({
            error: 'Admin only',
        })
    })

    test('should handle 404 not found', () => {
        const err = AppError.notFound('Guild not found')
        const res = createRes()

        errorHandler(err, createReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(404)
        expect(res.json).toHaveBeenCalledWith({
            error: 'Guild not found',
        })
    })

    test('should return 500 for unknown errors', () => {
        const err = new Error('Something broke')
        const res = createRes()

        errorHandler(err, createReq('POST', '/api/data'), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(500)
        expect(res.json).toHaveBeenCalledWith({
            error: 'Internal server error',
        })
    })

    test('should log unknown errors with request context', () => {
        const err = new Error('DB connection failed')
        const res = createRes()

        errorHandler(err, createReq('PUT', '/api/guilds/123'), res, jest.fn())

        expect(errorLog).toHaveBeenCalledWith({
            message: 'Unhandled error on PUT /api/guilds/123:',
            error: err,
        })
    })

    test('should not leak internal error details to client', () => {
        const err = new Error('SELECT * FROM users failed: ECONNREFUSED')
        const res = createRes()

        errorHandler(err, createReq(), res, jest.fn())

        const jsonCall = res.json.mock.calls[0][0]
        expect(jsonCall.error).toBe('Internal server error')
        expect(JSON.stringify(jsonCall)).not.toContain('ECONNREFUSED')
    })
})

describe('AppError', () => {
    test('should create with custom status code', () => {
        const err = new AppError(429, 'Too many requests')
        expect(err.statusCode).toBe(429)
        expect(err.message).toBe('Too many requests')
        expect(err.name).toBe('AppError')
    })

    test('should be instanceof Error', () => {
        const err = AppError.badRequest('test')
        expect(err).toBeInstanceOf(Error)
        expect(err).toBeInstanceOf(AppError)
    })

    test('should store details', () => {
        const details = { field: 'email' }
        const err = AppError.badRequest('Invalid', details)
        expect(err.details).toEqual(details)
    })

    test('should default notFound message', () => {
        const err = AppError.notFound()
        expect(err.message).toBe('Not found')
    })

    test('should default unauthorized message', () => {
        const err = AppError.unauthorized()
        expect(err.message).toBe('Not authenticated')
    })
})
