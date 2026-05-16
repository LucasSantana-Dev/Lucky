import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'

const renderMetricsMock = jest.fn<() => Promise<string>>(async () =>
    '# fake metrics\nfoo 1\n',
)

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('./prometheus', () => ({
    renderMetrics: async () => renderMetricsMock(),
    metricsContentType: 'text/plain; version=0.0.4; charset=utf-8',
}))

import { startMetricsServer, stopMetricsServer } from './metricsServer'

function fakeClient(ready: boolean) {
    return { isReady: () => ready } as unknown as Parameters<
        typeof startMetricsServer
    >[0]
}

function get(
    port: number,
    path: string,
    method: 'GET' | 'POST' = 'GET',
): Promise<{
    status: number
    body: string
    contentType: string | undefined
}> {
    return new Promise((resolve, reject) => {
        const req = httpRequest(
            { host: '127.0.0.1', port, path, method },
            (res) => {
                const chunks: Buffer[] = []
                res.on('data', (c: Buffer) => chunks.push(c))
                res.on('end', () => {
                    resolve({
                        status: res.statusCode ?? 0,
                        body: Buffer.concat(chunks).toString('utf8'),
                        contentType: res.headers['content-type'],
                    })
                })
            },
        )
        req.on('error', reject)
        req.end()
    })
}

describe('metricsServer', () => {
    const originalPort = process.env.METRICS_PORT
    const originalDisabled = process.env.METRICS_DISABLED

    beforeEach(() => {
        process.env.METRICS_PORT = '0'
        delete process.env.METRICS_DISABLED
        renderMetricsMock.mockReset()
        renderMetricsMock.mockImplementation(async () =>
            '# fake metrics\nfoo 1\n',
        )
    })

    afterEach(async () => {
        await stopMetricsServer()
        if (originalPort === undefined) {
            delete process.env.METRICS_PORT
        } else {
            process.env.METRICS_PORT = originalPort
        }
        if (originalDisabled === undefined) {
            delete process.env.METRICS_DISABLED
        } else {
            process.env.METRICS_DISABLED = originalDisabled
        }
    })

    it('serves /metrics with the Prometheus content type', async () => {
        const server = startMetricsServer(fakeClient(true))
        expect(server).not.toBeNull()
        await new Promise<void>((resolve) => server!.once('listening', resolve))
        const port = (server!.address() as AddressInfo).port

        const res = await get(port, '/metrics')
        expect(res.status).toBe(200)
        expect(res.contentType).toMatch(/text\/plain/)
        expect(res.body).toContain('foo 1')
        expect(renderMetricsMock).toHaveBeenCalledTimes(1)
    })

    it('returns 200 on /healthz when client is ready', async () => {
        const server = startMetricsServer(fakeClient(true))
        await new Promise<void>((resolve) => server!.once('listening', resolve))
        const port = (server!.address() as AddressInfo).port

        const res = await get(port, '/healthz')
        expect(res.status).toBe(200)
        expect(res.body).toBe('ok')
    })

    it('returns 503 on /healthz when client is not ready', async () => {
        const server = startMetricsServer(fakeClient(false))
        await new Promise<void>((resolve) => server!.once('listening', resolve))
        const port = (server!.address() as AddressInfo).port

        const res = await get(port, '/healthz')
        expect(res.status).toBe(503)
        expect(res.body).toBe('not ready')
    })

    it('returns 404 on unknown routes', async () => {
        const server = startMetricsServer(fakeClient(true))
        await new Promise<void>((resolve) => server!.once('listening', resolve))
        const port = (server!.address() as AddressInfo).port

        const res = await get(port, '/nope')
        expect(res.status).toBe(404)
    })

    it('returns 405 on non-GET methods', async () => {
        const server = startMetricsServer(fakeClient(true))
        await new Promise<void>((resolve) => server!.once('listening', resolve))
        const port = (server!.address() as AddressInfo).port

        const res = await get(port, '/metrics', 'POST')
        expect(res.status).toBe(405)
    })

    it('no-ops when METRICS_DISABLED is set', () => {
        process.env.METRICS_DISABLED = 'true'
        const server = startMetricsServer(fakeClient(true))
        expect(server).toBeNull()
    })

    it('returns the same server on a second call', async () => {
        const a = startMetricsServer(fakeClient(true))
        const b = startMetricsServer(fakeClient(true))
        expect(a).toBe(b)
        await new Promise<void>((resolve) => a!.once('listening', resolve))
    })
})
