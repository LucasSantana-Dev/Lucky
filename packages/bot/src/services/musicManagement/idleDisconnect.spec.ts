import {
    describe,
    expect,
    it,
    jest,
    beforeEach,
    afterEach,
} from '@jest/globals'

const mockGetGuildSettings = jest.fn()
const mockMarkIntentionalStop = jest.fn()
const mockClearGuildState = jest.fn()
const mockDebugLog = jest.fn()
const mockErrorLog = jest.fn()
const mockWarnLog = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: {
        getGuildSettings: mockGetGuildSettings,
    },
}))
jest.mock('@lucky/shared/utils', () => ({
    debugLog: mockDebugLog,
    errorLog: mockErrorLog,
    warnLog: mockWarnLog,
}))
jest.mock('./watchdog', () => ({
    musicWatchdogService: {
        markIntentionalStop: mockMarkIntentionalStop,
    },
}))
jest.mock('../musicRecommendation/collaborativePlaylist', () => ({
    collaborativePlaylistService: {
        clearGuildState: mockClearGuildState,
    },
}))

import { scheduleIdleDisconnect, clearIdleTimer } from './idleDisconnect'

function makeQueue(overrides: Record<string, unknown> = {}) {
    return {
        guild: { id: 'guild-1' },
        metadata: {},
        delete: jest.fn(),
        ...overrides,
    } as any
}

