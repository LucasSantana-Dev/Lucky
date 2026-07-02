import {
    describe,
    test,
    expect,
    jest,
    beforeEach,
    afterEach,
} from '@jest/globals'
import type { Client } from 'discord.js'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    // Plain function (not jest.fn): resetMocks would wipe a factory impl
    // between tests. Mirrors the real parseIntEnv contract from shared/utils.
    parseIntEnv: (
        name: string,
        fallback: number,
        options?: { min?: number; max?: number },
    ) => {
        const value = process.env[name]
        if (!value || !/^[+-]?\d+$/.test(value.trim())) return fallback
        const parsed = Number.parseInt(value, 10)
        if (options?.min !== undefined && parsed < options.min) return fallback
        if (options?.max !== undefined && parsed > options.max) return fallback
        return parsed
    },
}))

import { HeartbeatService } from './HeartbeatService'

const PING_URL = 'http://100.64.0.1:8092/ping/test-uuid'

function makeClient(ready: boolean): Client {
    return { isReady: () => ready } as unknown as Client
}

describe('HeartbeatService', () => {
    let fetchMock: jest.Mock
    let svc: HeartbeatService

    beforeEach(() => {
        jest.useFakeTimers()
        process.env.HEARTBEAT_PING_URL = PING_URL
        fetchMock = jest.fn(async () => ({ ok: true }))
        globalThis.fetch = fetchMock as unknown as typeof fetch
        svc = new HeartbeatService()
    })

    afterEach(() => {
        svc.stop()
        jest.useRealTimers()
        delete process.env.HEARTBEAT_PING_URL
        delete process.env.HEARTBEAT_INTERVAL_MS
    })

    test('disabled when HEARTBEAT_PING_URL not configured', async () => {
        delete process.env.HEARTBEAT_PING_URL
        svc.start(makeClient(true))
        await jest.advanceTimersByTimeAsync(120_000)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    test('pings immediately and on each interval while client is ready', async () => {
        svc.start(makeClient(true))
        await jest.advanceTimersByTimeAsync(0)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock).toHaveBeenCalledWith(
            PING_URL,
            expect.objectContaining({ method: 'GET' }),
        )
        await jest.advanceTimersByTimeAsync(60_000)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    test('does NOT ping when client is not ready', async () => {
        svc.start(makeClient(false))
        await jest.advanceTimersByTimeAsync(180_000)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    test('resumes pinging when client becomes ready', async () => {
        let ready = false
        svc.start({ isReady: () => ready } as unknown as Client)
        await jest.advanceTimersByTimeAsync(60_000)
        expect(fetchMock).not.toHaveBeenCalled()
        ready = true
        await jest.advanceTimersByTimeAsync(60_000)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    test('survives fetch rejection and keeps ticking', async () => {
        fetchMock.mockImplementation(async () => {
            throw new Error('network down')
        })
        svc.start(makeClient(true))
        await jest.advanceTimersByTimeAsync(60_000)
        fetchMock.mockImplementation(async () => ({ ok: true }))
        await jest.advanceTimersByTimeAsync(60_000)
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    test('parses custom interval from env var', async () => {
        process.env.HEARTBEAT_INTERVAL_MS = '30000'
        svc.start(makeClient(true))
        await jest.advanceTimersByTimeAsync(0)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        await jest.advanceTimersByTimeAsync(30_000)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    test('falls back to default interval on invalid env value', async () => {
        process.env.HEARTBEAT_INTERVAL_MS = '1h'
        svc.start(makeClient(true))
        await jest.advanceTimersByTimeAsync(0)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        await jest.advanceTimersByTimeAsync(59_999)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        await jest.advanceTimersByTimeAsync(1)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    test('start is idempotent — second start does not double the timer', async () => {
        svc.start(makeClient(true))
        svc.start(makeClient(true))
        await jest.advanceTimersByTimeAsync(60_000)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    test('stop clears the timer and drops the client', async () => {
        svc.start(makeClient(true))
        await jest.advanceTimersByTimeAsync(0)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        svc.stop()
        await jest.advanceTimersByTimeAsync(180_000)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})
