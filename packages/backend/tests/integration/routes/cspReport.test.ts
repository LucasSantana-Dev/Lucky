import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'

jest.mock('@lucky/shared/utils', () => ({
    warnLog: jest.fn(),
    infoLog: jest.fn(),
    errorLog: jest.fn(),
    debugLog: jest.fn(),
}))
jest.mock('@lucky/shared/utils/monitoring', () => ({
    captureMessageThrottled: jest.fn(),
}))

import { warnLog } from '@lucky/shared/utils'
import { captureMessageThrottled } from '@lucky/shared/utils/monitoring'
import { setupSecurityRoutes } from '../../../src/routes/security'

const warnLogMock = warnLog as jest.MockedFunction<typeof warnLog>
const captureMock = captureMessageThrottled as jest.MockedFunction<
    typeof captureMessageThrottled
>

describe('POST /api/security/csp-report (#1283)', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        // The global express.json() runs in the real middleware stack; the
        // route carries its own parser for the CSP content types, so none here.
        setupSecurityRoutes(app)
        jest.clearAllMocks()
    })

    test('records a legacy report-uri violation and returns 204', async () => {
        const response = await request(app)
            .post('/api/security/csp-report')
            .set('Content-Type', 'application/csp-report')
            .send(
                JSON.stringify({
                    'csp-report': {
                        'document-uri': 'https://app.example/dashboard',
                        'violated-directive': 'script-src',
                        'blocked-uri': 'https://evil.example/x.js',
                        disposition: 'report',
                    },
                }),
            )

        expect(response.status).toBe(204)
        expect(warnLogMock).toHaveBeenCalledTimes(1)
        expect(warnLogMock).toHaveBeenCalledWith({
            message: 'csp-violation',
            data: expect.objectContaining({
                violatedDirective: 'script-src',
                blockedUri: 'https://evil.example/x.js',
            }),
        })
        expect(captureMock).toHaveBeenCalledTimes(1)
    })

    test('records a Reporting-API (report-to) violation and returns 204', async () => {
        const response = await request(app)
            .post('/api/security/csp-report')
            .set('Content-Type', 'application/reports+json')
            .send(
                JSON.stringify([
                    {
                        type: 'csp-violation',
                        body: {
                            documentURL: 'https://app.example/',
                            effectiveDirective: 'img-src',
                            blockedURL: 'https://app.example/p.png',
                        },
                    },
                ]),
            )

        expect(response.status).toBe(204)
        expect(warnLogMock).toHaveBeenCalledWith({
            message: 'csp-violation',
            data: expect.objectContaining({
                violatedDirective: 'img-src',
                blockedUri: 'https://app.example/p.png',
            }),
        })
        expect(captureMock).toHaveBeenCalledTimes(1)
    })

    test('returns 204 (not 500) on malformed JSON without logging', async () => {
        const response = await request(app)
            .post('/api/security/csp-report')
            .set('Content-Type', 'application/csp-report')
            .send('{ this is not valid json')

        expect(response.status).toBe(204)
        expect(warnLogMock).not.toHaveBeenCalled()
        expect(captureMock).not.toHaveBeenCalled()
    })

    test('strips the query string from document-uri before recording', async () => {
        await request(app)
            .post('/api/security/csp-report')
            .set('Content-Type', 'application/csp-report')
            .send(
                JSON.stringify({
                    'csp-report': {
                        'document-uri':
                            'https://app.example/dashboard?token=secret123',
                        'violated-directive': 'script-src',
                        'blocked-uri': 'https://evil.example/x.js',
                    },
                }),
            )
            .expect(204)

        expect(warnLogMock).toHaveBeenCalledWith({
            message: 'csp-violation',
            data: expect.objectContaining({
                documentUri: 'https://app.example/dashboard',
            }),
        })
    })

    test('caps the number of reports processed per request', async () => {
        const reports = Array.from({ length: 50 }, () => ({
            type: 'csp-violation',
            body: {
                effectiveDirective: 'img-src',
                blockedURL: 'https://evil.example/p.png',
            },
        }))

        await request(app)
            .post('/api/security/csp-report')
            .set('Content-Type', 'application/reports+json')
            .send(JSON.stringify(reports))
            .expect(204)

        expect(warnLogMock.mock.calls.length).toBeLessThanOrEqual(20)
    })

    test('ignores an empty/garbage payload without logging and returns 204', async () => {
        const response = await request(app)
            .post('/api/security/csp-report')
            .set('Content-Type', 'application/csp-report')
            .send(JSON.stringify({ 'csp-report': { foo: 'bar' } }))

        expect(response.status).toBe(204)
        expect(warnLogMock).not.toHaveBeenCalled()
        expect(captureMock).not.toHaveBeenCalled()
    })

    describe('third-party noise (#3087)', () => {
        const post = (report: Record<string, string>) =>
            request(app)
                .post('/api/security/csp-report')
                .set('Content-Type', 'application/csp-report')
                .send(JSON.stringify({ 'csp-report': report }))

        test('a third-party font block (extension) is logged but not sent to Sentry', async () => {
            await post({
                'document-uri': 'https://lucky.example/',
                'violated-directive': 'font-src',
                'blocked-uri': 'https://fonts.gstatic.com/s/x.woff2',
            }).expect(204)

            expect(warnLogMock).toHaveBeenCalledTimes(1)
            expect(captureMock).not.toHaveBeenCalled()
        })

        test('an own-origin violation still reports', async () => {
            await post({
                'document-uri': 'https://lucky.example/',
                'violated-directive': 'img-src',
                'blocked-uri': 'https://lucky.example/og-image.png',
            }).expect(204)

            expect(captureMock).toHaveBeenCalledTimes(1)
        })

        test('an inline or eval violation still reports', async () => {
            await post({
                'document-uri': 'https://lucky.example/',
                'violated-directive': 'script-src',
                'blocked-uri': 'inline',
            }).expect(204)

            expect(captureMock).toHaveBeenCalledTimes(1)
        })

        test('a third-party script block still reports', async () => {
            await post({
                'document-uri': 'https://lucky.example/',
                'violated-directive': 'script-src',
                'blocked-uri': 'https://evil.example/x.js',
            }).expect(204)

            expect(captureMock).toHaveBeenCalledTimes(1)
        })

        test('counts violations by directive and origin', async () => {
            const { cspViolationsTotal } =
                await import('../../../src/utils/prometheus')
            const count = async () =>
                (await cspViolationsTotal.get()).values.find(
                    (v) =>
                        v.labels.directive === 'font-src' &&
                        v.labels.origin === 'third_party',
                )?.value ?? 0
            const before = await count()
            await post({
                'document-uri': 'https://lucky.example/',
                'violated-directive': 'font-src',
                'blocked-uri': 'https://fonts.gstatic.com/s/x.woff2',
            }).expect(204)

            expect(await count()).toBe(before + 1)
        })
    })
})
