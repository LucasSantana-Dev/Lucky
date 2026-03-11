import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { handlePause } from './commandHandlers'

const publishStateMock = jest.fn()
const buildQueueStateMock = jest.fn()
const resolveGuildQueueMock = jest.fn()

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
            diagnostics: { guildId: 'guild-1', cacheSize: 1, cacheSampleKeys: [] },
        })

        const result = await handlePause(
            {} as any,
            { id: 'cmd-1', guildId: 'guild-1', data: {} } as any,
        )

        expect(resolveGuildQueueMock).toHaveBeenCalledWith(expect.anything(), 'guild-1')
        expect(pause).toHaveBeenCalled()
        expect(publishStateMock).toHaveBeenCalledWith({ guildId: 'guild-1' })
        expect(result.success).toBe(true)
    })

    it('returns failure when resolver misses queue', async () => {
        resolveGuildQueueMock.mockReturnValue({
            queue: null,
            source: 'miss',
            diagnostics: { guildId: 'guild-1', cacheSize: 0, cacheSampleKeys: [] },
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
