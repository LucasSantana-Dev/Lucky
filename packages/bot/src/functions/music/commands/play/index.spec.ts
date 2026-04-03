import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const requireVoiceChannelMock =
    jest.fn<(interaction: unknown) => Promise<boolean>>()
const errorLogMock = jest.fn<(payload: unknown) => void>()
const debugLogMock = jest.fn<(payload: unknown) => void>()
const warnLogMock = jest.fn<(payload: unknown) => void>()
const getGuildSettingsMock =
    jest.fn<
        (guildId: string) => Promise<{ autoPlayEnabled?: boolean } | null>
    >()
const createErrorEmbedMock = jest.fn<
    (
        title: string,
        message: string,
    ) => {
        type: 'error'
        title: string
        message: string
    }
>((title: string, message: string) => ({
    type: 'error',
    title,
    message,
}))
const createSuccessEmbedMock = jest.fn<
    (
        title: string,
        message: string,
    ) => {
        type: 'success'
        title: string
        message: string
    }
>((title: string, message: string) => ({
    type: 'success',
    title,
    message,
}))
const canAddTracksMock = jest.fn<() => { allowed: boolean; limit: number }>()
const recordContributionMock =
    jest.fn<(guildId: string, userId: string, amount: number) => void>()
const resolveGuildQueueMock =
    jest.fn<(client: unknown, guildId: string) => { queue: unknown }>()
const moveUserTrackToPriorityMock =
    jest.fn<(queue: unknown, track: unknown) => void>()
const blendAutoplayTracksMock =
    jest.fn<(queue: unknown, track: unknown) => Promise<void>>()

jest.mock('discord-player', () => ({
    QueueRepeatMode: { OFF: 0, AUTOPLAY: 3 },
}))

jest.mock('../../../../utils/music/queueManipulation', () => ({
    moveUserTrackToPriority: (queue: unknown, track: unknown) =>
        moveUserTrackToPriorityMock(queue, track),
    blendAutoplayTracks: (queue: unknown, track: unknown) =>
        blendAutoplayTracksMock(queue, track),
}))

jest.mock('../../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (client: unknown, guildId: string) =>
        resolveGuildQueueMock(client, guildId),
}))

jest.mock('../../../../utils/command/commandValidations', () => ({
    requireVoiceChannel: (interaction: unknown) =>
        requireVoiceChannelMock(interaction),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (payload: unknown) => errorLogMock(payload),
    debugLog: (payload: unknown) => debugLogMock(payload),
    warnLog: (payload: unknown) => warnLogMock(payload),
}))

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: {
        getGuildSettings: (guildId: string) => getGuildSettingsMock(guildId),
    },
}))

jest.mock('@lucky/shared/config', () => ({
    ENVIRONMENT_CONFIG: {
        PLAYER: {
            CONNECTION_TIMEOUT: 15000,
        },
    },
}))

jest.mock('../../../../utils/general/embeds', () => ({
    createErrorEmbed: (title: string, message: string) =>
        createErrorEmbedMock(title, message),
    createSuccessEmbed: (title: string, message: string) =>
        createSuccessEmbedMock(title, message),
}))

