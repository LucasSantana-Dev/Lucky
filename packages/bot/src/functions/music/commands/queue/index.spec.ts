import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import queueCommand from './index'

const debugLogMock = jest.fn()
const errorLogMock = jest.fn()
const requireGuildMock = jest.fn()
const requireQueueMock = jest.fn()
const createQueueEmbedMock = jest.fn()
const createQueueErrorEmbedMock = jest.fn()
const createErrorEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'error',
    title,
    message,
}))
const successEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'success',
    title,
    message,
}))
const warningEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'warning',
    title,
    message,
}))
const interactionReplyMock = jest.fn()
const smartShuffleQueueMock = jest.fn()
const rescueQueueMock = jest.fn()
const resolveGuildQueueMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('../../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
}))

jest.mock('./queueEmbed', () => ({
    createQueueEmbed: (...args: unknown[]) => createQueueEmbedMock(...args),
    createQueueErrorEmbed: (...args: unknown[]) =>
        createQueueErrorEmbedMock(...args),
}))

jest.mock('../../../../utils/general/embeds', () => ({
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
    successEmbed: (...args: unknown[]) => successEmbedMock(...args),
    warningEmbed: (...args: unknown[]) => warningEmbedMock(...args),
}))

jest.mock('../../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../../utils/music/queueManipulation', () => ({
    smartShuffleQueue: (...args: unknown[]) => smartShuffleQueueMock(...args),
    rescueQueue: (...args: unknown[]) => rescueQueueMock(...args),
}))

jest.mock('../../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

function createInteraction(action: string | null) {
    return {
        guildId: 'guild-1',
        options: {
            getString: jest.fn(() => action),
        },
        deferReply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
    } as any
}

function createClient() {
    return {} as any
}

describe('queue command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
        smartShuffleQueueMock.mockResolvedValue(true)
        rescueQueueMock.mockResolvedValue({
            removedTracks: 1,
            keptTracks: 4,
            addedTracks: 2,
        })
        createQueueEmbedMock.mockResolvedValue({
            embed: { id: 'queue-embed' },
            components: [],
        })
        createQueueErrorEmbedMock.mockReturnValue({ id: 'queue-error' })
    })

    it('returns when guild validation fails', async () => {
        requireGuildMock.mockResolvedValue(false)
        const queue = { tracks: { size: 0 } }
        resolveGuildQueueMock.mockReturnValue({ queue })

        await queueCommand.execute({
            client: createClient(),
            interaction: createInteraction('show'),
        } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('warns when smartshuffle is requested with short queue', async () => {
        const queue = { tracks: { size: 1 } }
        resolveGuildQueueMock.mockReturnValue({ queue })

        await queueCommand.execute({
            client: createClient(),
            interaction: createInteraction('smartshuffle'),
        } as any)

        expect(warningEmbedMock).toHaveBeenCalledWith(
            'Queue too short',
            'Need at least 2 queued tracks for smart shuffle.',
        )
    })

    it('runs smartshuffle and returns success response', async () => {
        const queue = { tracks: { size: 3 } }
        resolveGuildQueueMock.mockReturnValue({ queue })

        await queueCommand.execute({
            client: createClient(),
            interaction: createInteraction('smartshuffle'),
        } as any)

        expect(smartShuffleQueueMock).toHaveBeenCalledWith(queue)
        expect(successEmbedMock).toHaveBeenCalledWith(
            'Smart shuffle complete',
            'Queue reordered with requester fairness and momentum.',
        )
    })

    it('runs rescue and returns counts', async () => {
        const queue = { tracks: { size: 3 } }
        resolveGuildQueueMock.mockReturnValue({ queue })

        await queueCommand.execute({
            client: createClient(),
            interaction: createInteraction('rescue'),
        } as any)

        expect(rescueQueueMock).toHaveBeenCalledWith(queue, {
            probeResolvable: true,
        })
        expect(successEmbedMock).toHaveBeenCalledWith(
            'Queue rescue complete',
            expect.stringContaining('Removed 1 broken track(s)'),
        )
    })

    it('shows queue embed for default action', async () => {
        const queue = { tracks: { size: 3 } }
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = createInteraction('show')

        await queueCommand.execute({
            client: createClient(),
            interaction,
        } as any)

        expect(createQueueEmbedMock).toHaveBeenCalledWith(queue)
        expect(debugLogMock).toHaveBeenCalled()
        expect(interaction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({ embeds: [{ id: 'queue-embed' }] }),
        )
    })

    it('returns queue error embed when execution throws', async () => {
        const queue = { tracks: { size: 3 } }
        resolveGuildQueueMock.mockReturnValue({ queue })
        createQueueEmbedMock.mockRejectedValue(new Error('boom'))
        const interaction = createInteraction('show')

        await queueCommand.execute({
            client: createClient(),
            interaction,
        } as any)

        expect(errorLogMock).toHaveBeenCalled()
        expect(interaction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({
                embeds: [expect.objectContaining({ id: 'queue-error' })],
            }),
        )
    })

    it('logs error and replies with error embed when smartShuffle throws', async () => {
        const queue = { tracks: { size: 3 } }
        resolveGuildQueueMock.mockReturnValue({ queue })
        smartShuffleQueueMock.mockRejectedValue(new Error('shuffle failed'))
        const interaction = createInteraction('smartshuffle')

        await queueCommand.execute({
            client: createClient(),
            interaction,
        } as any)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Error in queue command' }),
        )
        expect(interaction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({
                embeds: [expect.objectContaining({ id: 'queue-error' })],
            }),
        )
    })

    it('logs error and replies with error embed when rescueQueue throws', async () => {
        const queue = { tracks: { size: 3 } }
        resolveGuildQueueMock.mockReturnValue({ queue })
        rescueQueueMock.mockRejectedValue(new Error('rescue failed'))
        const interaction = createInteraction('rescue')

        await queueCommand.execute({
            client: createClient(),
            interaction,
        } as any)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Error in queue command' }),
        )
        expect(interaction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({
                embeds: [expect.objectContaining({ id: 'queue-error' })],
            }),
        )
    })
})
