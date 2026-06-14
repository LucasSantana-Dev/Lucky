import { describe, test, expect, jest } from '@jest/globals'
import type { Request, Response } from 'express'
import { requestId } from '../../../src/middleware/requestId'

function createReq(headerValue?: string): Request {
    return {
        get: (name: string) =>
            name.toLowerCase() === 'x-request-id' ? headerValue : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
}

function createRes(): Response & { headers: Record<string, string> } {
    const headers: Record<string, string> = {}
    return {
        headers,
        setHeader: (name: string, value: string) => {
            headers[name] = value
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
}

describe('requestId middleware', () => {
    test('mints an id when no inbound header is present', () => {
        const req = createReq()
        const res = createRes()
        const next = jest.fn()

        requestId(req, res, next)

        expect(req.requestId).toMatch(/^[A-Za-z0-9_-]{8}$/)
        expect(res.headers['X-Request-Id']).toBe(req.requestId)
        expect(next).toHaveBeenCalledTimes(1)
    })

    test('honours a valid inbound X-Request-Id', () => {
        const req = createReq('abc-DEF_123')
        const res = createRes()
        const next = jest.fn()

        requestId(req, res, next)

        expect(req.requestId).toBe('abc-DEF_123')
        expect(res.headers['X-Request-Id']).toBe('abc-DEF_123')
    })

    test('mints a fresh id when the inbound header has unsafe characters', () => {
        // A newline would let an attacker inject forged log lines.
        const req = createReq('evil\ninjected')
        const res = createRes()
        const next = jest.fn()

        requestId(req, res, next)

        expect(req.requestId).not.toBe('evil\ninjected')
        expect(req.requestId).toMatch(/^[A-Za-z0-9_-]{8}$/)
    })

    test('mints a fresh id when the inbound header is over 64 chars', () => {
        const req = createReq('a'.repeat(65))
        const res = createRes()
        const next = jest.fn()

        requestId(req, res, next)

        expect(req.requestId).toMatch(/^[A-Za-z0-9_-]{8}$/)
    })

    test('mints a fresh id when the inbound header is empty', () => {
        const req = createReq('')
        const res = createRes()
        const next = jest.fn()

        requestId(req, res, next)

        expect(req.requestId).toMatch(/^[A-Za-z0-9_-]{8}$/)
    })
})
