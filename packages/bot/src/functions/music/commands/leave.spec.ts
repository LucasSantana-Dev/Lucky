import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import leaveCommand from './leave'

const requireGuildMock = jest.fn()
const requireQueueMock = jest.fn()
const interactionReplyMock = jest.fn()
const createSuccessEmbedMock = jest.fn()
const createErrorEmbedMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const markIntentionalStopMock = jest.fn()
const infoLogMock = jest.fn()
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('../../../utils/music/watchdog', () => ({
    musicWatchdogService: {
        markIntentionalStop: (...args: unknown[]) =>
            markIntentionalStopMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

function createInteraction(guildId = 'guild-1') {
    return { guildId, user: { tag: 'User#0001' } } as any
}

function createQueue(guildId = 'guild-1') {
    return {
        guild: { id: guildId },
        delete: jest.fn(),
    }
}

describe('leave command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        interactionReplyMock.mockResolvedValue(undefined)
        createSuccessEmbedMock.mockReturnValue({ title: 'Goodbye!' })
    })

    it('marks intentional stop and deletes queue', async () => {
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })
        requireQueueMock.mockResolvedValue(true)

        await leaveCommand.execute({
            interaction: createInteraction(),
            client: {} as any,
        })

        expect(markIntentionalStopMock).toHaveBeenCalledWith('guild-1')
        expect(queue.delete).toHaveBeenCalled()
    })

    it('calls markIntentionalStop before queue.delete', async () => {
        const queue = createQueue()
        const callOrder: string[] = []
        markIntentionalStopMock.mockImplementation(() => callOrder.push('mark'))
        queue.delete.mockImplementation(() => callOrder.push('delete'))
        resolveGuildQueueMock.mockReturnValue({ queue })
        requireQueueMock.mockResolvedValue(true)

        await leaveCommand.execute({
            interaction: createInteraction(),
            client: {} as any,
        })

        expect(callOrder).toEqual(['mark', 'delete'])
    })

    it('replies with success embed after leaving', async () => {
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })
        requireQueueMock.mockResolvedValue(true)

        await leaveCommand.execute({
            interaction: createInteraction(),
            client: {} as any,
        })

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({ embeds: expect.any(Array) }),
            }),
        )
    })

    it('returns early when guild check fails', async () => {
        requireGuildMock.mockResolvedValue(false)

        await leaveCommand.execute({
            interaction: createInteraction(),
            client: {} as any,
        })

        expect(markIntentionalStopMock).not.toHaveBeenCalled()
    })

    it('returns early when queue check fails', async () => {
        resolveGuildQueueMock.mockReturnValue({ queue: null })
        requireQueueMock.mockResolvedValue(false)

        await leaveCommand.execute({
            interaction: createInteraction(),
            client: {} as any,
        })

        expect(markIntentionalStopMock).not.toHaveBeenCalled()
    })

    it('replies error embed when queue.delete throws', async () => {
        const queue = createQueue()
        queue.delete.mockImplementation(() => {
            throw new Error('delete failed')
        })
        resolveGuildQueueMock.mockReturnValue({ queue })
        requireQueueMock.mockResolvedValue(true)
        createErrorEmbedMock.mockReturnValue({ title: 'Error' })

        await leaveCommand.execute({
            interaction: createInteraction(),
            client: {} as any,
        })

        expect(errorLogMock).toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({ ephemeral: true }),
            }),
        )
    })
})
