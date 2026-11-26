const interactionReplyMock = jest.fn()
const requireGuildMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const likeTrackMock = jest.fn()
const setFeedbackMock = jest.fn()
const voiceChannelRefusalMock = jest.fn()

jest.mock('../../../i18n/translatorForInteraction', () => ({
    translatorForInteraction: jest.fn(async () =>
        jest
            .requireActual<typeof import('../../../i18n')>('../../../i18n')
            .translatorFor('en'),
    ),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
    voiceChannelRefusal: (...args: unknown[]) =>
        voiceChannelRefusalMock(...args),
}))

jest.mock('../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('../../../services/musicRecommendation/feedbackService', () => ({
    recommendationFeedbackService: {
        setFeedback: (...args: unknown[]) => setFeedbackMock(...args),
        buildTrackKey: (title: string, author: string) => `${title}::${author}`,
    },
}))

jest.mock('../../../services/likedTracks', () => ({
    LIKED_TRACKS_MAX: 500,
    likeTrack: (...args: unknown[]) => likeTrackMock(...args),
}))

import likeCommand from './like'

const track = { title: 'Creep', author: 'Radiohead' }

function run() {
    const interaction = {
        guildId: 'guild-1',
        user: { id: 'user-1', username: 'luk' },
        deferReply: jest.fn().mockResolvedValue(undefined),
    }
    return {
        interaction,
        done: likeCommand.execute({
            client: {},
            interaction,
        } as never),
    }
}

const replied = () => interactionReplyMock.mock.calls[0][0].content

describe('/like', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        resolveGuildQueueMock.mockReturnValue({
            queue: { currentTrack: track },
        })
        likeTrackMock.mockResolvedValue('saved')
        setFeedbackMock.mockResolvedValue(true)
        voiceChannelRefusalMock.mockReturnValue(null)
    })

    it('saves the playing song and answers only the member', async () => {
        const { interaction, done } = run()
        await done

        expect(interaction.deferReply).toHaveBeenCalledWith({ flags: 64 })
        expect(likeTrackMock).toHaveBeenCalledWith('user-1', track)
        expect(replied().ephemeral).toBe(true)
        expect(replied().content).toContain('Saved **Creep**')
    })

    it('also counts as a like for autoplay when the member is listening', async () => {
        const { interaction, done } = run()
        await done

        expect(voiceChannelRefusalMock).toHaveBeenCalledWith(
            interaction,
            { currentTrack: track },
            { allowManagers: false },
        )
        expect(setFeedbackMock).toHaveBeenCalledWith(
            'guild-1',
            'user-1',
            'luk',
            'Creep::Radiohead',
            'like',
        )
    })

    it('saves the song but casts no autoplay vote from outside the voice channel', async () => {
        voiceChannelRefusalMock.mockReturnValue({ reason: 'notInVoice' })

        await run().done

        expect(likeTrackMock).toHaveBeenCalledWith('user-1', track)
        expect(replied().content).toContain('Saved **Creep**')
        expect(setFeedbackMock).not.toHaveBeenCalled()
    })

    it('votes in this guild for a song already liked elsewhere', async () => {
        likeTrackMock.mockResolvedValue('already')

        await run().done

        expect(replied().content).toContain('already in your liked songs')
        expect(setFeedbackMock).toHaveBeenCalledTimes(1)
    })

    it('casts no vote for a song whose title and artist are only symbols', async () => {
        resolveGuildQueueMock.mockReturnValue({
            queue: { currentTrack: { title: '', author: '' } },
        })

        await run().done

        expect(likeTrackMock).toHaveBeenCalled()
        expect(setFeedbackMock).not.toHaveBeenCalled()
    })

    it('says so when nothing is playing', async () => {
        resolveGuildQueueMock.mockReturnValue({ queue: null })

        await run().done

        expect(likeTrackMock).not.toHaveBeenCalled()
        expect(replied().content).toContain('Nothing is playing')
    })

    it.each([
        ['full', 'full (500)'],
        ['failed', "Couldn't save"],
    ])('answers a %s result without an autoplay vote', async (result, text) => {
        likeTrackMock.mockResolvedValue(result)

        await run().done

        expect(replied().content).toContain(text)
        expect(setFeedbackMock).not.toHaveBeenCalled()
    })

    it('stops outside a guild', async () => {
        requireGuildMock.mockResolvedValue(false)

        await run().done

        expect(likeTrackMock).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })
})
