jest.mock('../../../i18n/acknowledgeAndTranslate', () => ({
    acknowledgeAndTranslate: jest.fn(async () =>
        jest
            .requireActual<typeof import('../../../i18n')>('../../../i18n')
            .translatorFor('en'),
    ),
}))
import pauseCommand from './pause'

const requireSameVoiceChannelMock = jest.fn()
const requireQueueMock = jest.fn()
const interactionReplyMock = jest.fn()
const createSuccessEmbedMock = jest.fn((title: string, desc?: string) => ({
    title,
    description: desc,
}))
const buildCommandTrackEmbedMock = jest.fn((track: any, action: string) => ({
    action,
    track: track?.title,
}))
const resolveGuildQueueMock = jest.fn()

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

jest.mock('../../../utils/general/responseEmbeds', () => ({
    buildCommandTrackEmbed: (
        ...args: Parameters<typeof buildCommandTrackEmbedMock>
    ) => buildCommandTrackEmbedMock(...args),
}))

jest.mock('../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

const captureAutoplayTrackMock = jest.fn((track: any) =>
    track ? { trackKey: `key:${track.title}`, title: track.title } : null,
)
const maybePromptAutoplayFeedbackMock = jest.fn()

jest.mock(
    '../../../services/musicRecommendation/autoplayFeedbackPrompt',
    () => ({
        captureAutoplayTrack: (...args: unknown[]) =>
            captureAutoplayTrackMock(...(args as [any])),
        maybePromptAutoplayFeedback: (...args: unknown[]) =>
            maybePromptAutoplayFeedbackMock(...args),
    }),
)

function createQueue(isPaused = false) {
    return {
        node: {
            isPaused: jest.fn().mockReturnValue(isPaused),
            pause: jest.fn(),
            resume: jest.fn(),
            seek: jest.fn(),
        },
        currentTrack: { title: 'Test Song', author: 'Test Artist' },
    } as any
}

function makeInteraction() {
    return {
        guildId: 'guild-1',
        user: { tag: 'User#0001' },
    } as any
}

describe('pause command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireSameVoiceChannelMock.mockResolvedValue(true)
        requireQueueMock.mockResolvedValue(true)
    })

    it('has correct command name', () => {
        expect(pauseCommand.data.name).toBe('pause')
    })

    it('returns early when voice channel validation fails', async () => {
        requireSameVoiceChannelMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({ queue: createQueue() })

        await pauseCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('returns early when queue validation fails', async () => {
        requireQueueMock.mockResolvedValue(false)
        resolveGuildQueueMock.mockReturnValue({ queue: createQueue() })

        await pauseCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(interactionReplyMock).not.toHaveBeenCalled()
    })

    it('pauses music when currently playing', async () => {
        const queue = createQueue(false)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(queue.node.pause).toHaveBeenCalled()
        expect(queue.node.resume).not.toHaveBeenCalled()
    })

    it('resumes music when currently paused', async () => {
        const queue = createQueue(true)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(queue.node.resume).toHaveBeenCalled()
        expect(queue.node.pause).not.toHaveBeenCalled()
    })

    it('shows paused status when pausing', async () => {
        const queue = createQueue(false)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(buildCommandTrackEmbedMock).toHaveBeenCalledWith(
            expect.any(Object),
            expect.stringContaining('Paused'),
            expect.any(Object),
            'paused',
        )
    })

    it('shows resumed status when resuming', async () => {
        const queue = createQueue(true)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(buildCommandTrackEmbedMock).toHaveBeenCalledWith(
            expect.any(Object),
            expect.stringContaining('Resumed'),
            expect.any(Object),
            'resumed',
        )
    })

    it('replies with track embed when current track exists', async () => {
        const queue = createQueue(false)
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    embeds: expect.any(Array),
                }),
            }),
        )
    })

    it('replies with success embed when no current track', async () => {
        const queue = createQueue(false)
        queue.currentTrack = null
        resolveGuildQueueMock.mockReturnValue({ queue })

        await pauseCommand.execute({
            client: {} as any,
            interaction: makeInteraction(),
        } as any)

        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            '⏸️ Paused',
            expect.stringContaining('paused'),
        )
    })

    it('asks about the track when pausing', async () => {
        const queue = createQueue(false)
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = makeInteraction()

        await pauseCommand.execute({ client: {} as any, interaction } as any)

        expect(maybePromptAutoplayFeedbackMock).toHaveBeenCalledWith(
            interaction,
            { trackKey: 'key:Test Song', title: 'Test Song' },
        )
    })

    it('does not ask when resuming', async () => {
        const queue = createQueue(true)
        resolveGuildQueueMock.mockReturnValue({ queue })
        const interaction = makeInteraction()

        await pauseCommand.execute({ client: {} as any, interaction } as any)

        expect(maybePromptAutoplayFeedbackMock).toHaveBeenCalledWith(
            interaction,
            null,
        )
    })
})
