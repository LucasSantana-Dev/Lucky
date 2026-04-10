import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { handleMusicButtonInteraction } from './musicButtonHandler'
import {
    MUSIC_BUTTON_IDS,
    QUEUE_BUTTON_PREFIX,
    LEADERBOARD_BUTTON_PREFIX,
} from '../types/musicButtons'

const errorLogMock = jest.fn()
const debugLogMock = jest.fn()
const createErrorEmbedMock = jest.fn((title: string, desc: string) => ({
    title,
    desc,
}))
const createMusicControlButtonsMock = jest.fn(() => ({ type: 1 }))
const createQueueEmbedMock = jest.fn()
const shuffleQueueMock = jest.fn()
const resolveGuildQueueMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    debugLog: (...args: unknown[]) => debugLogMock(...args),
}))

jest.mock('../utils/general/embeds', () => ({
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
}))

const createLeaderboardPaginationButtonsMock = jest.fn()

jest.mock('../utils/music/buttonComponents', () => ({
    createMusicControlButtons: (...args: unknown[]) =>
        createMusicControlButtonsMock(...args),
    createLeaderboardPaginationButtons: (...args: unknown[]) =>
        createLeaderboardPaginationButtonsMock(...args),
}))

jest.mock('../functions/music/commands/queue/queueEmbed', () => ({
    createQueueEmbed: (...args: unknown[]) => createQueueEmbedMock(...args),
}))

jest.mock('../utils/music/queueManipulation', () => ({
    shuffleQueue: (...args: unknown[]) => shuffleQueueMock(...args),
}))

jest.mock('../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

const buildListPageEmbedMock = jest.fn(() => ({
    toJSON: () => ({ type: 'embed' }),
}))

jest.mock('../utils/general/responseEmbeds', () => ({
    buildListPageEmbed: (...args: unknown[]) => buildListPageEmbedMock(...args),
}))

const getLeaderboardMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    levelService: {
        getLeaderboard: (...args: unknown[]) => getLeaderboardMock(...args),
    },
}))

jest.mock('discord-player', () => ({
    QueueRepeatMode: { OFF: 0, TRACK: 1, QUEUE: 2, AUTOPLAY: 3 },
}))

function createInteraction(
    customId: string,
    options: {
        hasVoice?: boolean
        replied?: boolean
        deferred?: boolean
    } = {},
) {
    const { hasVoice = true, replied = false, deferred = false } = options
    return {
        customId,
        guildId: 'guild-1',
        client: { player: {} },
        replied,
        deferred,
        member: { voice: { channel: hasVoice ? { id: 'vc-1' } : null } },
        reply: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
        followUp: jest.fn().mockResolvedValue(undefined),
        deferUpdate: jest.fn().mockResolvedValue(undefined),
    }
}

function createMockQueue(
    options: {
        isPaused?: boolean
        repeatMode?: number
        historySize?: number
    } = {},
) {
    const { isPaused = false, repeatMode = 0, historySize = 0 } = options
    return {
        node: {
            isPaused: jest.fn(() => isPaused),
            resume: jest.fn(),
            pause: jest.fn(),
            skip: jest.fn(),
        },
        history: {
            back: jest.fn().mockResolvedValue(undefined),
            tracks: { data: new Array(historySize).fill({}) },
        },
        tracks: { size: 3 },
        repeatMode,
        setRepeatMode: jest.fn(),
    }
}

