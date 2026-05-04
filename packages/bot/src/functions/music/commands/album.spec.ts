import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const requireVoiceChannelMock =
    jest.fn<(interaction: unknown) => Promise<boolean>>()
const requireDJRoleMock = jest.fn()
const errorLogMock = jest.fn()
const resolveGuildQueueMock =
    jest.fn<(client: unknown, guildId: string) => { queue: unknown }>()
const moveUserTrackToPriorityMock = jest.fn()
const interactionReplyMock = jest.fn<(payload: unknown) => Promise<void>>()
const createErrorEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'error',
    title,
    message,
}))
const createSuccessEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'success',
    title,
    message,
}))
const createWarningEmbedMock = jest.fn((title: string, message: string) => ({
    type: 'warning',
    title,
    message,
}))
const featureToggleIsEnabledMock = jest.fn<() => Promise<boolean>>()

jest.mock('discord-player', () => ({
    QueryType: {
        AUTO: 'auto',
        SPOTIFY_SEARCH: 'spotifySearch',
        SPOTIFY_SONG: 'spotifySong',
    },
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireVoiceChannel: (interaction: unknown) =>
        requireVoiceChannelMock(interaction),
    requireDJRole: (...args: unknown[]) => requireDJRoleMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (client: unknown, guildId: string) =>
        resolveGuildQueueMock(client, guildId),
}))

jest.mock('../../../utils/music/queueManipulation', () => ({
    moveUserTrackToPriority: (queue: unknown, track: unknown) =>
        moveUserTrackToPriorityMock(queue, track),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (payload: unknown) => errorLogMock(payload),
}))

jest.mock('@lucky/shared/utils/general/errorSanitizer', () => ({
    createUserFriendlyError: () => 'User friendly error',
}))

jest.mock('@lucky/shared/config', () => ({
    ENVIRONMENT_CONFIG: { PLAYER: { CONNECTION_TIMEOUT: 15000 } },
}))

jest.mock('@lucky/shared/services', () => ({
    featureToggleService: {
        isEnabled: (...args: unknown[]) => featureToggleIsEnabledMock(...args),
    },
}))

jest.mock('../../../utils/general/embeds', () => ({
    createErrorEmbed: (title: string, message: string) =>
        createErrorEmbedMock(title, message),
    createSuccessEmbed: (title: string, message: string) =>
        createSuccessEmbedMock(title, message),
    createWarningEmbed: (title: string, message: string) =>
        createWarningEmbedMock(title, message),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (payload: unknown) => interactionReplyMock(payload),
}))

jest.mock('./play/queryUtils', () => ({
    isUnknownInteractionError: () => false,
}))

import albumCommand from './album'

