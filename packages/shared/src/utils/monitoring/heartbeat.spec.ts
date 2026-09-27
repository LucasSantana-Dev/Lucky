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
        delete process.env.HEALTHCHECK_URL
        delete process.env.HEALTHCHECK_URL_EXTERNAL
        delete process.env.HEALTHCHECK_INTERVAL_MS
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

    it('falls back to the legacy HEALTHCHECK_URL(_EXTERNAL) vars when the new ones are unset', () => {
        process.env.HEALTHCHECK_URL = 'https://hc.example/ping/legacy-a'
        process.env.HEALTHCHECK_URL_EXTERNAL = 'https://hc-ping.com/legacy-b'
        const fetchSpy = jest
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue({ ok: true, status: 200 } as unknown as Response)

        startHeartbeat({ serviceName: 'backend' })

        expect(fetchSpy).toHaveBeenCalledTimes(2)
        const urls = fetchSpy.mock.calls.map(([url]) => url)
        expect(urls).toEqual([
            'https://hc.example/ping/legacy-a',
            'https://hc-ping.com/legacy-b',
        ])
    })

    it('prefers HEARTBEAT_PING_URL over legacy HEALTHCHECK_URL when both are set', () => {
        process.env.HEARTBEAT_PING_URL = 'https://hc.example/ping/new'
        process.env.HEALTHCHECK_URL = 'https://hc.example/ping/legacy'
        const fetchSpy = jest
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue({ ok: true, status: 200 } as unknown as Response)

        startHeartbeat({ serviceName: 'backend' })

        expect(fetchSpy).toHaveBeenCalledTimes(1)
        expect(fetchSpy.mock.calls[0][0]).toBe('https://hc.example/ping/new')
    })

    it('falls back to legacy HEALTHCHECK_INTERVAL_MS when HEARTBEAT_INTERVAL_MS is unset', () => {
        jest.useFakeTimers()
        process.env.HEARTBEAT_PING_URL = 'https://hc.example/ping/a'
        process.env.HEALTHCHECK_INTERVAL_MS = '1000'
        const fetchSpy = jest
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue({ ok: true, status: 200 } as unknown as Response)

        startHeartbeat({ serviceName: 'bot' })
        expect(fetchSpy).toHaveBeenCalledTimes(1)

        jest.advanceTimersByTime(1000)
        expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('treats an explicit empty-string HEARTBEAT_PING_URL as unset (falls back to legacy)', () => {
        // docker-compose.yml's ${VAR:-} substitution sets the container env
        // var to an empty string rather than leaving it undefined when the
        // service-specific var is unset. Confirm the `||` fallback chain
        // still reaches HEALTHCHECK_URL in that case.
        process.env.HEARTBEAT_PING_URL = ''
        process.env.HEALTHCHECK_URL = 'https://hc.example/ping/legacy'
        const fetchSpy = jest
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue({ ok: true, status: 200 } as unknown as Response)

        startHeartbeat({ serviceName: 'bot' })

        expect(fetchSpy).toHaveBeenCalledTimes(1)
        expect(fetchSpy.mock.calls[0][0]).toBe('https://hc.example/ping/legacy')
    })

    it('never throws when fetch rejects', async () => {
        jest.useFakeTimers()
        process.env.HEARTBEAT_PING_URL = 'https://hc.example/ping/a'
        jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))

        expect(() => startHeartbeat({ serviceName: 'bot' })).not.toThrow()
        await jest.runOnlyPendingTimersAsync()
    })
})
