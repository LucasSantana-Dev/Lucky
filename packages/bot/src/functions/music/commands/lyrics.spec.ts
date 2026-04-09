import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const interactionReplyMock = jest.fn()
const followUpMock = jest.fn()
const deferReplyMock = jest.fn()
const editReplyMock = jest.fn()
const requireCurrentTrackMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const searchLyricsMock = jest.fn()
const splitLyricsMock = jest.fn()
const featureToggleIsEnabledMock = jest.fn()
const musicEmbedMock = jest.fn()
const createErrorEmbedMock = jest.fn()
const createWarningEmbedMock = jest.fn()

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireCurrentTrack: (...args: unknown[]) =>
        requireCurrentTrackMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    featureToggleService: {
        isEnabled: (...args: unknown[]) => featureToggleIsEnabledMock(...args),
    },
    lyricsService: {
        searchLyrics: (...args: unknown[]) => searchLyricsMock(...args),
        splitLyrics: (...args: unknown[]) => splitLyricsMock(...args),
    },
}))

jest.mock('../../../utils/general/embeds', () => ({
    musicEmbed: (...args: unknown[]) => musicEmbedMock(...args),
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
    createWarningEmbed: (...args: unknown[]) => createWarningEmbedMock(...args),
}))

import lyricsCommand from './lyrics'

type TExecuteArgs = Parameters<typeof lyricsCommand.execute>[0]
type TInteraction = TExecuteArgs['interaction']
type TClient = TExecuteArgs['client']


function createInteraction({
    guildId = 'guild-1',
    song = null,
}: {
    guildId?: string | null
    song?: string | null
}) {
    const interaction = {
        guildId,
        user: { id: 'user-1' },
        options: {
            getString: jest.fn(() => song),
        },
        deferReply: deferReplyMock,
        editReply: editReplyMock,
        followUp: followUpMock,
    }
    return interaction as unknown as TInteraction
}

function createEmbed(data: object = {}) {
    return {
        ...data,
        setFooter: jest.fn(function (this: object) {
            return this
        }),
    }
}

describe('lyrics command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        interactionReplyMock.mockResolvedValue(undefined)
        deferReplyMock.mockResolvedValue(undefined)
        editReplyMock.mockResolvedValue(undefined)
        followUpMock.mockResolvedValue(undefined)
        featureToggleIsEnabledMock.mockResolvedValue(true)
        requireCurrentTrackMock.mockResolvedValue(true)
        resolveGuildQueueMock.mockReturnValue({
            queue: {
                currentTrack: { title: 'Test Song', author: 'Test Artist' },
            },
        })
        musicEmbedMock.mockReturnValue(createEmbed())
        createErrorEmbedMock.mockReturnValue({ type: 'error' })
        createWarningEmbedMock.mockReturnValue({ type: 'warning' })
    })

    it('replies with warning when LYRICS feature is disabled', async () => {
        featureToggleIsEnabledMock.mockResolvedValue(false)
        const interaction = createInteraction({})
        const client = {} as unknown as TClient
        await lyricsCommand.execute({ client, interaction })
        expect(createWarningEmbedMock).toHaveBeenCalledWith(
            'Feature unavailable',
            expect.any(String),
        )
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({ ephemeral: true }),
            }),
        )
    })

    it('replies with error when no guild', async () => {
        const interaction = createInteraction({ guildId: null })
        const client = {} as unknown as TClient
        await lyricsCommand.execute({ client, interaction })
        expect(createErrorEmbedMock).toHaveBeenCalled()
    })

    it('fetches lyrics for explicit song query', async () => {
        const lyricResult = {
            title: 'Test Song',
            artist: 'Test Artist',
            lyrics: 'Line 1\nLine 2',
            source: 'lyrics.ovh',
        }
        searchLyricsMock.mockResolvedValue(lyricResult)
        splitLyricsMock.mockReturnValue(['Line 1\nLine 2'])
        const interaction = createInteraction({ song: 'Test Song' })
        const client = {} as unknown as TClient
        await lyricsCommand.execute({ client, interaction })
        expect(searchLyricsMock).toHaveBeenCalledWith('Test Song', undefined)
        expect(musicEmbedMock).toHaveBeenCalledWith(
            expect.stringContaining('Test Song'),
            'Line 1\nLine 2',
        )
        expect(deferReplyMock).toHaveBeenCalled()
        expect(editReplyMock).toHaveBeenCalled()
        expect(followUpMock).not.toHaveBeenCalled()
    })

    it('uses current track when no song query given', async () => {
        const lyricResult = {
            title: 'Test Song',
            artist: 'Test Artist',
            lyrics: 'Verse',
            source: 'lyrics.ovh',
        }
        searchLyricsMock.mockResolvedValue(lyricResult)
        splitLyricsMock.mockReturnValue(['Verse'])
        const interaction = createInteraction({ song: null })
        const client = {} as unknown as TClient
        await lyricsCommand.execute({ client, interaction })
        expect(searchLyricsMock).toHaveBeenCalledWith(
            'Test Song',
            'Test Artist',
        )
    })

    it('sends multiple follow-ups for paginated lyrics', async () => {
        const lyricResult = {
            title: 'Long Song',
            artist: 'Artist',
            lyrics: 'A'.repeat(4000),
            source: 'ovh',
        }
        searchLyricsMock.mockResolvedValue(lyricResult)
        splitLyricsMock.mockReturnValue(['page1', 'page2', 'page3'])
        const interaction = createInteraction({ song: 'Long Song' })
        const client = {} as unknown as TClient
        await lyricsCommand.execute({ client, interaction })
        expect(editReplyMock).toHaveBeenCalledTimes(1)
        expect(followUpMock).toHaveBeenCalledTimes(2)
    })

    it('replies with error when lyrics provider returns an error', async () => {
        searchLyricsMock.mockResolvedValue({
            error: 'not_found',
            message: 'Lyrics not found',
        })
        const interaction = createInteraction({ song: 'Unknown Song' })
        const client = {} as unknown as TClient
        await lyricsCommand.execute({ client, interaction })
        expect(deferReplyMock).toHaveBeenCalled()
        expect(editReplyMock).toHaveBeenCalled()
        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Lyrics not found',
            'Lyrics not found',
        )
    })

    it('replies with error on unexpected exception', async () => {
        searchLyricsMock.mockRejectedValue(new Error('Network error'))
        const interaction = createInteraction({ song: 'Any Song' })
        const client = {} as unknown as TClient
        await lyricsCommand.execute({ client, interaction })
        expect(deferReplyMock).toHaveBeenCalled()
        expect(editReplyMock).toHaveBeenCalled()
        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Lyrics error',
            expect.any(String),
        )
    })
})
