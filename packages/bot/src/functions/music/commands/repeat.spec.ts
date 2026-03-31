import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import repeatCommand, { guildRepeatCounts } from './repeat'

const QueueRepeatMode = {
    OFF: 0,
    TRACK: 1,
    QUEUE: 2,
    AUTOPLAY: 3,
} as const

const requireQueueMock = jest.fn()
const interactionReplyMock = jest.fn()
const successEmbedMock = jest.fn((title: string, desc?: string) => ({
    title,
    description: desc,
}))
const resolveGuildQueueMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    successEmbed: (...args: unknown[]) => successEmbedMock(...args),
}))

jest.mock('discord-player', () => ({
    QueueRepeatMode: {
        OFF: 0,
        TRACK: 1,
        QUEUE: 2,
        AUTOPLAY: 3,
    },
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

function createInteraction(
    mode: string,
    times: number | null = null,
    guildId = 'guild-1',
) {
    return {
        guildId,
        user: { id: 'user-1' },
        options: {
            getString: jest.fn((name: string) => {
                if (name === 'mode') return mode
            }),
            getInteger: jest.fn((name: string) => {
                if (name === 'times') return times
            }),
        },
    } as any
}

function createQueue(repeatMode = QueueRepeatMode.OFF) {
    return {
        guild: { id: 'guild-1' },
        repeatMode,
        currentTrack: { title: 'Song A' },
        tracks: { size: 5 },
        setRepeatMode: jest.fn(),
    } as any
}

function createClient() {
    return {
        player: {
            nodes: {
                get: jest.fn(),
            },
        },
    } as any
}

describe('repeat command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        guildRepeatCounts.clear()
        requireQueueMock.mockResolvedValue(true)
    })

    it('turns off repeat mode', async () => {
        const queue = createQueue()
        const client = createClient()
        const interaction = createInteraction('off')
        resolveGuildQueueMock.mockReturnValue({ queue })

        await repeatCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.setRepeatMode).toHaveBeenCalledWith(QueueRepeatMode.OFF)
        expect(successEmbedMock).toHaveBeenCalledWith(
            '🔁 Repeat mode',
            'Repeat **turned off**',
        )
    })

    it('sets repeat mode to track infinitely', async () => {
        const queue = createQueue()
        const client = createClient()
        const interaction = createInteraction('track', null)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await repeatCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.setRepeatMode).toHaveBeenCalledWith(QueueRepeatMode.TRACK)
        expect(successEmbedMock).toHaveBeenCalledWith(
            '🔁 Repeat mode',
            'Repeating current song **infinitely**',
        )
        expect(guildRepeatCounts.has('guild-1')).toBe(false)
    })

    it('sets repeat mode to track N times', async () => {
        const queue = createQueue()
        const client = createClient()
        const interaction = createInteraction('track', 5)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await repeatCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.setRepeatMode).toHaveBeenCalledWith(QueueRepeatMode.TRACK)
        expect(successEmbedMock).toHaveBeenCalledWith(
            '🔁 Repeat mode',
            'Repeating current song **5 times**',
        )
        expect(guildRepeatCounts.get('guild-1')).toEqual({
            count: 5,
            originalMode: QueueRepeatMode.TRACK,
        })
    })

    it('sets repeat mode to queue infinitely', async () => {
        const queue = createQueue()
        const client = createClient()
        const interaction = createInteraction('queue', null)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await repeatCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.setRepeatMode).toHaveBeenCalledWith(QueueRepeatMode.QUEUE)
        expect(successEmbedMock).toHaveBeenCalledWith(
            '🔁 Repeat mode',
            'Repeating queue **infinitely**',
        )
    })

    it('sets repeat mode to queue N times', async () => {
        const queue = createQueue()
        const client = createClient()
        const interaction = createInteraction('queue', 3)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await repeatCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.setRepeatMode).toHaveBeenCalledWith(QueueRepeatMode.QUEUE)
        expect(successEmbedMock).toHaveBeenCalledWith(
            '🔁 Repeat mode',
            'Repeating queue **3 times**',
        )
        expect(guildRepeatCounts.get('guild-1')).toEqual({
            count: 3,
            originalMode: QueueRepeatMode.QUEUE,
        })
    })

    it('sets repeat mode to infinite autoplay', async () => {
        const queue = createQueue()
        const client = createClient()
        const interaction = createInteraction('infinite')
        resolveGuildQueueMock.mockReturnValue({ queue })

        await repeatCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.setRepeatMode).toHaveBeenCalledWith(
            QueueRepeatMode.AUTOPLAY,
        )
        expect(successEmbedMock).toHaveBeenCalledWith(
            '🔁 Repeat mode',
            '**Infinite** repeat activated (continuous autoplay)',
        )
    })

    it('returns early when queue validation fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        const queue = createQueue()
        const client = createClient()
        const interaction = createInteraction('off')
        resolveGuildQueueMock.mockReturnValue({ queue })

        await repeatCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.setRepeatMode).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('clears previous repeat count when changing modes', async () => {
        const queue = createQueue()
        const client = createClient()
        guildRepeatCounts.set('guild-1', {
            count: 5,
            originalMode: QueueRepeatMode.TRACK,
        })

        const interaction = createInteraction('queue', 3)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await repeatCommand.execute({
            client,
            interaction,
        } as any)

        expect(guildRepeatCounts.get('guild-1')).toEqual({
            count: 3,
            originalMode: QueueRepeatMode.QUEUE,
        })
    })

    it('defaults to off mode when invalid mode is provided', async () => {
        const queue = createQueue()
        const client = createClient()
        const interaction = createInteraction('invalid')
        resolveGuildQueueMock.mockReturnValue({ queue })

        await repeatCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.setRepeatMode).toHaveBeenCalledWith(QueueRepeatMode.OFF)
        expect(successEmbedMock).toHaveBeenCalledWith(
            '🔁 Repeat mode',
            'Repeat **turned off**',
        )
    })

    it('handles track repeat with minimum repeat count', async () => {
        const queue = createQueue()
        const client = createClient()
        const interaction = createInteraction('track', 1)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await repeatCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.setRepeatMode).toHaveBeenCalledWith(QueueRepeatMode.TRACK)
        expect(successEmbedMock).toHaveBeenCalledWith(
            '🔁 Repeat mode',
            'Repeating current song **infinitely**',
        )
        expect(guildRepeatCounts.has('guild-1')).toBe(false)
    })

    it('handles track repeat with maximum repeat count', async () => {
        const queue = createQueue()
        const client = createClient()
        const interaction = createInteraction('track', 100)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await repeatCommand.execute({
            client,
            interaction,
        } as any)

        expect(guildRepeatCounts.get('guild-1')).toEqual({
            count: 100,
            originalMode: QueueRepeatMode.TRACK,
        })
    })

    it('does not store repeat count for infinite modes', async () => {
        const queue = createQueue()
        const client = createClient()
        const interaction = createInteraction('track', null)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await repeatCommand.execute({
            client,
            interaction,
        } as any)

        expect(guildRepeatCounts.has('guild-1')).toBe(false)
    })

    it('does not store repeat count for off mode', async () => {
        const queue = createQueue()
        const client = createClient()
        const interaction = createInteraction('off')
        resolveGuildQueueMock.mockReturnValue({ queue })

        await repeatCommand.execute({
            client,
            interaction,
        } as any)

        expect(guildRepeatCounts.has('guild-1')).toBe(false)
    })
})
