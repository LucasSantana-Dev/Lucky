import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import stopCommand from './stop'

const requireQueueMock = jest.fn()
const requireDJRoleMock = jest.fn()
const interactionReplyMock = jest.fn()
const createSuccessEmbedMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const markIntentionalStopMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
    requireDJRole: (...args: unknown[]) => requireDJRoleMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
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

function createInteraction(guildId = 'guild-1') {
    return { guildId } as any
}

function createQueue(guildId = 'guild-1') {
    return {
        guild: { id: guildId },
        node: { stop: jest.fn() },
        clear: jest.fn(),
        delete: jest.fn(),
    }
}

describe('stop command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        interactionReplyMock.mockResolvedValue(undefined)
        createSuccessEmbedMock.mockReturnValue({ title: 'Playback stopped' })
        requireDJRoleMock.mockResolvedValue(true)
    })

    it('stops node, clears and deletes queue', async () => {
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })
        requireQueueMock.mockResolvedValue(true)

        await stopCommand.execute({
            interaction: createInteraction(),
            client: {} as any,
        })

        expect(markIntentionalStopMock).toHaveBeenCalledWith('guild-1')
        expect(queue.node.stop).toHaveBeenCalled()
        expect(queue.clear).toHaveBeenCalled()
        expect(queue.delete).toHaveBeenCalled()
    })

    it('calls stop, clear, delete in order', async () => {
        const queue = createQueue()
        const callOrder: string[] = []
        markIntentionalStopMock.mockImplementation(() => callOrder.push('mark'))
        queue.node.stop.mockImplementation(() => callOrder.push('stop'))
        queue.clear.mockImplementation(() => callOrder.push('clear'))
        queue.delete.mockImplementation(() => callOrder.push('delete'))
        resolveGuildQueueMock.mockReturnValue({ queue })
        requireQueueMock.mockResolvedValue(true)

        await stopCommand.execute({
            interaction: createInteraction(),
            client: {} as any,
        })

        expect(callOrder).toEqual(['mark', 'stop', 'clear', 'delete'])
    })

    it('replies with success embed after stopping', async () => {
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })
        requireQueueMock.mockResolvedValue(true)
        createSuccessEmbedMock.mockReturnValue({ title: 'Playback stopped' })

        await stopCommand.execute({
            interaction: createInteraction(),
            client: {} as any,
        })

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    embeds: expect.any(Array),
                }),
            }),
        )
    })

    it('returns early when queue check fails', async () => {
        resolveGuildQueueMock.mockReturnValue({ queue: null })
        requireQueueMock.mockResolvedValue(false)

        await stopCommand.execute({
            interaction: createInteraction(),
            client: {} as any,
        })

        expect(markIntentionalStopMock).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })
})
