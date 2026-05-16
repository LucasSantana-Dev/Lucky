import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import { EventEmitter } from 'events'
import { metricsMiddleware } from '../../../src/middleware/metrics'
import {
    registry,
    httpRequestsTotal,
    httpRequestDurationSeconds,
    httpServerErrorsTotal,
} from '../../../src/utils/prometheus'

function createReq(
    overrides: Partial<{
        method: string
        route: { path: string } | undefined
        baseUrl: string
    }> = {},
): Parameters<typeof metricsMiddleware>[0] {
    return {
        method: 'GET',
        route: { path: '/api/guilds/:guildId' },
        baseUrl: '',
        ...overrides,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
}

function createRes(statusCode: number) {
    const emitter = new EventEmitter()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Object.assign(emitter, { statusCode }) as any
}

describe('metricsMiddleware', () => {
    beforeEach(() => {
        // Reset counters between tests so call counts don't bleed.
        httpRequestsTotal.reset()
        httpRequestDurationSeconds.reset()
        httpServerErrorsTotal.reset()
    })

    test('calls next immediately', () => {
        const req = createReq()
        const res = createRes(200)
        const next = jest.fn()
        metricsMiddleware(req, res, next)
        expect(next).toHaveBeenCalledTimes(1)
    })

    test('records count + duration on response finish with route template label', async () => {
        const req = createReq()
        const res = createRes(200)
        const next = jest.fn()
        metricsMiddleware(req, res, next)
        res.emit('finish')

        const text = await registry.metrics()
        expect(text).toMatch(
            /lucky_backend_http_requests_total\{[^}]*method="GET"[^}]*route="\/api\/guilds\/:guildId"[^}]*status="200"[^}]*\}\s+1/,
        )
        expect(text).toContain('lucky_backend_http_request_duration_seconds_bucket')
        expect(text).toMatch(
            /lucky_backend_http_request_duration_seconds_count\{[^}]*route="\/api\/guilds\/:guildId"[^}]*\}\s+1/,
        )
    })

    test('increments server-errors counter for 5xx responses', async () => {
        const req = createReq({ method: 'POST' })
        const res = createRes(503)
        const next = jest.fn()
        metricsMiddleware(req, res, next)
        res.emit('finish')

        const text = await registry.metrics()
        expect(text).toMatch(
            /lucky_backend_http_server_errors_total\{[^}]*method="POST"[^}]*route="\/api\/guilds\/:guildId"[^}]*\}\s+1/,
        )
    })

    test('does NOT increment server-errors counter for 4xx responses', async () => {
        const req = createReq()
        const res = createRes(404)
        const next = jest.fn()
        metricsMiddleware(req, res, next)
        res.emit('finish')

        const text = await registry.metrics()
        // No 5xx error line should appear at all for this test.
        expect(text).not.toMatch(
            /lucky_backend_http_server_errors_total\{[^}]*\}\s+[1-9]/,
        )
    })

    test('uses "unmatched" label when no route is resolved', async () => {
        const req = createReq({ route: undefined })
        const res = createRes(404)
        const next = jest.fn()
        metricsMiddleware(req, res, next)
        res.emit('finish')

        const text = await registry.metrics()
        expect(text).toMatch(
            /lucky_backend_http_requests_total\{[^}]*route="unmatched"[^}]*\}\s+1/,
        )
    })

    test('uses "<baseUrl>/unmatched" when middleware is sub-mounted', async () => {
        const req = createReq({ route: undefined, baseUrl: '/api' })
        const res = createRes(404)
        const next = jest.fn()
        metricsMiddleware(req, res, next)
        res.emit('finish')

        const text = await registry.metrics()
        expect(text).toMatch(
            /lucky_backend_http_requests_total\{[^}]*route="\/api\/unmatched"[^}]*\}\s+1/,
        )
    })
})