jest.mock('../../../../utils/music/collaborativePlaylist', () => ({
    collaborativePlaylistService: {
        canAddTracks: () => canAddTracksMock(),
        recordContribution: (guildId: string, userId: string, amount: number) =>
            recordContributionMock(guildId, userId, amount),
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
        blendAutoplayTracksMock.mockResolvedValue(undefined)
        canAddTracksMock.mockReturnValue({
            allowed: true,
            limit: 3,
        })
        getGuildSettingsMock.mockResolvedValue(null)
        resolveGuildQueueMock.mockReturnValue({ queue: null })
    })

    it('rejects command outside guilds', async () => {
        const interaction = createInteraction(null)

        await playCommand.execute({
            client: createClient(async () => ({})),
            interaction,
        } as any)

        expect(interaction.deferReply).not.toHaveBeenCalled()
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({
                embeds: expect.any(Array),
                ephemeral: true,
            }),
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

        expect(interaction.deferReply).toHaveBeenCalled()
        expect(interaction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({ embeds: expect.any(Array) }),
        )
    })

    it('plays track and records contribution', async () => {
        const interaction = createInteraction('guild-1')
        const result = {
            track: { title: 'Song A', author: 'Artist A' },
            searchResult: { playlist: null, tracks: [] },
        }
        const client = createClient(async () => result, {
            repeatMode: 3,
            tracksSize: 2,
        })

        await playCommand.execute({
            client,
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
        expect(client.player.play).toHaveBeenCalledWith(
            expect.anything(),
            'test query',
            expect.objectContaining({
                nodeOptions: expect.objectContaining({
                    connectionTimeout: 15000,
                }),
            }),
        )
    })

    it('applies stored autoplay preference to a queue', async () => {
        const interaction = createInteraction('guild-1')
        const queue = {
            repeatMode: 0,
            tracks: { size: 0 },
            setRepeatMode: jest.fn(),
        }
        const result = {
            track: { title: 'Song A', author: 'Artist A' },
            searchResult: { playlist: null, tracks: [] },
        }
        getGuildSettingsMock.mockResolvedValue({ autoPlayEnabled: true })
        resolveGuildQueueMock
            .mockReturnValueOnce({ queue: null })
            .mockReturnValueOnce({ queue })

        await playCommand.execute({
            client: createClient(async () => result),
            interaction,
        } as any)

        expect(queue.setRepeatMode).toHaveBeenCalledWith(3)
        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Applied stored autoplay preference to queue',
                data: expect.objectContaining({ guildId: 'guild-1' }),
            }),
        )
    })

    it('does not override an active autoplay queue when stored preference is disabled', async () => {
        const interaction = createInteraction('guild-1')
        const queue = {
            repeatMode: 3,
            tracks: { size: 0 },
            setRepeatMode: jest.fn(),
        }
        const result = {
            track: { title: 'Song A', author: 'Artist A' },
            searchResult: { playlist: null, tracks: [] },
        }
        getGuildSettingsMock.mockResolvedValue({ autoPlayEnabled: false })
        resolveGuildQueueMock
            .mockReturnValueOnce({ queue })
            .mockReturnValueOnce({ queue })

        await playCommand.execute({
            client: createClient(async () => result),
            interaction,
        } as any)

        expect(queue.setRepeatMode).not.toHaveBeenCalled()
        expect(debugLogMock).not.toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Applied stored autoplay preference to queue',
            }),
        )
    })

    it('logs a warning when stored autoplay preference lookup fails', async () => {
        const interaction = createInteraction('guild-1')
        const queue = {
            repeatMode: 0,
            tracks: { size: 0 },
            setRepeatMode: jest.fn(),
        }
        const result = {
            track: { title: 'Song A', author: 'Artist A' },
            searchResult: { playlist: null, tracks: [] },
        }
        getGuildSettingsMock.mockRejectedValue(new Error('redis unavailable'))
        resolveGuildQueueMock
            .mockReturnValueOnce({ queue: null })
            .mockReturnValueOnce({ queue })

        await playCommand.execute({
            client: createClient(async () => result),
            interaction,
        } as any)

        expect(queue.setRepeatMode).not.toHaveBeenCalled()
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to apply stored autoplay preference',
                data: expect.objectContaining({ guildId: 'guild-1' }),
            }),
        )
    })

    it('does not overwrite repeat mode on an already active queue', async () => {
        const interaction = createInteraction('guild-1')
        const queue = {
            repeatMode: 3,
            tracks: {
                size: 1,
                toArray: () => [],
            },
            setRepeatMode: jest.fn(),
        }
        const result = {
            track: { title: 'Song A', author: 'Artist A' },
            searchResult: { playlist: null, tracks: [] },
        }
        getGuildSettingsMock.mockResolvedValue({ autoPlayEnabled: false })
        resolveGuildQueueMock.mockReturnValue({ queue })

        await playCommand.execute({
            client: createClient(async () => result),
            interaction,
        } as any)

        expect(queue.setRepeatMode).not.toHaveBeenCalled()
    })

    it('does not reinsert a manual track already queued by player.play in autoplay mode', async () => {
        const interaction = createInteraction('guild-1')
        const track = {
            id: 'track-1',
            url: 'https://example.com/track-1',
            title: 'Song A',
            author: 'Artist A',
        }

        resolveGuildQueueMock.mockReturnValue({
            queue: {
                repeatMode: 3,
                tracks: {
                    size: 2,
                    toArray: () => [
                        track,
                        {
                            id: 'track-2',
                            url: 'https://example.com/track-2',
                            title: 'Song B',
                            author: 'Artist B',
                            metadata: { isAutoplay: true },
                        },
                    ],
                },
            },
        })

        await playCommand.execute({
            client: createClient(async () => ({
                track,
                searchResult: { playlist: null, tracks: [] },
            })),
            interaction,
        } as any)

        expect(moveUserTrackToPriorityMock).not.toHaveBeenCalled()
        expect(blendAutoplayTracksMock).toHaveBeenCalledWith(
            expect.anything(),
            track,
        )
    })

    it('does not reinsert a manual track already queued by matching url', async () => {
        const interaction = createInteraction('guild-1')
        const track = {
            url: 'https://example.com/url-match',
            title: 'Song A',
            author: 'Artist A',
        }

        resolveGuildQueueMock.mockReturnValue({
            queue: {
                repeatMode: 3,
                tracks: {
                    size: 1,
                    toArray: () => [
                        {
                            url: 'https://example.com/url-match',
                            title: 'Queued',
                        },
                    ],
                },
            },
        })

        await playCommand.execute({
            client: createClient(async () => ({
                track,
                searchResult: { playlist: null, tracks: [] },
            })),
            interaction,
        } as any)

        expect(moveUserTrackToPriorityMock).not.toHaveBeenCalled()
    })

    it('does not reinsert the same track object already queued', async () => {
        const interaction = createInteraction('guild-1')
        const track = {
            title: 'Song A',
            author: 'Artist A',
        }

        resolveGuildQueueMock.mockReturnValue({
            queue: {
                repeatMode: 3,
                tracks: {
                    size: 1,
                    toArray: () => [track],
                },
            },
        })

        await playCommand.execute({
            client: createClient(async () => ({
                track,
                searchResult: { playlist: null, tracks: [] },
            })),
            interaction,
        } as any)

        expect(moveUserTrackToPriorityMock).not.toHaveBeenCalled()
    })

    it('stops when voice channel validation fails', async () => {
        requireVoiceChannelMock.mockResolvedValue(false)
        const interaction = createInteraction('guild-1')

        await playCommand.execute({
            client: createClient(async () => ({})),
            interaction,
        } as any)

        expect(interaction.deferReply).not.toHaveBeenCalled()
        expect(interaction.editReply).not.toHaveBeenCalled()
    })

    it('handles play failures', async () => {
        const interaction = createInteraction('guild-1')

        await playCommand.execute({
            client: createClient(async () => {
                throw new Error('Search failed')
            }),
            interaction,
        } as any)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Play command error:',
                data: expect.objectContaining({ guildId: 'guild-1' }),
            }),
        )
        expect(interaction.editReply).toHaveBeenCalled()
        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Play Error',
            expect.stringContaining('Could not find'),
        )
    })

    it('ignores unknown interaction errors thrown during deferReply', async () => {
        const interaction = createInteraction('guild-1')
        interaction.deferReply.mockRejectedValue(
            Object.assign(new Error('Unknown interaction'), { code: 10062 }),
        )

        await playCommand.execute({
            client: createClient(async () => ({
                track: { title: 'Song A', author: 'Artist A' },
                searchResult: { playlist: null, tracks: [] },
            })),
            interaction,
        } as any)

        expect(errorLogMock).not.toHaveBeenCalled()
        expect(interaction.editReply).not.toHaveBeenCalled()
    })

    it('ignores unknown interaction errors thrown during play flow', async () => {
        const interaction = createInteraction('guild-1')

        await playCommand.execute({
            client: createClient(async () => {
                throw Object.assign(new Error('Unknown interaction'), {
                    code: 10062,
                })
            }),
            interaction,
        } as any)

        expect(errorLogMock).not.toHaveBeenCalled()
        expect(interaction.editReply).not.toHaveBeenCalled()
    })

    it('logs a warning when sending the play error reply also fails', async () => {
        const interaction = createInteraction('guild-1')
        interaction.editReply.mockRejectedValue(new Error('reply failed'))

        await playCommand.execute({
            client: createClient(async () => {
                throw Object.assign(new Error('Search failed'), { code: 123 })
            }),
            interaction,
        } as any)

        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to send play command error reply',
                data: expect.objectContaining({ guildId: 'guild-1' }),
            }),
        )
    })
})
