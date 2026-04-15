import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { handlePause, handleStop, handleSkip } from './commandHandlers'

const publishStateMock = jest.fn()
const buildQueueStateMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const setReplenishSuppressedMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    musicControlService: {
        publishState: (...args: unknown[]) => publishStateMock(...args),
    },
}))

jest.mock('./mappers', () => ({
    buildQueueState: (...args: unknown[]) => buildQueueStateMock(...args),
    repeatModeToEnum: jest.fn(() => 0),
}))

jest.mock('../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('../../utils/music/replenishSuppressionStore', () => ({
    setReplenishSuppressed: (...args: unknown[]) =>
        setReplenishSuppressedMock(...args),
}))

describe('handleStop', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        buildQueueStateMock.mockResolvedValue({ guildId: 'guild-1' })
    })

    it('stops node, clears, and deletes the queue', async () => {
        const stop = jest.fn()
        const clear = jest.fn()
        const del = jest.fn()
        resolveGuildQueueMock.mockReturnValue({
            queue: { node: { stop }, clear, delete: del },
        })

        const result = await handleStop(
            {} as any,
            { id: 'cmd-1', guildId: 'guild-1', data: {} } as any,
        )

        expect(stop).toHaveBeenCalled()
        expect(clear).toHaveBeenCalled()
        expect(del).toHaveBeenCalled()
        expect(result.success).toBe(true)
    })

    it('suppresses autoplay replenish for 30 seconds', async () => {
        const stop = jest.fn()
        const clear = jest.fn()
        const del = jest.fn()
        resolveGuildQueueMock.mockReturnValue({
            queue: { node: { stop }, clear, delete: del },
        })

        await handleStop(
            {} as any,
            { id: 'cmd-1', guildId: 'guild-1', data: {} } as any,
        )

        expect(setReplenishSuppressedMock).toHaveBeenCalledWith('guild-1', 30_000)
    })

    it('returns failure when no queue', async () => {
        resolveGuildQueueMock.mockReturnValue({ queue: null })

        const result = await handleStop(
            {} as any,
            { id: 'cmd-2', guildId: 'guild-1', data: {} } as any,
        )

        expect(result.success).toBe(false)
        expect(result.error).toBe('No active queue')
    })
})

describe('handleSkip', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        buildQueueStateMock.mockResolvedValue({ guildId: 'guild-1' })
    })

    it('awaits queue.node.skip() before publishing state', async () => {
        const skipAsync = jest.fn().mockResolvedValue(undefined)
        resolveGuildQueueMock.mockReturnValue({
            queue: { node: { skip: skipAsync } },
        })

        const publishPromise = Promise.resolve()
        publishStateMock.mockReturnValue(publishPromise)

        const result = await handleSkip(
            {} as any,
            { id: 'cmd-1', guildId: 'guild-1', data: {} } as any,
        )

        expect(skipAsync).toHaveBeenCalled()
        expect(publishStateMock).toHaveBeenCalled()
        expect(result.success).toBe(true)
    })

    it('returns failure when no queue', async () => {
        resolveGuildQueueMock.mockReturnValue({ queue: null })

        const result = await handleSkip(
            {} as any,
            { id: 'cmd-2', guildId: 'guild-1', data: {} } as any,
        )

        expect(result.success).toBe(false)
        expect(result.error).toBe('No active queue')
    })
})

describe('webMusic commandHandlers queue resolution', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        buildQueueStateMock.mockResolvedValue({ guildId: 'guild-1' })
    })

    it('uses resolver-backed queue for pause command', async () => {
        const pause = jest.fn()
        resolveGuildQueueMock.mockReturnValue({
            queue: {
                node: { pause },
            },
            source: 'cache.guild',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 1,
                cacheSampleKeys: [],
            },
        })

        const result = await handlePause(
            {} as any,
            { id: 'cmd-1', guildId: 'guild-1', data: {} } as any,
        )

        expect(resolveGuildQueueMock).toHaveBeenCalledWith(
            expect.anything(),
            'guild-1',
        )
        expect(pause).toHaveBeenCalled()
        expect(publishStateMock).toHaveBeenCalledWith({ guildId: 'guild-1' })
        expect(result.success).toBe(true)
    })

    it('returns failure when resolver misses queue', async () => {
        resolveGuildQueueMock.mockReturnValue({
            queue: null,
            source: 'miss',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 0,
                cacheSampleKeys: [],
            },
        })

        const result = await handlePause(
            {} as any,
            { id: 'cmd-2', guildId: 'guild-1', data: {} } as any,
        )

        expect(result.success).toBe(false)
        expect(result.error).toBe('No active queue')
        expect(publishStateMock).not.toHaveBeenCalled()
    })
})
