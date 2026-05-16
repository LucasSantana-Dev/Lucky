import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals'

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    infoLog: jest.fn(),
}))

import express, { type Express } from 'express'
import type { AddressInfo } from 'node:net'
import { request as httpRequest } from 'node:http'
import { setupMetricsRoute } from '../../../src/routes/metrics'

function getRaw(
    port: number,
    path: string,
): Promise<{ status: number; body: string; contentType: string | undefined }> {
    return new Promise((resolve, reject) => {
        const req = httpRequest(
            { host: '127.0.0.1', port, path, method: 'GET' },
            (res) => {
                const chunks: Buffer[] = []
                res.on('data', (c: Buffer) => chunks.push(c))
                res.on('end', () =>
                    resolve({
                        status: res.statusCode ?? 0,
                        body: Buffer.concat(chunks).toString('utf8'),
                        contentType: res.headers['content-type'],
                    }),
                )
            },
        )
        req.on('error', reject)
        req.end()
    })
}

async function startApp(): Promise<{
    app: Express
    port: number
    close: () => Promise<void>
}> {
    const app = express()
    setupMetricsRoute(app)
    const server = app.listen(0, '127.0.0.1')
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const port = (server.address() as AddressInfo).port
    return {
        app,
        port,
        close: () =>
            new Promise<void>((resolve) => {
                server.closeAllConnections?.()
                server.close(() => resolve())
            }),
    }
}

describe('GET /metrics', () => {
    const originalDisabled = process.env.METRICS_DISABLED
    let closeFn: (() => Promise<void>) | null = null

    beforeEach(() => {
        delete process.env.METRICS_DISABLED
    })

    afterEach(async () => {
        if (closeFn) await closeFn()
        closeFn = null
        if (originalDisabled === undefined) {
            delete process.env.METRICS_DISABLED
        } else {
            process.env.METRICS_DISABLED = originalDisabled
        }
    })

    test('serves Prometheus text exposition with correct content type', async () => {
        const { port, close } = await startApp()
        closeFn = close

        const res = await getRaw(port, '/metrics')
        expect(res.status).toBe(200)
        expect(res.contentType).toMatch(/text\/plain/)
        // Default Node metrics must be present.
        expect(res.body).toContain('process_cpu_user_seconds_total')
        // Service label is applied.
        expect(res.body).toMatch(/service="lucky-backend"/)
    })

    test('does not mount the route when METRICS_DISABLED=true', async () => {
        process.env.METRICS_DISABLED = 'true'
        const { port, close } = await startApp()
        closeFn = close

        const res = await getRaw(port, '/metrics')
        // Express default for unmatched route in a bare app is 404.
        expect(res.status).toBe(404)
    })
})