describe('idleDisconnect', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers()
    })

    afterEach(() => {
        clearIdleTimer('guild-1')
        jest.useRealTimers()
    })

    it('does nothing when idle timeout is disabled', async () => {
        mockGetGuildSettings.mockResolvedValueOnce({ idleTimeoutMinutes: 0 })
        const queue = makeQueue()

        scheduleIdleDisconnect(queue)
        await jest.runOnlyPendingTimersAsync()

        expect(queue.delete).not.toHaveBeenCalled()
    })

    it('disconnects the queue after the idle timeout elapses', async () => {
        mockGetGuildSettings.mockResolvedValueOnce({ idleTimeoutMinutes: 5 })
        const send = jest.fn().mockResolvedValue(undefined)
        const queue = makeQueue({ metadata: { channel: { send } } })

        scheduleIdleDisconnect(queue)
        await jest.advanceTimersByTimeAsync(5 * 60 * 1000)

        expect(mockMarkIntentionalStop).toHaveBeenCalledWith('guild-1')
        expect(queue.delete).toHaveBeenCalled()
        expect(mockClearGuildState).toHaveBeenCalledWith('guild-1')
        expect(send).toHaveBeenCalledWith(
            '👋 Left the voice channel due to inactivity.',
        )
    })

    it('skips the channel notice when there is no channel in metadata', async () => {
        mockGetGuildSettings.mockResolvedValueOnce({ idleTimeoutMinutes: 5 })
        const queue = makeQueue({ metadata: {} })

        scheduleIdleDisconnect(queue)
        await jest.advanceTimersByTimeAsync(5 * 60 * 1000)

        expect(queue.delete).toHaveBeenCalled()
    })

    it('warns (not just debug-logs) when queue.delete throws, and includes the guildId', async () => {
        mockGetGuildSettings.mockResolvedValueOnce({ idleTimeoutMinutes: 5 })
        const queue = makeQueue()
        queue.delete.mockImplementation(() => {
            throw new Error('boom')
        })

        scheduleIdleDisconnect(queue)
        await jest.advanceTimersByTimeAsync(5 * 60 * 1000)

        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Error during idle disconnect',
                data: expect.objectContaining({
                    guildId: 'guild-1',
                    error: 'Error: boom',
                }),
            }),
        )
    })

    it('keeps a failed farewell message at debug without masking a successful teardown', async () => {
        mockGetGuildSettings.mockResolvedValueOnce({ idleTimeoutMinutes: 5 })
        const send = jest.fn().mockRejectedValue(new Error('missing access'))
        const queue = makeQueue({ metadata: { channel: { send } } })

        scheduleIdleDisconnect(queue)
        await jest.advanceTimersByTimeAsync(5 * 60 * 1000)

        expect(queue.delete).toHaveBeenCalled()
        expect(mockClearGuildState).toHaveBeenCalledWith('guild-1')
        expect(mockDebugLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to send idle disconnect farewell message',
                data: expect.objectContaining({ guildId: 'guild-1' }),
            }),
        )
        expect(mockWarnLog).not.toHaveBeenCalled()
    })

    it('logs and does not throw when settings lookup rejects', async () => {
        mockGetGuildSettings.mockRejectedValueOnce(new Error('db down'))
        const queue = makeQueue()

        scheduleIdleDisconnect(queue)
        await jest.runOnlyPendingTimersAsync()

        expect(mockErrorLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to schedule idle disconnect in guild guild-1',
            }),
        )
    })

    it('clearIdleTimer cancels a pending timer before it fires', async () => {
        mockGetGuildSettings.mockResolvedValueOnce({ idleTimeoutMinutes: 5 })
        const queue = makeQueue()

        scheduleIdleDisconnect(queue)
        await jest.advanceTimersByTimeAsync(0)
        clearIdleTimer('guild-1')
        await jest.advanceTimersByTimeAsync(5 * 60 * 1000)

        expect(queue.delete).not.toHaveBeenCalled()
    })

    it('clearIdleTimer is a no-op for a guild with no timer', () => {
        expect(() => clearIdleTimer('unknown-guild')).not.toThrow()
    })

    it('two rapid calls before settings resolve leave exactly one timer armed', async () => {
        const resolvers: Array<
            (value: { idleTimeoutMinutes: number }) => void
        > = []
        mockGetGuildSettings.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolvers.push(resolve)
                }),
        )
        const queue = makeQueue()

        // Both calls run before either settings lookup resolves, reproducing
        // the race from #2218: the second call's clearIdleTimer used to run
        // before the first call's idleTimers.set, leaving two timers armed.
        scheduleIdleDisconnect(queue)
        scheduleIdleDisconnect(queue)

        resolvers[0]?.({ idleTimeoutMinutes: 5 })
        resolvers[1]?.({ idleTimeoutMinutes: 5 })
        await jest.advanceTimersByTimeAsync(0)

        expect(jest.getTimerCount()).toBe(1)

        await jest.advanceTimersByTimeAsync(5 * 60 * 1000)

        expect(queue.delete).toHaveBeenCalledTimes(1)
    })

    it('clearIdleTimer before settings resolve leaves zero timers armed', async () => {
        let resolveSettings: (value: {
            idleTimeoutMinutes: number
        }) => void = () => {}
        mockGetGuildSettings.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveSettings = resolve
                }),
        )
        const queue = makeQueue()

        // playerStart calls clearIdleTimer on playback resume; if the
        // in-flight settings fetch is not invalidated, its callback can
        // arm a timer that later kills the now-active playback (#2218 P1).
        scheduleIdleDisconnect(queue)
        clearIdleTimer('guild-1')
        resolveSettings({ idleTimeoutMinutes: 5 })
        await jest.advanceTimersByTimeAsync(0)

        expect(jest.getTimerCount()).toBe(0)

        await jest.advanceTimersByTimeAsync(5 * 60 * 1000)

        expect(queue.delete).not.toHaveBeenCalled()
    })

    it('rescheduling clears any prior timer for the guild', async () => {
        mockGetGuildSettings.mockResolvedValue({ idleTimeoutMinutes: 5 })
        const queue = makeQueue()

        scheduleIdleDisconnect(queue)
        await jest.advanceTimersByTimeAsync(0)
        scheduleIdleDisconnect(queue)
        await jest.advanceTimersByTimeAsync(5 * 60 * 1000)

        expect(queue.delete).toHaveBeenCalledTimes(1)
    })
})
