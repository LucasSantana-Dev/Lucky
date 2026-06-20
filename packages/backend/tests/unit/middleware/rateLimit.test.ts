import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import type { Request, Response } from 'express'

// Override the global passthrough mock from setup.ts so we can test the real impl.
jest.unmock('../../../src/middleware/rateLimit')

jest.mock('@lucky/shared/utils/alerts', () => ({
    recordWithCooldown: jest.fn().mockReturnValue(false),
    emitAlert: jest.fn().mockImplementation(async () => {}),
}))

// Capture the options passed to express-rate-limit so we can call handler directly.
jest.mock('express-rate-limit', () => {
    const capturer = jest.fn((options: Record<string, unknown>) => {
        ;(capturer as any).__lastOptions = options
        return (_req: unknown, _res: unknown, next: () => void) => next()
    })
    return { __esModule: true, default: capturer }
})

import { maskIp } from '../../../src/middleware/rateLimit'
import { recordWithCooldown, emitAlert } from '@lucky/shared/utils/alerts'
import rateLimit from 'express-rate-limit'

function makeRes(): { res: Response; status: jest.Mock; json: jest.Mock } {
    const json = jest.fn().mockReturnThis()
    const status = jest.fn().mockReturnValue({ json })
    return { res: { status } as unknown as Response, status, json }
}

describe('maskIp', () => {
    test('masks last octet of IPv4', () => {
        expect(maskIp('192.168.1.100')).toBe('192.168.1.xxx')
    })

    test('masks last octet of another IPv4', () => {
        expect(maskIp('10.0.0.1')).toBe('10.0.0.xxx')
    })

    test('masks last 4 groups of IPv6', () => {
        expect(maskIp('2001:db8:85a3:0000:0000:8a2e:0370:7334')).toBe(
            '2001:db8:85a3:0000:xxxx:xxxx:xxxx:xxxx',
        )
    })

    test('handles IPv4-mapped IPv6 (::ffff:a.b.c.d)', () => {
        expect(maskIp('::ffff:203.0.113.8')).toBe('203.0.113.xxx')
    })

    test('handles IPv4-mapped IPv6 case-insensitive', () => {
        expect(maskIp('::FFFF:192.168.1.50')).toBe('192.168.1.xxx')
    })

    test('falls back for unknown string without throwing', () => {
        expect(() => maskIp('unknown')).not.toThrow()
    })
})

describe('authLimiter handler', () => {
    let handler: (req: Request, res: Response) => void

    beforeEach(() => {
        jest.clearAllMocks()
        ;(recordWithCooldown as jest.Mock).mockReturnValue(false)
        ;(emitAlert as jest.Mock).mockImplementation(async () => {})
        handler = (rateLimit as any).__lastOptions?.handler
    })

    test('responds 429 without emitting alert when threshold not crossed', () => {
        const req = { ip: '1.2.3.4' } as unknown as Request
        const { res, status, json } = makeRes()

        handler(req, res)

        expect(status).toHaveBeenCalledWith(429)
        expect(json).toHaveBeenCalledWith({
            error: 'Too many auth attempts, please try again later',
        })
        expect(emitAlert).not.toHaveBeenCalled()
    })

    test('emits alert with masked IP when threshold crossed', () => {
        ;(recordWithCooldown as jest.Mock).mockReturnValue(true)
        const req = { ip: '1.2.3.4' } as unknown as Request
        const { res } = makeRes()

        handler(req, res)

        expect(emitAlert).toHaveBeenCalledWith(
            expect.objectContaining({
                title: '⚠️ Auth brute-force detected',
                fields: [{ name: 'IP', value: '1.2.3.xxx' }],
            }),
        )
    })

    test('masks IPv4-mapped IPv6 in alert', () => {
        ;(recordWithCooldown as jest.Mock).mockReturnValue(true)
        const req = { ip: '::ffff:203.0.113.8' } as unknown as Request
        const { res } = makeRes()

        handler(req, res)

        expect(emitAlert).toHaveBeenCalledWith(
            expect.objectContaining({
                fields: [{ name: 'IP', value: '203.0.113.xxx' }],
            }),
        )
    })

    test('handles missing req.ip gracefully', () => {
        const req = { ip: undefined } as unknown as Request
        const { res, status } = makeRes()

        expect(() => handler(req, res)).not.toThrow()
        expect(status).toHaveBeenCalledWith(429)
    })
})
