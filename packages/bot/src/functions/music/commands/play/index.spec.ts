import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const requireVoiceChannelMock = jest.fn()
const errorLogMock = jest.fn()
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
const canAddTracksMock = jest.fn()
const recordContributionMock = jest.fn()
const resolveGuildQueueMock = jest.fn()

jest.mock('discord-player', () => ({
    QueueRepeatMode: { AUTOPLAY: 3 },
}))

jest.mock('../../../../utils/music/queueManipulation', () => ({
    moveUserTrackToPriority: jest.fn(),
    blendAutoplayTracks: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('../../../../utils/command/commandValidations', () => ({
    requireVoiceChannel: (...args: unknown[]) =>
        requireVoiceChannelMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('../../../../utils/general/embeds', () => ({
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
}))

jest.mock('../../../../utils/music/collaborativePlaylist', () => ({
    collaborativePlaylistService: {
        canAddTracks: (...args: unknown[]) => canAddTracksMock(...args),
        recordContribution: (...args: unknown[]) =>
            recordContributionMock(...args),
    },
}))

import playCommand from './index'

function createInteraction(guildId: string | null) {
    return {
        guildId,
        user: { id: 'user-1' },
        channel: { id: 'channel-1' },
        member: { voice: { channel: { id: 'voice-1' } } },
        options: {
            getString: jest.fn(() => 'test query'),
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
    } as any
}

function createClient(
    playImpl: (...args: unknown[]) => unknown,
    queueOptions?: { repeatMode?: number; tracksSize?: number },
) {
    const queue = queueOptions
        ? {
              repeatMode: queueOptions.repeatMode ?? 0,
              tracks: { size: queueOptions.tracksSize ?? 0 },
          }
        : null

    return {
        player: {
            play: jest.fn(playImpl),
            nodes: {
                get: jest.fn(() => queue),
            },
        },
    } as any
}

describe('play command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireVoiceChannelMock.mockResolvedValue(true)
        canAddTracksMock.mockReturnValue({
            allowed: true,
            limit: 3,
        })
        resolveGuildQueueMock.mockReturnValue({ queue: null })
    })

    it('rejects command outside guilds', async () => {
        const interaction = createInteraction(null)

        await playCommand.execute({
            client: createClient(async () => ({})),
            interaction,
        } as any)

        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ ephemeral: true }),
        )
        expect(requireVoiceChannelMock).not.toHaveBeenCalled()
    })

    it('rejects when collaborative limit reached', async () => {
        const interaction = createInteraction('guild-1')
        canAddTracksMock.mockReturnValue({
            allowed: false,
            limit: 1,
        })

        await playCommand.execute({
            client: createClient(async () => ({})),
            interaction,
        } as any)

        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ ephemeral: true }),
        )
        expect(interaction.deferReply).not.toHaveBeenCalled()
    })

    it('plays track and records contribution', async () => {
        const interaction = createInteraction('guild-1')
        const result = {
            track: { title: 'Song A', author: 'Artist A' },
            searchResult: { playlist: null, tracks: [] },
        }

        await playCommand.execute({
            client: createClient(async () => result, {
                repeatMode: 3,
                tracksSize: 2,
            }),
            interaction,
        } as any)

        expect(interaction.deferReply).toHaveBeenCalled()
        expect(recordContributionMock).toHaveBeenCalledWith(
            'guild-1',
            'user-1',
            1,
        )
        expect(interaction.editReply).toHaveBeenCalled()
        expect(createSuccessEmbedMock).toHaveBeenCalled()
    })

    it('handles play failures', async () => {
        const interaction = createInteraction('guild-1')

        await playCommand.execute({
            client: createClient(async () => {
                throw new Error('Search failed')
            }),
            interaction,
        } as any)

        expect(errorLogMock).toHaveBeenCalled()
        expect(interaction.editReply).toHaveBeenCalled()
        expect(createErrorEmbedMock).toHaveBeenCalled()
    })
})
