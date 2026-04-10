import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import volumeCommand from './volume'

const requireGuildMock = jest.fn()
const requireDJRoleMock = jest.fn()
const requireQueueMock = jest.fn()
const requireCurrentTrackMock = jest.fn()
const requireIsPlayingMock = jest.fn()
const interactionReplyMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const createSuccessEmbedMock = jest.fn((title: string, desc?: string) => ({ title, description: desc }))
const createErrorEmbedMock = jest.fn((title: string, desc?: string) => ({ title, description: desc }))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
    requireCurrentTrack: (...args: unknown[]) => requireCurrentTrackMock(...args),
    requireIsPlaying: (...args: unknown[]) => requireIsPlayingMock(...args),
    requireDJRole: (...args: unknown[]) => requireDJRoleMock(...args)
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

function createQueue(volume = 50) {
    return {
        node: {
            volume,
            setVolume: jest.fn(),
        },
    } as any
}

function makeInteraction(value: number | null = null) {
    return {
        guildId: 'guild-1',
        options: {
            getInteger: jest.fn().mockReturnValue(value),
        },
    } as any
}

describe('volume command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        requireDJRoleMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
        requireCurrentTrackMock.mockResolvedValue(true)
        requireIsPlayingMock.mockResolvedValue(true)
    })

    it('has correct command name', () => {
        expect(volumeCommand.data.name).toBe('volume')
    })

    it('returns early when guild validation fails', async () => {
        requireGuildMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({ queue: createQueue() })

        await volumeCommand.execute({ client: {} as any, interaction: makeInteraction() } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when queue validation fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({ queue: createQueue() })

        await volumeCommand.execute({ client: {} as any, interaction: makeInteraction() } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when no current track', async () => {
        requireCurrentTrackMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({ queue: createQueue() })

        await volumeCommand.execute({ client: {} as any, interaction: makeInteraction() } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('shows current volume when no value provided', async () => {
        const queue = createQueue(75)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await volumeCommand.execute({ client: {} as any, interaction: makeInteraction(null) } as any)

        expect(createSuccessEmbedMock).toHaveBeenCalledWith('Current volume', expect.stringContaining('75%'))
        expect(queue.node.setVolume).not.toHaveBeenCalled()
    })

    it('sets volume to valid value', async () => {
        const queue = createQueue(50)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await volumeCommand.execute({ client: {} as any, interaction: makeInteraction(80) } as any)

        expect(queue.node.setVolume).toHaveBeenCalledWith(80)
        expect(createSuccessEmbedMock).toHaveBeenCalledWith('Volume changed', expect.stringContaining('80%'))
    })

    it('sets volume to maximum (200)', async () => {
        const queue = createQueue(50)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await volumeCommand.execute({ client: {} as any, interaction: makeInteraction(200) } as any)

        expect(queue.node.setVolume).toHaveBeenCalledWith(200)
    })

    it('rejects volume above 200', async () => {
        const queue = createQueue(50)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await volumeCommand.execute({ client: {} as any, interaction: makeInteraction(201) } as any)

        expect(createErrorEmbedMock).toHaveBeenCalledWith('Error', expect.stringContaining('between 1 and 200'))
        expect(queue.node.setVolume).not.toHaveBeenCalled()
    })

    it('rejects volume below 1', async () => {
        const queue = createQueue(50)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await volumeCommand.execute({ client: {} as any, interaction: makeInteraction(0) } as any)

        expect(createErrorEmbedMock).toHaveBeenCalledWith('Error', expect.stringContaining('between 1 and 200'))
    })
})
