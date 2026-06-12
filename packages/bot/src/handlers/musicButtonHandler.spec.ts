import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { MUSIC_BUTTON_IDS } from '../types/musicButtons'

const resolveGuildQueueMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('../utils/general/embeds', () => ({
    createErrorEmbed: (title: string, description: string) => ({
        title,
        description,
    }),
}))

jest.mock('../utils/music/buttonComponents', () => ({
    createMusicControlButtons: jest.fn(() => ({})),
    createMusicActionButtons: jest.fn(() => ({})),
    createLeaderboardPaginationButtons: jest.fn(() => null),
}))

jest.mock('../functions/music/commands/queue/queueEmbed', () => ({
    createQueueEmbed: jest.fn(),
}))

jest.mock('../utils/music/queueManipulation', () => ({
    shuffleQueue: jest.fn(),
}))

jest.mock('../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    levelService: { getLeaderboard: jest.fn() },
}))

jest.mock('../utils/music/replenishSuppressionStore', () => ({
    setReplenishSuppressed: jest.fn(),
}))

import { handleMusicButtonInteraction } from './musicButtonHandler'

function createInteraction(customId: string) {
    return {
        customId,
        guildId: '111111111111111111',
        client: {},
        member: { voice: { channel: {} } },
        deferred: true,
        replied: false,
        deferUpdate: jest.fn<() => Promise<void>>().mockResolvedValue(),
        followUp: jest.fn<() => Promise<void>>().mockResolvedValue(),
        editReply: jest.fn<() => Promise<void>>().mockResolvedValue(),
    }
}

function createQueue(overrides: Record<string, unknown> = {}) {
    return {
        history: {
            previousTrack: null,
            back: jest.fn<() => Promise<void>>().mockResolvedValue(),
        },
        ...overrides,
    }
}

describe('handleMusicButtonInteraction — previous button (#1191)', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('tells the user when there is no previous track instead of erroring', async () => {
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue, source: 'player' })
        const interaction = createInteraction(MUSIC_BUTTON_IDS.PREVIOUS)

        await handleMusicButtonInteraction(interaction as never)

        expect(interaction.followUp).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining('No previous track'),
                ephemeral: true,
            }),
        )
        expect(queue.history.back).not.toHaveBeenCalled()
        expect(interaction.editReply).not.toHaveBeenCalled()
    })

    it('goes back when a previous track exists', async () => {
        const queue = createQueue()
        queue.history.previousTrack = { id: 't1' } as never
        resolveGuildQueueMock.mockReturnValue({ queue, source: 'player' })
        const interaction = createInteraction(MUSIC_BUTTON_IDS.PREVIOUS)

        await handleMusicButtonInteraction(interaction as never)

        expect(queue.history.back).toHaveBeenCalledTimes(1)
        expect(interaction.followUp).not.toHaveBeenCalled()
    })

    it('surfaces an error embed when the queue op throws (no silent desync)', async () => {
        const queue = createQueue()
        queue.history.previousTrack = { id: 't1' } as never
        queue.history.back.mockRejectedValue(new Error('voice connection lost'))
        resolveGuildQueueMock.mockReturnValue({ queue, source: 'player' })
        const interaction = createInteraction(MUSIC_BUTTON_IDS.PREVIOUS)

        await handleMusicButtonInteraction(interaction as never)

        expect(interaction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({
                embeds: [expect.objectContaining({ title: 'Error' })],
            }),
        )
    })
})
