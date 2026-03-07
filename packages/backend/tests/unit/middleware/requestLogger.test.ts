import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { EventEmitter } from 'events'
import { requestLogger } from '../../../src/middleware/requestLogger'

jest.mock('@nexus/shared/utils', () => ({
    infoLog: jest.fn(),
    warnLog: jest.fn(),
    errorLog: jest.fn(),
}))

import { infoLog, warnLog, errorLog } from '@nexus/shared/utils'

function createRes(statusCode: number) {
    const emitter = new EventEmitter()
    return Object.assign(emitter, { statusCode }) as any
}

describe('requestLogger', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('should call next immediately', () => {
        const req = { method: 'GET', originalUrl: '/test' } as any
        const res = createRes(200)
        const next = jest.fn()

        requestLogger(req, res, next)

        expect(next).toHaveBeenCalledTimes(1)
    })

    test('should log info for 2xx responses', () => {
        const req = { method: 'GET', originalUrl: '/api/health' } as any
        const res = createRes(200)
        const next = jest.fn()

        requestLogger(req, res, next)
        res.emit('finish')

        expect(infoLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('GET /api/health 200'),
            }),
        )
        expect(warnLog).not.toHaveBeenCalled()
        expect(errorLog).not.toHaveBeenCalled()
    })

    test('should log warn for 4xx responses', () => {
        const req = { method: 'POST', originalUrl: '/api/data' } as any
        const res = createRes(404)
        const next = jest.fn()

        requestLogger(req, res, next)
        res.emit('finish')

        expect(warnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('POST /api/data 404'),
            }),
        )
        expect(infoLog).not.toHaveBeenCalled()
        expect(errorLog).not.toHaveBeenCalled()
    })

    test('should log error for 5xx responses', () => {
        const req = {
            method: 'DELETE',
            originalUrl: '/api/resource',
        } as any
        const res = createRes(500)
        const next = jest.fn()

        requestLogger(req, res, next)
        res.emit('finish')

        expect(errorLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('DELETE /api/resource 500'),
            }),
        )
        expect(infoLog).not.toHaveBeenCalled()
        expect(warnLog).not.toHaveBeenCalled()
    })

    test('should include duration in log message', () => {
        const req = { method: 'GET', originalUrl: '/' } as any
        const res = createRes(200)
        const next = jest.fn()

        requestLogger(req, res, next)
        res.emit('finish')

        expect(infoLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringMatching(/GET \/ 200 \d+ms/),
            }),
        )
    })
})
