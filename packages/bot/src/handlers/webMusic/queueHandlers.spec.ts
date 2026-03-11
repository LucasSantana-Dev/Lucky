import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
    handleImportPlaylist,
    handleQueueClear,
    handleQueueMove,
    handleQueueRemove,
} from './queueHandlers'

const publishStateMock = jest.fn()
const buildQueueStateMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
type QueueHandlerClient = Parameters<typeof handleQueueMove>[0]
type QueueHandlerCommand = Parameters<typeof handleQueueMove>[1]

jest.mock('@lucky/shared/services', () => ({
    musicControlService: {
        publishState: (...args: unknown[]) => publishStateMock(...args),
    },
}))

jest.mock('./mappers', () => ({
    buildQueueState: (...args: unknown[]) => buildQueueStateMock(...args),
}))

jest.mock('../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

type QueueHandlerCase = {
    name: string
    run: (
        _client: QueueHandlerClient,
        _cmd: QueueHandlerCommand,
    ) => Promise<{
        success: boolean
        error?: string
    }>
    data: Record<string, unknown>
    expectedError: string
}

const missCases: QueueHandlerCase[] = [
    {
        name: 'handleQueueMove',
        run: handleQueueMove,
        data: { from: 0, to: 1 },
        expectedError: 'No active queue',
    },
    {
        name: 'handleQueueRemove',
        run: handleQueueRemove,
        data: { index: 0 },
        expectedError: 'No active queue',
    },
    {
        name: 'handleQueueClear',
        run: handleQueueClear,
        data: {},
        expectedError: 'No active queue',
    },
    {
        name: 'handleImportPlaylist',
        run: handleImportPlaylist,
        data: { url: 'https://youtube.com/watch?v=123' },
        expectedError: 'No active queue. Start playing from Discord first.',
    },
]

function createCommand(data: Record<string, unknown>): QueueHandlerCommand {
    return {
        id: 'cmd-1',
        guildId: 'guild-1',
        userId: 'user-1',
        type: 'queue_clear',
        timestamp: Date.now(),
        data,
    }
}

function createClient(): QueueHandlerClient {
    return {
        player: {
            search: jest.fn(),
        },
    } as unknown as QueueHandlerClient
}

describe('web music queueHandlers queue resolution', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        buildQueueStateMock.mockResolvedValue({ guildId: 'guild-1' })
        resolveGuildQueueMock.mockReturnValue({
            queue: null,
            source: 'miss',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 0,
                cacheSampleKeys: [],
            },
        })
    })

    for (const testCase of missCases) {
        it(`returns queue miss error in ${testCase.name}`, async () => {
            const client = createClient()
            const result = await testCase.run(client, createCommand(testCase.data))

            expect(resolveGuildQueueMock).toHaveBeenCalledWith(client, 'guild-1')
            expect(result.success).toBe(false)
            expect(result.error).toBe(testCase.expectedError)
            expect(publishStateMock).not.toHaveBeenCalled()
        })
    }

    it('publishes state when queue clear resolves queue', async () => {
        const clear = jest.fn()
        const queue = {
            tracks: {
                clear,
            },
        }
        resolveGuildQueueMock.mockReturnValue({
            queue,
            source: 'cache.guild',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 1,
                cacheSampleKeys: ['guild-1'],
            },
        })

        const result = await handleQueueClear(
            createClient(),
            createCommand({}),
        )

        expect(clear).toHaveBeenCalled()
        expect(buildQueueStateMock).toHaveBeenCalled()
        expect(publishStateMock).toHaveBeenCalledWith({ guildId: 'guild-1' })
        expect(result.success).toBe(true)
    })
})
