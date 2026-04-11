import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import autoplayCommand from './autoplay'

const interactionReplyMock = jest.fn()
const createEmbedMock = jest.fn((payload: unknown) => payload)
const createErrorEmbedMock = jest.fn((title: string, desc: string) => ({
    title,
    description: desc,
}))
const replenishQueueMock = jest.fn()
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()
const resolveGuildQueueMock = jest.fn()

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createEmbed: (payload: unknown) => createEmbedMock(payload),
    createErrorEmbed: (title: string, desc: string) =>
        createErrorEmbedMock(title, desc),
    EMBED_COLORS: {
        AUTOPLAY: '#00BFFF',
        ERROR: '#FF0000',
    },
    EMOJIS: {
        AUTOPLAY: '🔄',
        ERROR: '❌',
    },
}))

jest.mock('../../../utils/music/trackManagement/queueOperations', () => ({
    replenishQueue: (...args: unknown[]) => replenishQueueMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

function createInteraction(subcommand = 'skip') {
    const interaction = {
        guildId: 'guild-1',
        deferred: false,
        replied: false,
        user: { id: 'user-1' },
        deferReply: jest.fn(async () => {
            interaction.deferred = true
        }),
        options: {
            getSubcommand: jest.fn(() => subcommand),
        },
    }

    return interaction as any
}

function createQueue() {
    return {
        guild: { id: 'guild-1' },
        currentTrack: { title: 'Current Song' },
        tracks: {
            size: 3,
            at: jest.fn((index: number) => {
                if (index === 0)
                    return {
                        metadata: { isAutoplay: true },
                        title: 'Autoplay 1',
                    }
                if (index === 1)
                    return { metadata: { isAutoplay: false }, title: 'Manual' }
                if (index === 2)
                    return {
                        metadata: { isAutoplay: true },
                        title: 'Autoplay 2',
                    }
                return null
            }),
        },
        removeTrack: jest.fn(),
    } as any
}

function createClient() {
    return {
        user: { id: 'bot-1' },
    } as any
}

describe('autoplay command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('structure', () => {
        it('should have correct name and description', () => {
            expect(autoplayCommand.data.name).toBe('autoplay')
            expect(autoplayCommand.data.description).toContain(
                'Manage autoplay',
            )
        })

        it('should have three subcommands', () => {
            const builder = autoplayCommand.data
            const options = (builder as any).options || []
            expect(options.length).toBeGreaterThanOrEqual(3)
        })
    })

    describe('skip subcommand', () => {
        it('should skip first autoplay track and replenish', async () => {
            const interaction = createInteraction('skip')
            const queue = createQueue()
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue })
            replenishQueueMock.mockResolvedValue(undefined)

            await autoplayCommand.execute({ client, interaction } as any)

            expect(interaction.deferReply).toHaveBeenCalled()
            expect(queue.removeTrack).toHaveBeenCalledWith(0)
            expect(replenishQueueMock).toHaveBeenCalledWith(queue)
            expect(interactionReplyMock).toHaveBeenCalled()
        })

        it('should handle empty queue gracefully', async () => {
            const interaction = createInteraction('skip')
            const queue = createQueue()
            queue.tracks.size = 0
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue })

            await autoplayCommand.execute({ client, interaction } as any)

            expect(createErrorEmbedMock).toHaveBeenCalledWith(
                'Queue Empty',
                expect.anything(),
            )
        })
    })

    describe('clear subcommand', () => {
        it('should remove all autoplay tracks and replenish', async () => {
            const interaction = createInteraction('clear')
            const queue = createQueue()
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue })
            replenishQueueMock.mockResolvedValue(undefined)

            await autoplayCommand.execute({ client, interaction } as any)

            expect(queue.removeTrack).toHaveBeenCalledTimes(2)
            expect(replenishQueueMock).toHaveBeenCalledWith(queue)
            expect(interactionReplyMock).toHaveBeenCalled()
        })

        it('should handle no autoplay tracks gracefully', async () => {
            const interaction = createInteraction('clear')
            const queue = createQueue()
            queue.tracks.at = jest.fn(() => ({
                metadata: { isAutoplay: false },
            }))
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue })

            await autoplayCommand.execute({ client, interaction } as any)

            expect(createErrorEmbedMock).toHaveBeenCalledWith(
                'No Autoplay Tracks',
                expect.anything(),
            )
        })
    })

    describe('status subcommand', () => {
        it('should show autoplay status', async () => {
            const interaction = createInteraction('status')
            const queue = createQueue()
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue })

            await autoplayCommand.execute({ client, interaction } as any)

            expect(createEmbedMock).toHaveBeenCalled()
            const embed = createEmbedMock.mock.calls[0][0]
            expect(embed.title).toContain('Status')
            expect(interactionReplyMock).toHaveBeenCalled()
        })
    })

    describe('error handling', () => {
        it('should handle unknown interaction error gracefully', async () => {
            const interaction = createInteraction('skip')
            const error = { code: 10062 }
            interaction.deferReply = jest.fn(async () => {
                throw error
            })
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue: null })

            await autoplayCommand.execute({ client, interaction } as any)

            expect(interactionReplyMock).not.toHaveBeenCalled()
        })

        it('should reply with error when no queue exists', async () => {
            const interaction = createInteraction('skip')
            const client = createClient()

            resolveGuildQueueMock.mockReturnValue({ queue: null })

            await autoplayCommand.execute({ client, interaction } as any)

            expect(createErrorEmbedMock).toHaveBeenCalledWith(
                'No Active Queue',
                expect.anything(),
            )
        })
    })
})
