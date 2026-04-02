import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const requireVoiceChannelMock = jest.fn()
const errorLogMock = jest.fn()
const debugLogMock = jest.fn()
const warnLogMock = jest.fn()
const getGuildSettingsMock = jest.fn()
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
const moveUserTrackToPriorityMock = jest.fn()
const blendAutoplayTracksMock = jest.fn().mockResolvedValue(undefined)

jest.mock('discord-player', () => ({
    QueueRepeatMode: { OFF: 0, AUTOPLAY: 3 },
}))

jest.mock('../../../../utils/music/queueManipulation', () => ({
    moveUserTrackToPriority: (...args: unknown[]) =>
        moveUserTrackToPriorityMock(...args),
    blendAutoplayTracks: (...args: unknown[]) =>
        blendAutoplayTracksMock(...args),
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
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: {
        getGuildSettings: (...args: unknown[]) => getGuildSettingsMock(...args),
    },
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
        resolveGuildQueueMock.mockReturnValue({ queue })

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
        resolveGuildQueueMock.mockReturnValue({ queue })

        await playCommand.execute({
            client: createClient(async () => result),
            interaction,
        } as any)

        expect(queue.setRepeatMode).toHaveBeenCalledWith(0)
        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Applied stored autoplay preference to queue',
                data: expect.objectContaining({ autoPlayEnabled: false }),
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
        resolveGuildQueueMock.mockReturnValue({ queue })

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
