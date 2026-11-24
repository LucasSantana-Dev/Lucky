import repeatCommand from './repeat'

const QueueRepeatMode = {
    OFF: 0,
    TRACK: 1,
    QUEUE: 2,
    AUTOPLAY: 3,
} as const

const requireQueueMock = jest.fn()
const interactionReplyMock = jest.fn()
const createSuccessEmbedMock = jest.fn((title: string, desc?: string) => ({
    title,
    description: desc,
}))
const resolveGuildQueueMock = jest.fn()

const requireSameVoiceChannelMock = jest.fn(async (..._args: unknown[]) => true)

jest.mock('../../../utils/command/commandValidations', () => ({
    requireSameVoiceChannel: (...args: unknown[]) =>
        requireSameVoiceChannelMock(...args),
    requireQueue: (...args: unknown[]) => requireQueueMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createSuccessEmbed: (...args: Parameters<typeof createSuccessEmbedMock>) =>
        createSuccessEmbedMock(...args),
}))

jest.mock('discord-player', () => ({
    QueueRepeatMode: {
        OFF: 0,
        TRACK: 1,
        QUEUE: 2,
        AUTOPLAY: 3,
    },
}))

const resumeAutoplayMock = jest.fn()
jest.mock('../../../handlers/player/autoplayFailureStreak', () => ({
    resumeAutoplay: (...args: unknown[]) => resumeAutoplayMock(...args),
}))

jest.mock('../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

function createInteraction(mode: string, guildId = 'guild-1') {
    return {
        guildId,
        user: { id: 'user-1' },
        options: {
            getString: jest.fn((name: string) => {
                if (name === 'mode') return mode
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
        requireQueueMock.mockResolvedValue(true)
    })

    it('refuses a member outside the bot voice channel (#3266)', async () => {
        requireSameVoiceChannelMock.mockResolvedValueOnce(false)
        const queue = createQueue()
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = createInteraction('off')

        await repeatCommand.execute({
            client: createClient(),
            interaction,
        } as any)

        expect(requireSameVoiceChannelMock).toHaveBeenCalledWith(
            queue,
            interaction,
        )
        expect(requireQueueMock).not.toHaveBeenCalled()
        expect(queue.setRepeatMode).not.toHaveBeenCalled()
    })

    it('offers no times option, since nothing counts repeats down (#3268)', () => {
        const options = repeatCommand.data.toJSON().options ?? []
        expect(options.map((o) => o.name)).toEqual(['mode'])
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
        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            '🔁 Repeat mode',
            'Repeat **turned off**',
        )
    })

    it('sets repeat mode to track infinitely', async () => {
        const queue = createQueue()
        const client = createClient()
        const interaction = createInteraction('track')
        resolveGuildQueueMock.mockReturnValue({ queue })

        await repeatCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.setRepeatMode).toHaveBeenCalledWith(QueueRepeatMode.TRACK)
        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            '🔁 Repeat mode',
            'Repeating current song **until turned off**',
        )
    })

    it('sets repeat mode to queue infinitely', async () => {
        const queue = createQueue()
        const client = createClient()
        const interaction = createInteraction('queue')
        resolveGuildQueueMock.mockReturnValue({ queue })

        await repeatCommand.execute({
            client,
            interaction,
        } as any)

        expect(queue.setRepeatMode).toHaveBeenCalledWith(QueueRepeatMode.QUEUE)
        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            '🔁 Repeat mode',
            'Repeating queue **until turned off**',
        )
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
        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            '🔁 Repeat mode',
            '**Infinite** repeat activated (continuous autoplay)',
        )
        expect(resumeAutoplayMock).toHaveBeenCalledWith('guild-1')
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
        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            '🔁 Repeat mode',
            'Repeat **turned off**',
        )
    })
})
