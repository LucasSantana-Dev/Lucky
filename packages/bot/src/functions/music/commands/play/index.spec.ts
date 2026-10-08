import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { EventEmitter } from 'node:events'

// Transitively pulled in via playHandler -> skipCircuitBreaker; real module loads
// prismaClient (import.meta). Factory-mock to keep this suite loadable.
jest.mock('@lucky/shared/services/recommendationTelemetryReadService', () => ({
    getAutoplaySkipRateForGuild: jest.fn(),
}))

const flushPromises = () =>
    new Promise<void>((resolve) => setImmediate(resolve))

const requireVoiceChannelMock =
    jest.fn<(interaction: unknown) => Promise<boolean>>()
const requireDJRoleMock = jest.fn()
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
const interactionReplyMock = jest.fn<(payload: unknown) => Promise<void>>()
const buildPlayResponseEmbedMock = jest.fn<(payload: unknown) => unknown>()
const createMusicControlButtonsMock = jest.fn<(queue: unknown) => unknown>()
const registerNowPlayingMessageMock =
    jest.fn<(guildId: string, messageId: string, channelId: string) => void>()

jest.mock('../../../../handlers/player/nowPlayingDisplay', () => ({
    registerNowPlayingMessage: (
        guildId: string,
        messageId: string,
        channelId: string,
    ) => registerNowPlayingMessageMock(guildId, messageId, channelId),
}))

jest.mock('discord-player', () => ({
    QueueRepeatMode: { OFF: 0, AUTOPLAY: 3 },
    QueryType: {
        AUTO: 'auto',
        SPOTIFY_SEARCH: 'spotifySearch',
        YOUTUBE_SEARCH: 'youtubeSearch',
        SOUNDCLOUD_SEARCH: 'soundcloudSearch',
    },
}))

jest.mock('../../../../services/musicManagement/queueManipulation', () => ({
    moveUserTrackToPriority: (queue: unknown, track: unknown) =>
        moveUserTrackToPriorityMock(queue, track),
    blendAutoplayTracks: (queue: unknown, track: unknown) =>
        blendAutoplayTracksMock(queue, track),
}))

jest.mock('../../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: (client: unknown, guildId: string) =>
        resolveGuildQueueMock(client, guildId),
}))

jest.mock('../../../../utils/command/commandValidations', () => ({
    requireVoiceChannel: (interaction: unknown) =>
        requireVoiceChannelMock(interaction),
    requireDJRole: (...args: unknown[]) => requireDJRoleMock(...args),
    requireDJRoleInGuild: (...args: unknown[]) => requireDJRoleMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (payload: unknown) => errorLogMock(payload),
    debugLog: (payload: unknown) => debugLogMock(payload),
    warnLog: (payload: unknown) => warnLogMock(payload),
}))