describe('handleMusicButtonInteraction', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        createQueueEmbedMock.mockResolvedValue({ embed: {}, components: [] })
    })

    it('replies ephemeral error when member not in voice channel', async () => {
        const interaction = createInteraction(MUSIC_BUTTON_IDS.SKIP, {
            hasVoice: false,
        })
        resolveGuildQueueMock.mockReturnValue({ queue: createMockQueue() })

        await handleMusicButtonInteraction(interaction as never)

        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ ephemeral: true }),
        )
    })

    it('replies ephemeral error when no queue exists', async () => {
        const interaction = createInteraction(MUSIC_BUTTON_IDS.SKIP)
        resolveGuildQueueMock.mockReturnValue({ queue: null, source: 'miss' })

        await handleMusicButtonInteraction(interaction as never)

        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ ephemeral: true }),
        )
    })

    it('calls history.back() for PREVIOUS button', async () => {
        const queue = createMockQueue()
        const interaction = createInteraction(MUSIC_BUTTON_IDS.PREVIOUS)
        resolveGuildQueueMock.mockReturnValue({ queue, source: 'nodes.get' })

        await handleMusicButtonInteraction(interaction as never)

        expect(queue.history.back).toHaveBeenCalled()
        expect(interaction.deferUpdate).toHaveBeenCalled()
        expect(interaction.editReply).not.toHaveBeenCalled()
    })

    it('pauses when PAUSE_RESUME and queue is playing', async () => {
        const queue = createMockQueue({ isPaused: false })
        const interaction = createInteraction(MUSIC_BUTTON_IDS.PAUSE_RESUME)
        const buttons = { type: 1 }
        createMusicControlButtonsMock.mockReturnValue(buttons)
        resolveGuildQueueMock.mockReturnValue({ queue, source: 'nodes.get' })

        await handleMusicButtonInteraction(interaction as never)

        expect(queue.node.pause).toHaveBeenCalled()
        expect(createMusicControlButtonsMock).toHaveBeenCalledWith(queue)
        expect(interaction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({ components: [buttons] }),
        )
    })

    it('resumes when PAUSE_RESUME and queue is paused', async () => {
        const queue = createMockQueue({ isPaused: true })
        const interaction = createInteraction(MUSIC_BUTTON_IDS.PAUSE_RESUME)
        const buttons = { type: 1 }
        createMusicControlButtonsMock.mockReturnValue(buttons)
        resolveGuildQueueMock.mockReturnValue({ queue, source: 'nodes.get' })

        await handleMusicButtonInteraction(interaction as never)

        expect(queue.node.resume).toHaveBeenCalled()
        expect(createMusicControlButtonsMock).toHaveBeenCalledWith(queue)
        expect(interaction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({ components: [buttons] }),
        )
    })

    it('skips track for SKIP button', async () => {
        const queue = createMockQueue()
        const interaction = createInteraction(MUSIC_BUTTON_IDS.SKIP)
        resolveGuildQueueMock.mockReturnValue({ queue, source: 'nodes.get' })

        await handleMusicButtonInteraction(interaction as never)

        expect(queue.node.skip).toHaveBeenCalled()
        expect(interaction.deferUpdate).toHaveBeenCalled()
        expect(interaction.editReply).not.toHaveBeenCalled()
    })

    it('shuffles queue for SHUFFLE button', async () => {
        const queue = createMockQueue()
        const interaction = createInteraction(MUSIC_BUTTON_IDS.SHUFFLE)
        resolveGuildQueueMock.mockReturnValue({ queue, source: 'nodes.get' })

        await handleMusicButtonInteraction(interaction as never)

        expect(shuffleQueueMock).toHaveBeenCalledWith(queue)
        expect(interaction.deferUpdate).toHaveBeenCalled()
        expect(interaction.editReply).not.toHaveBeenCalled()
    })

    it('cycles loop mode for LOOP button', async () => {
        const queue = createMockQueue({ repeatMode: 0 })
        const interaction = createInteraction(MUSIC_BUTTON_IDS.LOOP)
        resolveGuildQueueMock.mockReturnValue({ queue, source: 'nodes.get' })

        await handleMusicButtonInteraction(interaction as never)

        expect(queue.setRepeatMode).toHaveBeenCalledWith(1)
        expect(interaction.followUp).toHaveBeenCalledWith(
            expect.objectContaining({ ephemeral: true }),
        )
    })

    it('handles queue page button', async () => {
        const queue = createMockQueue()
        const interaction = createInteraction(`${QUEUE_BUTTON_PREFIX}_2`)
        const embed = { title: 'Queue' }
        const components = [{ type: 1 }]
        createQueueEmbedMock.mockResolvedValue({ embed, components })
        resolveGuildQueueMock.mockReturnValue({ queue, source: 'nodes.get' })

        await handleMusicButtonInteraction(interaction as never)

        expect(createQueueEmbedMock).toHaveBeenCalledWith(queue, undefined, 2)
        expect(interaction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({ embeds: [embed], components }),
        )
    })

    it('logs error and replies on unexpected exception', async () => {
        const interaction = createInteraction(MUSIC_BUTTON_IDS.SKIP, {
            replied: false,
        })
        resolveGuildQueueMock.mockImplementation(() => {
            throw new Error('boom')
        })

        await handleMusicButtonInteraction(interaction as never)

        expect(errorLogMock).toHaveBeenCalled()
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ ephemeral: true }),
        )
    })

    it('uses resolver-backed queue lookup so music buttons still work after queue cache fallback', async () => {
        const queue = createMockQueue({ isPaused: false })
        const interaction = createInteraction(MUSIC_BUTTON_IDS.PAUSE_RESUME)
        resolveGuildQueueMock.mockReturnValue({
            queue,
            source: 'cache.guild',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 1,
                cacheSampleKeys: ['queue-1'],
            },
        })

        await handleMusicButtonInteraction(interaction as never)

        expect(resolveGuildQueueMock).toHaveBeenCalledWith(
            interaction.client,
            'guild-1',
        )
        expect(queue.node.pause).toHaveBeenCalled()
        expect(interaction.editReply).toHaveBeenCalled()
    })

    describe('leaderboard page button', () => {
        const fakeEntries = Array.from({ length: 7 }, (_, i) => ({
            userId: `user-${i}`,
            level: i + 1,
            xp: (i + 1) * 100,
        }))

        beforeEach(() => {
            resolveGuildQueueMock.mockReturnValue({
                queue: createMockQueue(),
                source: 'nodes.get',
            })
            buildListPageEmbedMock.mockReturnValue({
                data: { title: 'XP Leaderboard' },
            })
            createLeaderboardPaginationButtonsMock.mockReturnValue(null)
        })

        it('renders page 0 and calls buildListPageEmbed with correct args', async () => {
            getLeaderboardMock.mockResolvedValue(fakeEntries)
            const interaction = createInteraction(
                `${LEADERBOARD_BUTTON_PREFIX}_0`,
            )

            await handleMusicButtonInteraction(interaction as never)

            expect(getLeaderboardMock).toHaveBeenCalledWith('guild-1', 50)
            expect(buildListPageEmbedMock).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: '#1',
                        value: expect.stringContaining('user-0'),
                    }),
                ]),
                1,
                expect.objectContaining({
                    title: 'XP Leaderboard',
                    itemsPerPage: 5,
                }),
            )
            expect(interaction.editReply).toHaveBeenCalled()
        })

        it('includes pagination row when createLeaderboardPaginationButtons returns a row', async () => {
            getLeaderboardMock.mockResolvedValue(fakeEntries)
            const paginationRow = { type: 1, components: [] }
            createLeaderboardPaginationButtonsMock.mockReturnValue(
                paginationRow,
            )
            const interaction = createInteraction(
                `${LEADERBOARD_BUTTON_PREFIX}_0`,
            )

            await handleMusicButtonInteraction(interaction as never)

            expect(interaction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    components: [paginationRow],
                }),
            )
        })

        it('shows error embed and empty components when leaderboard is empty', async () => {
            getLeaderboardMock.mockResolvedValue([])
            const interaction = createInteraction(
                `${LEADERBOARD_BUTTON_PREFIX}_0`,
            )

            await handleMusicButtonInteraction(interaction as never)

            expect(interaction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({ components: [] }),
            )
            expect(createErrorEmbedMock).toHaveBeenCalledWith(
                'Leaderboard',
                'No XP recorded yet.',
            )
        })

        it('does nothing when customId has no page number', async () => {
            const interaction = createInteraction('leaderboard_page_')

            await handleMusicButtonInteraction(interaction as never)

            expect(getLeaderboardMock).not.toHaveBeenCalled()
        })
    })
})
