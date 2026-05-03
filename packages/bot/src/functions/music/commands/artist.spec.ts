import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const requireVoiceChannelMock = jest.fn<(interaction: unknown) => Promise<boolean>>()
const requireDJRoleMock = jest.fn()
const errorLogMock = jest.fn()
const resolveGuildQueueMock = jest.fn<(client: unknown, guildId: string) => { queue: unknown }>()
const moveUserTrackToPriorityMock = jest.fn()
const interactionReplyMock = jest.fn<(payload: unknown) => Promise<void>>()
const createErrorEmbedMock = jest.fn((title: string, message: string) => ({ type: 'error', title, message }))
const createSuccessEmbedMock = jest.fn((title: string, message: string) => ({ type: 'success', title, message }))

jest.mock('discord-player', () => ({
    QueryType: { SPOTIFY_SEARCH: 'spotifySearch' },
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireVoiceChannel: (interaction: unknown) => requireVoiceChannelMock(interaction),
    requireDJRole: (...args: unknown[]) => requireDJRoleMock(...args),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (client: unknown, guildId: string) => resolveGuildQueueMock(client, guildId),
}))

jest.mock('../../../utils/music/queueManipulation', () => ({
    moveUserTrackToPriority: (queue: unknown, track: unknown) => moveUserTrackToPriorityMock(queue, track),
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

jest.mock('../../../utils/general/embeds', () => ({
    createErrorEmbed: (title: string, message: string) => createErrorEmbedMock(title, message),
    createSuccessEmbed: (title: string, message: string) => createSuccessEmbedMock(title, message),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (payload: unknown) => interactionReplyMock(payload),
}))

jest.mock('./play/queryUtils', () => ({
    isUnknownInteractionError: () => false,
}))

import artistCommand from './artist'

function createInteraction(guildId: string | null, artistName = 'Radiohead', limit: number | null = null) {
    return {
        guildId,
        user: { id: 'user-1' },
        channel: { id: 'channel-1' },
        member: { voice: { channel: { id: 'voice-1' } } },
        options: {
            getString: jest.fn(() => artistName),
            getInteger: jest.fn(() => limit),
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
    } as any
}

function createClient(searchResult: unknown, playResult: unknown = { track: { url: 'url-1' } }) {
    return {
        player: {
            search: jest.fn(async () => searchResult),
            play: jest.fn(async () => playResult),
        },
        user: { id: 'bot-1' },
    } as any
}

describe('artist command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireVoiceChannelMock.mockResolvedValue(true)
        requireDJRoleMock.mockResolvedValue(true)
    })

    it('replies with error when not in a guild', async () => {
        const interaction = createInteraction(null)
        await artistCommand.execute({ client: createClient(null), interaction } as any)
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ ephemeral: true }),
        )
    })

    it('returns early when voice channel check fails', async () => {
        requireVoiceChannelMock.mockResolvedValue(false)
        const interaction = createInteraction('guild-1')
        await artistCommand.execute({ client: createClient(null), interaction } as any)
        expect(interaction.deferReply).not.toHaveBeenCalled()
    })

    it('returns early when DJ role check fails', async () => {
        requireDJRoleMock.mockResolvedValue(false)
        const interaction = createInteraction('guild-1')
        await artistCommand.execute({ client: createClient(null), interaction } as any)
        expect(interaction.deferReply).not.toHaveBeenCalled()
    })

    it('replies with error when no tracks found', async () => {
        const interaction = createInteraction('guild-1')
        const client = createClient({ tracks: [] })
        resolveGuildQueueMock.mockReturnValue({ queue: null })

        await artistCommand.execute({ client, interaction } as any)

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

    it('queues tracks and replies with success on valid artist search', async () => {
        const tracks = [
            { url: 'url-1', requestedBy: null },
            { url: 'url-2', requestedBy: null },
        ]
        const interaction = createInteraction('guild-1')
        const queue = { addTrack: jest.fn(), tracks: { size: 0 } }
        const client = createClient({ tracks }, { track: tracks[0] })
        resolveGuildQueueMock.mockReturnValue({ queue })

        await artistCommand.execute({ client, interaction } as any)

        expect(queue.addTrack).toHaveBeenCalledTimes(1)
        expect(moveUserTrackToPriorityMock).toHaveBeenCalled()
        expect(createSuccessEmbedMock).toHaveBeenCalled()
    })

    it('replies with error when queue cannot be created', async () => {
        const tracks = [{ url: 'url-1', requestedBy: null }]
        const interaction = createInteraction('guild-1')
        const client = createClient({ tracks }, { track: tracks[0] })
        resolveGuildQueueMock.mockReturnValue({ queue: null })

        await artistCommand.execute({ client, interaction } as any)

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

    it('logs and replies with error on unexpected exception', async () => {
        const interaction = createInteraction('guild-1')
        const client = createClient(null)
        client.player.search.mockRejectedValue(new Error('Network error'))

        await artistCommand.execute({ client, interaction } as any)

        expect(errorLogMock).toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalled()
    })
})