const addBreadcrumbMock = jest.fn()
jest.mock('@lucky/shared/utils/monitoring', () => ({
    addBreadcrumb: (...args: unknown[]) => addBreadcrumbMock(...args),
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

jest.mock(
    '../../../../services/musicRecommendation/collaborativePlaylist',
    () => ({
        collaborativePlaylistService: {
            canAddTracks: () => canAddTracksMock(),
            recordContribution: (
                guildId: string,
                userId: string,
                amount: number,
            ) => recordContributionMock(guildId, userId, amount),
        },
    }),
)

jest.mock('../../../../utils/general/interactionReply', () => ({
    interactionReply: (payload: unknown) => interactionReplyMock(payload),
}))

jest.mock('../../../../utils/music/nowPlayingEmbed', () => ({
    buildPlayResponseEmbed: (payload: unknown) =>
        buildPlayResponseEmbedMock(payload),
}))

jest.mock('../../../../utils/music/buttonComponents', () => ({
    createMusicControlButtons: (queue: unknown) =>
        createMusicControlButtonsMock(queue),
}))

jest.mock('@lucky/shared/utils/general/errorSanitizer', () => ({
    createUserFriendlyError: (error: unknown) => 'User friendly error',
}))

import playCommand from './index'
import { settlePlayStartWatch } from '../../../../handlers/player/playStartWatch'
import { takeCommandOutcome } from '../../../../utils/monitoring/commandOutcome'

function createInteraction(guildId: string | null) {
    return {
        guildId,
        user: {
            id: 'user-1',
            tag: 'TestUser#0001',
            displayAvatarURL: jest.fn(() => 'https://cdn.example/avatar.png'),
        },
        channel: { id: 'channel-1' },
        member: { voice: { channel: { id: 'voice-1' } } },
        channelId: 'channel-1',
        options: {
            getString: jest.fn(() => 'test query'),
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
        fetchReply: jest
            .fn()
            .mockResolvedValue({ id: 'msg-123', channelId: 'channel-1' }),
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
            events: new EventEmitter(),
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
        requireDJRoleMock.mockResolvedValue(true)
        blendAutoplayTracksMock.mockResolvedValue(undefined)
        canAddTracksMock.mockReturnValue({
            allowed: true,
            limit: 3,
        })
        getGuildSettingsMock.mockResolvedValue(null)
        resolveGuildQueueMock.mockReturnValue({ queue: null })
        interactionReplyMock.mockResolvedValue(undefined)
        buildPlayResponseEmbedMock.mockReturnValue({
            title: 'Now Playing',
            description: 'test track',
        })
        createMusicControlButtonsMock.mockReturnValue({
            type: 1,
            components: [],
        })
    })

    it('rejects command outside guilds', async () => {
        const interaction = createInteraction(null)

        await playCommand.execute({
            client: createClient(async () => ({})),
            interaction,
        } as any)

        expect(interaction.deferReply).not.toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    embeds: expect.any(Array),
                    ephemeral: true,
                }),
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
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                interaction,
                content: expect.objectContaining({ embeds: expect.any(Array) }),
            }),
        )
        expect(interaction.editReply).not.toHaveBeenCalled()
    })

    it('uses interactionReply for collaborative-limit replies', async () => {
        const interaction = createInteraction('guild-1')
        canAddTracksMock.mockReturnValue({
            allowed: false,
            limit: 1,
        })

        await playCommand.execute({
            client: createClient(async () => ({})),
            interaction,
        } as any)

        expect(errorLogMock).not.toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                interaction,
                content: expect.objectContaining({
                    embeds: expect.any(Array),
                }),
            }),
        )
        expect(debugLogMock).not.toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Play command interaction expired before editReply',
            }),
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
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                interaction,
                content: expect.objectContaining({ embeds: expect.any(Array) }),
            }),
        )
        expect(interaction.editReply).not.toHaveBeenCalled()
        // The command no longer uses createSuccessEmbed — the new
        // buildPlayResponseEmbed helper builds an EmbedBuilder directly.
        // We verify the reply carries an embed above; no need to assert
        // the specific helper was called.
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

    it('logs error when recordContribution throws but play still succeeds', async () => {
        const interaction = createInteraction('guild-1')
        const result = {
            track: { title: 'Song A', author: 'Artist A' },
            searchResult: { playlist: null, tracks: [] },
        }
        const client = createClient(async () => result, {
            repeatMode: 3,
            tracksSize: 2,
        })
        recordContributionMock.mockImplementation(() => {
            throw new Error('state error')
        })

        await playCommand.execute({ client, interaction } as any)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to record contribution',
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalled()
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

        // Wait for background operations to complete
        await flushPromises()

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

        // Wait for background operations to complete
        await flushPromises()

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

    it('calls moveUserTrackToPriority even when track is already queued in autoplay mode', async () => {
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

        // Wait for background operations to complete
        await flushPromises()

        expect(moveUserTrackToPriorityMock).toHaveBeenCalled()
        expect(blendAutoplayTracksMock).toHaveBeenCalledWith(
            expect.anything(),
            track,
        )
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
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                interaction,
                content: expect.objectContaining({
                    embeds: expect.any(Array),
                }),
            }),
        )
        expect(interaction.editReply).not.toHaveBeenCalled()
        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Play Error',
            expect.any(String),
        )
    })

    it('reports real elapsed latency on the failed resolution breadcrumb', async () => {
        const interaction = createInteraction('guild-1')
        let now = 1_000_000
        const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now)

        try {
            await playCommand.execute({
                client: createClient(async () => {
                    now += 4_200
                    throw new Error('Search failed')
                }),
                interaction,
            } as any)
        } finally {
            nowSpy.mockRestore()
        }

        const failed = addBreadcrumbMock.mock.calls.find(
            (c) => c[0] === 'play_provider_resolution: failed',
        )
        expect(failed).toBeDefined()
        const data = failed?.[3] as { latencyMs: number }
        expect(data.latencyMs).toBeGreaterThan(0)
        expect(data.latencyMs).toBeGreaterThanOrEqual(4_200)
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

    it('uses interactionReply for play error replies', async () => {
        const interaction = createInteraction('guild-1')

        await playCommand.execute({
            client: createClient(async () => {
                throw Object.assign(new Error('Search failed'), { code: 123 })
            }),
            interaction,
        } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                interaction,
                content: expect.objectContaining({ embeds: expect.any(Array) }),
            }),
        )
        expect(warnLogMock).not.toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to send play command error reply',
            }),
        )
    })

    it('logs error and replies when queue blending fails', async () => {
        const interaction = createInteraction('guild-1')
        const track = {
            id: 'track-1',
            url: 'https://example.com/track-1',
            title: 'Song A',
            author: 'Artist A',
        }
        blendAutoplayTracksMock.mockRejectedValue(new Error('blend error'))

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

        // Wait for background operations to complete
        await flushPromises()

        expect(blendAutoplayTracksMock).toHaveBeenCalledWith(
            expect.anything(),
            track,
        )
        // Each post-play bg op is isolated; a blend failure is logged per-op
        // (see runPostPlayBackgroundOps) rather than as one shared catch.
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Post-play background op failed: blendAutoplayTracks',
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                interaction,
                content: expect.objectContaining({ embeds: expect.any(Array) }),
            }),
        )
    })

    it('falls back through YouTube to SoundCloud when both Spotify and YouTube fail', async () => {
        const interaction = createInteraction('guild-1')
        const result = {
            track: { title: 'Song A', author: 'Artist A' },
            searchResult: { playlist: null, tracks: [] },
        }

        let playCallCount = 0
        const playImpl = async (...args: unknown[]) => {
            playCallCount++
            if (playCallCount === 1) {
                // First call (Spotify) fails
                throw new Error('Spotify search failed')
            } else if (playCallCount === 2) {
                // Second call (YouTube) fails
                throw new Error('YouTube search failed')
            } else {
                // Third call (SoundCloud) succeeds
                return result
            }
        }

        const client = createClient(playImpl, {
            repeatMode: 3,
            tracksSize: 2,
        })

        await playCommand.execute({
            client,
            interaction,
        } as any)

        expect(client.player.play).toHaveBeenCalledTimes(3)
        // First attempt with default provider (SPOTIFY_SEARCH)
        expect(client.player.play).toHaveBeenNthCalledWith(
            1,
            expect.anything(),
            'test query',
            expect.objectContaining({
                searchEngine: 'spotifySearch',
            }),
        )
        // Second attempt with YouTube
        expect(client.player.play).toHaveBeenNthCalledWith(
            2,
            expect.anything(),
            'test query',
            expect.objectContaining({
                searchEngine: 'youtubeSearch',
            }),
        )
        // Third attempt with SoundCloud
        expect(client.player.play).toHaveBeenNthCalledWith(
            3,
            expect.anything(),
            'test query',
            expect.objectContaining({
                searchEngine: 'soundcloudSearch',
            }),
        )
        // Should log warnings for first two failures
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringMatching(/Primary search failed/i),
            }),
        )
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringMatching(/YouTube search failed/i),
            }),
        )
        // Should still reply with success
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                interaction,
                content: expect.objectContaining({ embeds: expect.any(Array) }),
            }),
        )
    })

    it('pre-registers deferred reply message when queue was empty before play', async () => {
        const interaction = createInteraction('guild-1')
        const result = {
            track: { title: 'Song A', author: 'Artist A' },
            searchResult: { playlist: null, tracks: [] },
        }
        resolveGuildQueueMock
            .mockReturnValueOnce({ queue: null })
            .mockReturnValueOnce({ queue: null })

        await playCommand.execute({
            client: createClient(async () => result),
            interaction,
        } as any)

        expect(interaction.fetchReply).toHaveBeenCalled()
        expect(registerNowPlayingMessageMock).toHaveBeenCalledWith(
            'guild-1',
            'msg-123',
            'channel-1',
        )
    })

    it('skips now-playing pre-registration when queue was already active', async () => {
        const interaction = createInteraction('guild-1')
        const existingQueue = {
            repeatMode: 3,
            tracks: { size: 1, toArray: () => [] },
        }
        const result = {
            track: { title: 'Song A', author: 'Artist A' },
            searchResult: { playlist: null, tracks: [] },
        }
        resolveGuildQueueMock.mockReturnValue({ queue: existingQueue })

        await playCommand.execute({
            client: createClient(async () => result),
            interaction,
        } as any)

        expect(registerNowPlayingMessageMock).not.toHaveBeenCalled()
    })

    it('silently continues when fetchReply throws during now-playing pre-registration', async () => {
        const interaction = createInteraction('guild-1')
        interaction.fetchReply.mockRejectedValue(
            new Error('interaction expired'),
        )
        const result = {
            track: { title: 'Song A', author: 'Artist A' },
            searchResult: { playlist: null, tracks: [] },
        }
        resolveGuildQueueMock
            .mockReturnValueOnce({ queue: null })
            .mockReturnValueOnce({ queue: null })

        await expect(
            playCommand.execute({
                client: createClient(async () => result),
                interaction,
            } as any),
        ).resolves.not.toThrow()

        expect(registerNowPlayingMessageMock).not.toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalled()
    })

    it('captures vc member ids in queue metadata when voiceChannel.members is set', async () => {
        let capturedPlayOptions: any

        const client = createClient(
            (_track: unknown, _query: unknown, opts: unknown) => {
                capturedPlayOptions = opts
                return Promise.resolve()
            },
        )

        const interaction = createInteraction('guild-1')
        interaction.member.voice.channel.members = new Map([
            ['user-1', { id: 'user-1' }],
            ['user-2', { id: 'user-2' }],
            ['bot-1', { id: 'bot-1' }],
        ])
        client.user = { id: 'bot-1' }

        getGuildSettingsMock.mockResolvedValue({ autoPlayEnabled: false })
        resolveGuildQueueMock.mockReturnValue({ queue: null })
        canAddTracksMock.mockReturnValue({ allowed: true, limit: 10 })

        await playCommand.execute({ client, interaction } as any)

        const vcMemberIds =
            capturedPlayOptions?.nodeOptions?.metadata?.vcMemberIds
        expect(vcMemberIds).toBeDefined()
        expect(vcMemberIds).toContain('user-1')
        expect(vcMemberIds).toContain('user-2')
        expect(vcMemberIds).not.toContain('bot-1')
    })
})