function createInteraction(
    guildId: string | null,
    query = 'OK Computer',
    artist: string | null = null,
) {
    return {
        guildId,
        user: { id: 'user-1' },
        channel: { id: 'channel-1' },
        member: { voice: { channel: { id: 'voice-1' } } },
        options: {
            getString: jest.fn((name: string) =>
                name === 'query' ? query : artist,
            ),
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
    } as any
}

function createClient(
    searchResult: unknown,
    playResult: unknown = { track: { url: 'url-1' } },
) {
    return {
        player: {
            search: jest.fn(async () => searchResult),
            play: jest.fn(async () => playResult),
        },
        user: { id: 'bot-1' },
    } as any
}

describe('album command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireVoiceChannelMock.mockResolvedValue(true)
        requireDJRoleMock.mockResolvedValue(true)
        createErrorEmbedMock.mockImplementation(
            (title: string, message: string) => ({
                type: 'error',
                title,
                message,
            }),
        )
        createSuccessEmbedMock.mockImplementation(
            (title: string, message: string) => ({
                type: 'success',
                title,
                message,
            }),
        )
        createWarningEmbedMock.mockImplementation(
            (title: string, message: string) => ({
                type: 'warning',
                title,
                message,
            }),
        )
        featureToggleIsEnabledMock.mockResolvedValue(true)
    })

    it('replies with error when not in a guild', async () => {
        const interaction = createInteraction(null)
        await albumCommand.execute({
            client: createClient(null),
            interaction,
        } as any)
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ ephemeral: true }),
        )
    })

    it('returns early when voice channel check fails', async () => {
        requireVoiceChannelMock.mockResolvedValue(false)
        const interaction = createInteraction('guild-1')
        await albumCommand.execute({
            client: createClient(null),
            interaction,
        } as any)
        expect(interaction.deferReply).not.toHaveBeenCalled()
    })

    it('returns early when DJ role check fails', async () => {
        requireDJRoleMock.mockResolvedValue(false)
        const interaction = createInteraction('guild-1')
        await albumCommand.execute({
            client: createClient(null),
            interaction,
        } as any)
        expect(interaction.deferReply).not.toHaveBeenCalled()
    })

    it('replies with error when no tracks found', async () => {
        const interaction = createInteraction('guild-1')
        const client = createClient({ tracks: [] })

        await albumCommand.execute({ client, interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({ type: 'error' }),
                    ]),
                }),
            }),
        )
    })

    it('queues all playlist tracks and replies with success', async () => {
        const tracks = [
            { url: 'url-1', requestedBy: null },
            { url: 'url-2', requestedBy: null },
            { url: 'url-3', requestedBy: null },
        ]
        const interaction = createInteraction('guild-1')
        const queue = { addTrack: jest.fn() }
        const client = createClient(
            { tracks, playlist: { title: 'OK Computer' } },
            { track: tracks[0] },
        )
        resolveGuildQueueMock.mockReturnValue({ queue })

        await albumCommand.execute({ client, interaction } as any)

        expect(queue.addTrack).toHaveBeenCalledTimes(2)
        expect(moveUserTrackToPriorityMock).toHaveBeenCalled()
        expect(createSuccessEmbedMock).toHaveBeenCalledWith(
            expect.stringContaining('OK Computer'),
            expect.stringContaining('3'),
        )
    })

    it('uses AUTO search engine for Spotify album URLs', async () => {
        const spotifyUrl = 'https://open.spotify.com/album/abc123'
        const tracks = [{ url: spotifyUrl, requestedBy: null }]
        const interaction = createInteraction('guild-1', spotifyUrl)
        const queue = { addTrack: jest.fn() }
        const client = createClient(
            { tracks, playlist: { title: 'Album' } },
            { track: tracks[0] },
        )
        resolveGuildQueueMock.mockReturnValue({ queue })

        await albumCommand.execute({ client, interaction } as any)

        expect(client.player.search).toHaveBeenCalledWith(
            spotifyUrl,
            expect.objectContaining({ searchEngine: 'auto' }),
        )
    })

    it('replies with error when queue cannot be created', async () => {
        const tracks = [{ url: 'url-1', requestedBy: null }]
        const interaction = createInteraction('guild-1')
        const client = createClient(
            {
                tracks,
                playlist: {
                    title: 'Test Album',
                    url: 'https://open.spotify.com/album/123',
                },
            },
            { track: tracks[0] },
        )
        resolveGuildQueueMock.mockReturnValue({ queue: null })

        await albumCommand.execute({ client, interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({ ephemeral: true }),
            }),
        )
    })

    it('logs and replies with error on unexpected exception', async () => {
        const interaction = createInteraction('guild-1')
        const client = createClient(null)
        client.player.search.mockRejectedValue(new Error('Spotify timeout'))

        await albumCommand.execute({ client, interaction } as any)

        expect(errorLogMock).toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalled()
    })
    it('replies with error when search returns tracks but no playlist', async () => {
        const tracks = [
            { url: 'url-1', requestedBy: null },
            { url: 'url-2', requestedBy: null },
        ]
        const interaction = createInteraction('guild-1', 'Rumours')
        const client = createClient({ playlist: null, tracks })
        resolveGuildQueueMock.mockReturnValue({ queue: null })

        await albumCommand.execute({ client, interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({ type: 'error' }),
                    ]),
                }),
            }),
        )
    })
})
