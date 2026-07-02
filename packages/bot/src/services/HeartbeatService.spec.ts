import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import type { Client } from 'discord.js'
import { heartbeatService } from './HeartbeatService'

const debugLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    parseIntEnv: (name: string, defaultValue: number, opts?: { min: number }) => {
        if (name === 'HEARTBEAT_INTERVAL_MS') {
            const val = process.env[name]
            if (!val) return defaultValue
            const parsed = parseInt(val, 10)
            if (isNaN(parsed)) return defaultValue
            if (opts?.min && parsed < opts.min) return defaultValue
            return parsed
        }
        return defaultValue
    },
}))

const makeClient = (overrides: Partial<Client> = {}) => ({
    isReady: jest.fn().mockReturnValue(true),
    ...overrides,
}) as unknown as Client

beforeEach(() => {
    jest.clearAllMocks()
    debugLogMock.mockReset()
    errorLogMock.mockReset()
    jest.useFakeTimers()
})

afterEach(() => {
    heartbeatService.stop()
    jest.useRealTimers()
})

describe('HeartbeatService', () => {
    describe('start', () => {
        it('logs disabled message when HEARTBEAT_PING_URL not set', () => {
            delete process.env.HEARTBEAT_PING_URL

            heartbeatService.start(makeClient())

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('disabled'),
                }),
            )
        })

        it('does nothing when env var is not configured', () => {
            delete process.env.HEARTBEAT_PING_URL
            const fetchMock = jest.spyOn(globalThis, 'fetch')

            heartbeatService.start(makeClient())

            expect(fetchMock).not.toHaveBeenCalled()
            fetchMock.mockRestore()
        })

        it('uses default interval when env var not set', () => {
            process.env.HEARTBEAT_PING_URL = 'http://healthchecks/ping'
            delete process.env.HEARTBEAT_INTERVAL_MS
            const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: true,
            } as never)

            heartbeatService.start(makeClient())

            // First immediate ping
            expect(fetchMock).toHaveBeenCalledTimes(1)
            fetchMock.mockClear()

            // Advance to just before first interval tick
            jest.advanceTimersByTime(59999)
            expect(fetchMock).not.toHaveBeenCalled()

            // Advance to first interval tick (60s default)
            jest.advanceTimersByTime(1)
            expect(fetchMock).toHaveBeenCalledTimes(1)

            fetchMock.mockRestore()
            delete process.env.HEARTBEAT_PING_URL
        })

        it('parses custom interval from env var', () => {
            process.env.HEARTBEAT_PING_URL = 'http://healthchecks/ping'
            process.env.HEARTBEAT_INTERVAL_MS = '30000'
            const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: true,
            } as never)

            heartbeatService.start(makeClient())

            fetchMock.mockClear()

            // Advance to first interval (30s)
            jest.advanceTimersByTime(30000)
            expect(fetchMock).toHaveBeenCalledTimes(1)

            fetchMock.mockRestore()
            delete process.env.HEARTBEAT_PING_URL
            delete process.env.HEARTBEAT_INTERVAL_MS
        })

        it('uses default interval when env var is invalid', () => {
            process.env.HEARTBEAT_PING_URL = 'http://healthchecks/ping'
            process.env.HEARTBEAT_INTERVAL_MS = 'not-a-number'
            const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: true,
            } as never)

            heartbeatService.start(makeClient())

            fetchMock.mockClear()

            // Should use default 60s
            jest.advanceTimersByTime(60000)
            expect(fetchMock).toHaveBeenCalledTimes(1)

            fetchMock.mockRestore()
            delete process.env.HEARTBEAT_PING_URL
            delete process.env.HEARTBEAT_INTERVAL_MS
        })

        it('pings immediately on start', () => {
            process.env.HEARTBEAT_PING_URL = 'http://healthchecks/ping'
            const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: true,
            } as never)

            heartbeatService.start(makeClient())

            expect(fetchMock).toHaveBeenCalledWith('http://healthchecks/ping', {
                method: 'GET',
                signal: expect.any(AbortSignal),
            })

            fetchMock.mockRestore()
            delete process.env.HEARTBEAT_PING_URL
        })

        it('does not ping if client is not ready on start', () => {
            process.env.HEARTBEAT_PING_URL = 'http://healthchecks/ping'
            const fetchMock = jest.spyOn(globalThis, 'fetch')

            heartbeatService.start(makeClient({ isReady: () => false }))

            expect(fetchMock).not.toHaveBeenCalled()

            fetchMock.mockRestore()
            delete process.env.HEARTBEAT_PING_URL
        })
    })

    describe('stop', () => {
        it('clears interval on stop', () => {
            process.env.HEARTBEAT_PING_URL = 'http://healthchecks/ping'
            const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: true,
            } as never)

            heartbeatService.start(makeClient())
            fetchMock.mockClear()

            heartbeatService.stop()

            // Advance time past interval
            jest.advanceTimersByTime(120000)

            // Should not ping again
            expect(fetchMock).not.toHaveBeenCalled()

            fetchMock.mockRestore()
            delete process.env.HEARTBEAT_PING_URL
        })

        it('is safe to call when not started', () => {
            expect(() => heartbeatService.stop()).not.toThrow()
        })

        it('is safe to call multiple times', () => {
            process.env.HEARTBEAT_PING_URL = 'http://healthchecks/ping'
            heartbeatService.start(makeClient())

            heartbeatService.stop()
            expect(() => heartbeatService.stop()).not.toThrow()

            delete process.env.HEARTBEAT_PING_URL
        })

        it('logs stopped message', () => {
            process.env.HEARTBEAT_PING_URL = 'http://healthchecks/ping'
            heartbeatService.start(makeClient())
            debugLogMock.mockClear()

            heartbeatService.stop()

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('stopped'),
                }),
            )

            delete process.env.HEARTBEAT_PING_URL
        })
    })

    describe('ping behavior', () => {
        beforeEach(() => {
            process.env.HEARTBEAT_PING_URL = 'http://healthchecks/ping'
        })

        afterEach(() => {
            delete process.env.HEARTBEAT_PING_URL
        })

        it('pings when client is ready', () => {
            const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: true,
            } as never)
            const isReadyMock = jest.fn().mockReturnValue(true)

            heartbeatService.start(makeClient({ isReady: isReadyMock }))
            fetchMock.mockClear()

            jest.advanceTimersByTime(60000)

            expect(fetchMock).toHaveBeenCalled()
            fetchMock.mockRestore()
        })

        it('skips ping when client is not ready', () => {
            const fetchMock = jest.spyOn(globalThis, 'fetch')
            const isReadyMock = jest.fn().mockReturnValue(false)

            heartbeatService.start(makeClient({ isReady: isReadyMock }))
            fetchMock.mockClear()

            jest.advanceTimersByTime(60000)

            expect(fetchMock).not.toHaveBeenCalled()
            fetchMock.mockRestore()
        })

        it('debugLogs when client not ready', () => {
            const fetchMock = jest.spyOn(globalThis, 'fetch')
            const isReadyMock = jest.fn().mockReturnValue(false)

            heartbeatService.start(makeClient({ isReady: isReadyMock }))
            debugLogMock.mockClear()

            jest.advanceTimersByTime(60000)

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('not ready'),
                }),
            )

            fetchMock.mockRestore()
        })

        it('debugLogs non-OK response status', () => {
            const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
                ok: false,
                status: 503,
            } as never)

            heartbeatService.start(makeClient())
            debugLogMock.mockClear()

            jest.advanceTimersByTime(60000)

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('non-OK'),
                    data: expect.objectContaining({ status: 503 }),
                }),
            )

            fetchMock.mockRestore()
        })

        it('survives fetch rejection without throwing', () => {
            const fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValue(
                new Error('Network error'),
            )

            heartbeatService.start(makeClient())

            expect(() => {
                jest.advanceTimersByTime(60000)
            }).not.toThrow()

            fetchMock.mockRestore()
        })

        it('debugLogs fetch error', () => {
            const fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValue(
                new Error('Network error'),
            )

            heartbeatService.start(makeClient())
            debugLogMock.mockClear()

            jest.advanceTimersByTime(60000)

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('failed'),
                }),
            )

            fetchMock.mockRestore()
        })

        it('does not log AbortError as a failure', () => {
            const abortError = new Error('Aborted')
            abortError.name = 'AbortError'
            const fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValue(
                abortError,
            )

            heartbeatService.start(makeClient())
            debugLogMock.mockClear()

            jest.advanceTimersByTime(60000)

            // AbortError should not be logged as a failure
            expect(debugLogMock).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('failed'),
                }),
            )

            fetchMock.mockRestore()
        })

        it('prevents overlapping ticks', () => {
            let fetchResolve: () => void = () => {}
            const fetchPromise = new Promise<void>((resolve) => {
                fetchResolve = resolve
            })
            const fetchMock = jest.spyOn(globalThis, 'fetch').mockReturnValue(
                fetchPromise as never,
            )

            heartbeatService.start(makeClient())
            fetchMock.mockClear()

            // First tick at 60s
            jest.advanceTimersByTime(60000)
            expect(fetchMock).toHaveBeenCalledTimes(1)

            // Immediately trigger next tick before first completes
            jest.advanceTimersByTime(60000)

            // Should not call fetch again (in-progress guard)
            expect(fetchMock).toHaveBeenCalledTimes(1)

            // Resolve first fetch
            fetchResolve()
            jest.advanceTimersByTime(0)

            // Now next tick can proceed
            jest.advanceTimersByTime(60000)
            expect(fetchMock).toHaveBeenCalledTimes(2)

            fetchMock.mockRestore()
        })
    })

    describe('abort timeout', () => {
        beforeEach(() => {
            process.env.HEARTBEAT_PING_URL = 'http://healthchecks/ping'
        })

        afterEach(() => {
            delete process.env.HEARTBEAT_PING_URL
        })

        it('aborts fetch after 10 seconds', () => {
            const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(
                (_url: unknown, opts: { signal: AbortSignal }) => {
                    // Simulate a slow fetch and check if abort was called
                    return new Promise((resolve, reject) => {
                        opts.signal.addEventListener('abort', () => {
                            reject(new Error('Aborted'))
                        })
                    })
                },
            )

            heartbeatService.start(makeClient())
            fetchMock.mockClear()

            jest.advanceTimersByTime(60000)

            // Advance past the 10s timeout
            jest.advanceTimersByTime(10000)

            // Should have been aborted
            expect(fetchMock).toHaveBeenCalled()

            fetchMock.mockRestore()
        })
    })
})