describe('play command: early reply and start failure (#2741)', () => {
    const track = {
        id: 'track-1',
        title: 'Song A',
        author: 'Artist A',
        url: 'https://example.com/a',
        metadata: null,
        setMetadata: jest.fn(),
    }
    const searchResult = {
        playlist: null,
        tracks: [track],
        hasPlaylist: () => false,
        isEmpty: () => false,
    }
    const queueOf = (guildId: string) => ({ guild: { id: guildId } })
    const afterSearchOf = (opts: unknown) =>
        (opts as { afterSearch: (r: unknown) => Promise<unknown> }).afterSearch

    beforeEach(() => {
        jest.clearAllMocks()
        requireVoiceChannelMock.mockResolvedValue(true)
        requireDJRoleMock.mockResolvedValue(true)
        blendAutoplayTracksMock.mockResolvedValue(undefined)
        canAddTracksMock.mockReturnValue({ allowed: true, limit: 3 })
        getGuildSettingsMock.mockResolvedValue(null)
        resolveGuildQueueMock.mockReturnValue({ queue: null })
        interactionReplyMock.mockResolvedValue(undefined)
        buildPlayResponseEmbedMock.mockReturnValue({ title: 'embed' })
    })

    it('replies right after the search, before play() resolves', async () => {
        const interaction = createInteraction('guild-1')
        let releasePlay!: () => void
        const playGate = new Promise<void>((resolve) => {
            releasePlay = resolve
        })
        const client = createClient(
            async (_channel: unknown, _query: unknown, opts: unknown) => {
                await afterSearchOf(opts)(searchResult)
                await playGate
                return { track, searchResult }
            },
        )

        const pending = playCommand.execute({ client, interaction } as any)
        await flushPromises()

        // Voice connect and the stream bridge are still pending here.
        expect(interactionReplyMock).toHaveBeenCalledTimes(1)
        expect(buildPlayResponseEmbedMock).toHaveBeenCalledWith(
            expect.objectContaining({ kind: 'addedToQueue', track }),
        )
        expect(recordContributionMock).not.toHaveBeenCalled()

        releasePlay()
        await pending

        // Success path unchanged: still exactly one reply, no correction edit.
        expect(interactionReplyMock).toHaveBeenCalledTimes(1)
        expect(interaction.editReply).not.toHaveBeenCalled()
        expect(recordContributionMock).toHaveBeenCalledTimes(1)
        expect(takeCommandOutcome(interaction)).toBeUndefined()
        expect(client.player.events.listenerCount('playerSkip')).toBe(0)
        expect(client.player.events.listenerCount('playerError')).toBe(0)
    })

    it('edits the reply to an error when every stream source failed', async () => {
        const interaction = createInteraction('guild-1')
        const client = createClient(
            async (_channel: unknown, _query: unknown, opts: unknown) => {
                await afterSearchOf(opts)(searchResult)
                // What discord-player's throw_fn does: events, no throw.
                client.player.events.emit(
                    'playerSkip',
                    queueOf('guild-1'),
                    track,
                    'ERR_NO_STREAM',
                    'Could not extract stream',
                )
                client.player.events.emit(
                    'playerError',
                    queueOf('guild-1'),
                    new Error('Could not extract stream'),
                    track,
                )
                // Stream recovery searches, finds nothing and gives up later.
                setTimeout(
                    () =>
                        settlePlayStartWatch(
                            'guild-1',
                            track as never,
                            'gave_up',
                        ),
                    5,
                )
                return { track, searchResult }
            },
        )

        await playCommand.execute({ client, interaction } as any)

        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            'Play Error',
            expect.stringContaining('Could not start **Song A**'),
        )
        expect(interaction.editReply).toHaveBeenCalledTimes(1)
        expect(interaction.editReply).toHaveBeenCalledWith({
            embeds: [expect.objectContaining({ type: 'error' })],
        })
        // The early "added" reply went through interactionReply once; the
        // failure is an edit, not a stacked follow-up.
        expect(interactionReplyMock).toHaveBeenCalledTimes(1)
        expect(recordContributionMock).not.toHaveBeenCalled()
        expect(takeCommandOutcome(interaction)).toEqual({
            outcome: 'error',
            errorClass: 'StreamStartFailed',
        })
        expect(client.player.events.listenerCount('playerSkip')).toBe(0)
        expect(client.player.events.listenerCount('playerError')).toBe(0)
    })

    it('sends the failure to the channel when the reply can no longer be edited', async () => {
        const interaction = createInteraction('guild-1')
        interaction.editReply.mockRejectedValue(
            Object.assign(new Error('Invalid Webhook Token'), { code: 50027 }),
        )
        interaction.channel = { id: 'channel-1', send: jest.fn() }
        const client = createClient(
            async (_channel: unknown, _query: unknown, opts: unknown) => {
                await afterSearchOf(opts)(searchResult)
                client.player.events.emit(
                    'playerError',
                    queueOf('guild-1'),
                    new Error('x'),
                    track,
                )
                settlePlayStartWatch('guild-1', track as never, 'gave_up')
                return { track, searchResult }
            },
        )

        await playCommand.execute({ client, interaction } as any)

        expect(interaction.channel.send).toHaveBeenCalledWith({
            embeds: [expect.objectContaining({ type: 'error' })],
        })
    })

    it('keeps the queued reply when stream recovery starts a replacement', async () => {
        const interaction = createInteraction('guild-1')
        interaction.channel = { id: 'channel-1', send: jest.fn() }
        const client = createClient(
            async (_channel: unknown, _query: unknown, opts: unknown) => {
                await afterSearchOf(opts)(searchResult)
                client.player.events.emit(
                    'playerError',
                    queueOf('guild-1'),
                    new Error('Could not extract stream'),
                    track,
                )
                setTimeout(
                    () =>
                        settlePlayStartWatch(
                            'guild-1',
                            track as never,
                            'recovered',
                        ),
                    5,
                )
                return { track, searchResult }
            },
        )

        await playCommand.execute({ client, interaction } as any)

        // A replacement plays, so no failure message of any kind.
        expect(interaction.editReply).not.toHaveBeenCalled()
        expect(interaction.channel.send).not.toHaveBeenCalled()
        expect(createErrorEmbedMock).not.toHaveBeenCalled()
        expect(takeCommandOutcome(interaction)).toBeUndefined()
        expect(recordContributionMock).toHaveBeenCalledTimes(1)
    })

    it('closes the watch so a later failure of the same track is not swallowed', async () => {
        const interaction = createInteraction('guild-1')
        const client = createClient(
            async (_channel: unknown, _query: unknown, opts: unknown) => {
                await afterSearchOf(opts)(searchResult)
                return { track, searchResult }
            },
        )

        await playCommand.execute({ client, interaction } as any)

        // Recovery for this track later (queue advance) must find no watcher
        // and keep notifying the channel itself.
        expect(settlePlayStartWatch('guild-1', track as never, 'gave_up')).toBe(
            false,
        )
    })

    it('ignores a stream failure that belongs to another guild or track', async () => {
        const interaction = createInteraction('guild-1')
        const client = createClient(
            async (_channel: unknown, _query: unknown, opts: unknown) => {
                await afterSearchOf(opts)(searchResult)
                client.player.events.emit(
                    'playerError',
                    queueOf('guild-2'),
                    new Error('x'),
                    track,
                )
                client.player.events.emit(
                    'playerError',
                    queueOf('guild-1'),
                    new Error('x'),
                    { ...track, id: 'other-track' },
                )
                return { track, searchResult }
            },
        )

        await playCommand.execute({ client, interaction } as any)

        expect(interaction.editReply).not.toHaveBeenCalled()
        expect(takeCommandOutcome(interaction)).toBeUndefined()
        expect(recordContributionMock).toHaveBeenCalledTimes(1)
    })

    it('replaces the early reply with an error when play() rejects after it', async () => {
        const interaction = createInteraction('guild-1')
        const client = createClient(
            async (_channel: unknown, _query: unknown, opts: unknown) => {
                await afterSearchOf(opts)(searchResult)
                throw new Error('Voice connection timed out')
            },
        )

        await playCommand.execute({ client, interaction } as any)

        expect(interaction.editReply).toHaveBeenCalledWith({
            embeds: [expect.objectContaining({ type: 'error' })],
        })
        // Not a second (ephemeral) reply on top of the early one.
        expect(interactionReplyMock).toHaveBeenCalledTimes(1)
        expect(takeCommandOutcome(interaction)).toMatchObject({
            outcome: 'error',
            errorClass: 'Error',
        })
        expect(client.player.events.listenerCount('playerError')).toBe(0)
    })

    it('records a search with no results as a user error', async () => {
        const interaction = createInteraction('guild-1')

        await playCommand.execute({
            client: createClient(async () => {
                throw new Error('No results found for "zzz"')
            }),
            interaction,
        } as any)

        expect(takeCommandOutcome(interaction)).toMatchObject({
            outcome: 'user_error',
        })
    })

    it('corrects the early queue position once the track is really queued', async () => {
        const interaction = createInteraction('guild-1')
        // Estimate at search time: size 1 + 1 = #2. After play() the track is
        // first in the queue, so the real position is #1.
        resolveGuildQueueMock.mockReturnValue({
            queue: {
                repeatMode: 0,
                tracks: { size: 1, toArray: () => [track] },
            },
        })
        const client = createClient(
            async (_channel: unknown, _query: unknown, opts: unknown) => {
                await afterSearchOf(opts)(searchResult)
                return { track, searchResult }
            },
        )

        await playCommand.execute({ client, interaction } as any)
        await flushPromises()

        expect(buildPlayResponseEmbedMock).toHaveBeenCalledWith(
            expect.objectContaining({ queuePosition: 2 }),
        )
        expect(buildPlayResponseEmbedMock).toHaveBeenLastCalledWith(
            expect.objectContaining({ queuePosition: 1 }),
        )
        expect(interaction.editReply).toHaveBeenCalledTimes(1)
    })
})
