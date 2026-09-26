import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { startHeartbeat, stopHeartbeat } from './heartbeat'

describe('heartbeat', () => {
    afterEach(() => {
        stopHeartbeat()
        jest.restoreAllMocks()
        jest.useRealTimers()
        delete process.env.HEARTBEAT_PING_URL
        delete process.env.HEARTBEAT_PING_URL_EXTERNAL
        delete process.env.HEARTBEAT_INTERVAL_MS
    })

    it('no-ops and returns a stop function when no URL is configured', () => {
        const fetchSpy = jest.spyOn(globalThis, 'fetch')

        const stop = startHeartbeat({ serviceName: 'bot' })

        expect(typeof stop).toBe('function')
        expect(fetchSpy).not.toHaveBeenCalled()
        stop()
    })

    it('sends an immediate POST ping to every configured URL', () => {
        process.env.HEARTBEAT_PING_URL = 'https://hc.example/ping/a'
        process.env.HEARTBEAT_PING_URL_EXTERNAL = 'https://hc-ping.com/b'
        const fetchSpy = jest
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue({ ok: true, status: 200 } as unknown as Response)

        startHeartbeat({ serviceName: 'backend' })

        expect(fetchSpy).toHaveBeenCalledTimes(2)
        const [url, init] = fetchSpy.mock.calls[0]
        expect(url).toBe('https://hc.example/ping/a')
        expect(init?.method).toBe('POST')
        expect(init?.body).toContain('backend@')
    })

    it('pings again on the interval and stops cleanly', () => {
        jest.useFakeTimers()
        process.env.HEARTBEAT_PING_URL = 'https://hc.example/ping/a'
        process.env.HEARTBEAT_INTERVAL_MS = '1000'
        const fetchSpy = jest
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue({ ok: true, status: 200 } as unknown as Response)

        startHeartbeat({ serviceName: 'bot' })
        expect(fetchSpy).toHaveBeenCalledTimes(1)

        jest.advanceTimersByTime(1000)
        expect(fetchSpy).toHaveBeenCalledTimes(2)

        stopHeartbeat()
        jest.advanceTimersByTime(5000)
        expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('does NOT ping when isReady gate returns false', () => {
        jest.useFakeTimers()
        process.env.HEARTBEAT_PING_URL = 'https://hc.example/ping/a'
        const fetchSpy = jest
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue({ ok: true, status: 200 } as unknown as Response)

        startHeartbeat({ serviceName: 'bot', isReady: () => false })
        jest.advanceTimersByTime(180_000)

        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('resumes pinging once the isReady gate returns true', () => {
        jest.useFakeTimers()
        process.env.HEARTBEAT_PING_URL = 'https://hc.example/ping/a'
        process.env.HEARTBEAT_INTERVAL_MS = '1000'
        let ready = false
        const fetchSpy = jest
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue({ ok: true, status: 200 } as unknown as Response)

        startHeartbeat({ serviceName: 'bot', isReady: () => ready })
        jest.advanceTimersByTime(1000)
        expect(fetchSpy).not.toHaveBeenCalled()

        ready = true
        jest.advanceTimersByTime(1000)
        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('never throws when fetch rejects', async () => {
        jest.useFakeTimers()
        process.env.HEARTBEAT_PING_URL = 'https://hc.example/ping/a'
        jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))

        expect(() => startHeartbeat({ serviceName: 'bot' })).not.toThrow()
        await jest.runOnlyPendingTimersAsync()
    })
})
