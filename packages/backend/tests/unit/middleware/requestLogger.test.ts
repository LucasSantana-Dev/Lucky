import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import type { Request, Response, NextFunction } from 'express'

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    warnLog: jest.fn(),
    errorLog: jest.fn(),
}))

import { requestLogger } from '../../../src/middleware/requestLogger'
import { infoLog, warnLog, errorLog } from '@lucky/shared/utils'

function makeReq(path: string, overrides: Partial<Request> = {}): Request {
    return {
        path,
        method: 'GET',
        originalUrl: path,
        requestId: 'req-1',
        ...overrides,
    } as unknown as Request
}

function makeRes(statusCode = 200): {
    res: Response
    emit: (event: string) => void
} {
    const listeners: Record<string, Array<() => void>> = {}
    const res = {
        statusCode,
        on: jest.fn((event: string, cb: () => void) => {
            listeners[event] = listeners[event] ?? []
            listeners[event].push(cb)
        }),
    } as unknown as Response
    return { res, emit: (event) => listeners[event]?.forEach((fn) => fn()) }
}

describe('requestLogger', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test.each(['/health', '/health/live', '/metrics', '/favicon.ico'])(
        'skips logging for %s',
        (path) => {
            const next = jest.fn() as unknown as NextFunction
            const { res } = makeRes()
            requestLogger(makeReq(path), res, next)
            expect(next).toHaveBeenCalledTimes(1)
            expect(res.on).not.toHaveBeenCalled()
        },
    )

    test('logs info for 2xx responses', () => {
        const next = jest.fn() as unknown as NextFunction
        const { res, emit } = makeRes(200)
        requestLogger(makeReq('/api/data'), res, next)
        emit('finish')
        expect(infoLog).toHaveBeenCalled()
        expect(warnLog).not.toHaveBeenCalled()
        expect(errorLog).not.toHaveBeenCalled()
    })

    test('logs warn for 4xx responses', () => {
        const next = jest.fn() as unknown as NextFunction
        const { res, emit } = makeRes(404)
        requestLogger(makeReq('/api/missing'), res, next)
        emit('finish')
        expect(warnLog).toHaveBeenCalled()
    })

    test('logs error for 5xx responses', () => {
        const next = jest.fn() as unknown as NextFunction
        const { res, emit } = makeRes(500)
        requestLogger(makeReq('/api/fail'), res, next)
        emit('finish')
        expect(errorLog).toHaveBeenCalled()
    })
})
