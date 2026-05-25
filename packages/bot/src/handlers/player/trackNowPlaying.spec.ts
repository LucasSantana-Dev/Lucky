import {
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'
import type { TextChannel, Message } from 'discord.js'
import {
    registerNowPlayingMessage,
    getSongInfoMessage,
    deleteSongInfoMessage,
    cleanupGuildState,
    sendNowPlayingEmbed,
    updateLastFmNowPlaying,
    scrobbleCurrentTrackIfLastFm,
} from './trackNowPlaying'
import {
    createMockGuild,
    createMockTextChannel,
} from '../../../tests/__mocks__/discord'

const debugLogMock = jest.fn()
const errorLogMock = jest.fn()
const warnLogMock = jest.fn()
const createEmbedMock = jest.fn()
const getAutoplayCountMock = jest.fn()
const createMusicControlButtonsMock = jest.fn()
const createMusicActionButtonsMock = jest.fn()
const isLastFmConfiguredMock = jest.fn()
const getSessionKeyForUserMock = jest.fn()
const lastFmUpdateNowPlayingMock = jest.fn()
const lastFmScrobbleMock = jest.fn()
const getTrackMetadataMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

jest.mock('../../utils/general/embeds', () => ({
    createEmbed: (...args: unknown[]) => createEmbedMock(...args),
    EMBED_COLORS: {
        MUSIC: '#1DB954',
    },
}))

jest.mock('../../utils/music/autoplayManager', () => ({
    getAutoplayCount: (...args: unknown[]) => getAutoplayCountMock(...args),
}))

jest.mock('../../utils/music/buttonComponents', () => ({
    createMusicControlButtons: (...args: unknown[]) =>
        createMusicControlButtonsMock(...args),
    createMusicActionButtons: (...args: unknown[]) =>
        createMusicActionButtonsMock(...args),
}))

jest.mock('../../lastfm', () => ({
    isLastFmConfigured: (...args: unknown[]) => isLastFmConfiguredMock(...args),
    getSessionKeyForUser: (...args: unknown[]) =>
        getSessionKeyForUserMock(...args),
    getTrackMetadata: (...args: unknown[]) => getTrackMetadataMock(...args),
    updateNowPlaying: (...args: unknown[]) =>
        lastFmUpdateNowPlayingMock(...args),
    scrobble: (...args: unknown[]) => lastFmScrobbleMock(...args),
}))

jest.mock('@lucky/shared/config', () => ({
    constants: {
        MAX_AUTOPLAY_TRACKS: 50,
    },
}))

describe('trackNowPlaying handlers', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        createEmbedMock.mockReturnValue({ title: 'test embed' })
        createMusicControlButtonsMock.mockReturnValue([])
        createMusicActionButtonsMock.mockReturnValue([])
        getTrackMetadataMock.mockResolvedValue(null)
    })

    describe('TrackNowPlayingState - registerNowPlayingMessage', () => {
        it('registers and overwrites messages for a guild', () => {
            const guildId = 'guild-123'

            registerNowPlayingMessage(guildId, 'message-1', 'channel-1')
            let result = getSongInfoMessage(guildId)
            expect(result).toEqual({
                messageId: 'message-1',
                channelId: 'channel-1',
            })

            registerNowPlayingMessage(guildId, 'message-2', 'channel-2')
            result = getSongInfoMessage(guildId)
            expect(result).toEqual({
                messageId: 'message-2',
                channelId: 'channel-2',
            })
        })
    })

    describe('TrackNowPlayingState - getSongInfoMessage', () => {
        it('returns undefined for unregistered guild and stored info for registered', () => {
            expect(getSongInfoMessage('non-existent-guild')).toBeUndefined()

            const guildId = 'guild-123'
            registerNowPlayingMessage(guildId, 'msg-1', 'ch-1')
            const result = getSongInfoMessage(guildId)
            expect(result?.messageId).toBe('msg-1')
            expect(result?.channelId).toBe('ch-1')
        })
    })

    describe('TrackNowPlayingState - deleteSongInfoMessage', () => {
        it('removes registered message and silently succeeds on non-existent', () => {
            const guildId = 'guild-123'
            registerNowPlayingMessage(guildId, 'msg-1', 'ch-1')
            expect(getSongInfoMessage(guildId)).toBeDefined()

            deleteSongInfoMessage(guildId)
            expect(getSongInfoMessage(guildId)).toBeUndefined()

            expect(() => deleteSongInfoMessage('non-existent')).not.toThrow()
        })
    })

    describe('TrackNowPlayingState - cleanupGuild', () => {
        it('cleans up state and logs with guild id', () => {
            const guildId = 'guild-123'
            registerNowPlayingMessage(guildId, 'msg-1', 'ch-1')

            cleanupGuildState(guildId)

            expect(getSongInfoMessage(guildId)).toBeUndefined()
            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Cleaned up now-playing state for guild',
                    data: { guildId },
                }),
            )
        })
    })

    describe('sendNowPlayingEmbed', () => {
        let mockChannel: TextChannel
        let mockGuild
        let mockQueue: GuildQueue
        let mockTrack: Track

        beforeEach(() => {
            mockGuild = createMockGuild()
            mockChannel = createMockTextChannel()
            mockQueue = {
                guild: mockGuild,
                metadata: { channel: mockChannel },
            } as unknown as GuildQueue
            mockTrack = {
                title: 'Test Song',
                author: 'Test Artist',
                url: 'https://youtube.com/watch?v=test',
                duration: '3:45',
                durationMS: 225000,
                thumbnail: 'https://example.com/thumb.jpg',
                requestedBy: null,
                metadata: undefined,
            } as unknown as Track
        })

        it('returns early if metadata channel is missing', async () => {
            const queueNoChannel = {
                guild: mockGuild,
                metadata: {},
            } as unknown as GuildQueue

            await sendNowPlayingEmbed(queueNoChannel, mockTrack, false)

            expect(createEmbedMock).not.toHaveBeenCalled()
        })

        it('sends a new now-playing embed when no previous message exists', async () => {
            const mockMessage = {
                id: 'message-123',
                edit: jest.fn(),
            } as unknown as Message

            mockChannel.send = jest.fn().mockResolvedValue(mockMessage)

            await sendNowPlayingEmbed(mockQueue, mockTrack, false)

            expect(createMusicControlButtonsMock).toHaveBeenCalledWith(
                mockQueue,
            )
            expect(mockChannel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: [{ title: 'test embed' }],
                    components: [[], []],
                }),
            )
        })

        it('creates embed with proper color and footer variants', async () => {
            const mockMessage = { id: 'msg-1' } as unknown as Message
            mockChannel.send = jest.fn().mockResolvedValue(mockMessage)

            const userTrack = {
                ...mockTrack,
                requestedBy: { username: 'TestUser', id: 'user-123' },
            } as unknown as Track

            await sendNowPlayingEmbed(mockQueue, userTrack, false)

            expect(createEmbedMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: '🎵 Now Playing',
                    color: '#1DB954',
                    footer: 'Added by TestUser',
                }),
            )

            jest.clearAllMocks()
            createEmbedMock.mockReturnValue({ title: 'test embed' })
            getAutoplayCountMock.mockResolvedValue(5)

            await sendNowPlayingEmbed(mockQueue, mockTrack, true)

            expect(createEmbedMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    footer: 'Autoplay • 5/50 songs',
                }),
            )
        })

        it('creates embed with track metadata fields', async () => {
            const mockMessage = { id: 'msg-1' } as unknown as Message
            mockChannel.send = jest.fn().mockResolvedValue(mockMessage)

            await sendNowPlayingEmbed(mockQueue, mockTrack, false)

            const embedCall = createEmbedMock.mock.calls[0][0]
            expect(embedCall.fields).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: '⏱️ Duration',
                        value: '3:45',
                    }),
                    expect.objectContaining({
                        name: '🌐 Source',
                        value: 'YouTube',
                    }),
                ]),
            )
        })

        it('edits previous message if it still exists in channel', async () => {
            const prevMessageId = 'prev-msg-123'
            registerNowPlayingMessage(
                mockGuild.id,
                prevMessageId,
                mockChannel.id,
            )

            const prevMessage = {
                id: prevMessageId,
                edit: jest.fn().mockResolvedValue(undefined),
            } as unknown as Message
            const fetchMock = jest.fn().mockResolvedValue(prevMessage)
            mockChannel.messages = { fetch: fetchMock } as unknown as any

            await sendNowPlayingEmbed(mockQueue, mockTrack, false)

            expect(fetchMock).toHaveBeenCalledWith(prevMessageId)
            expect(prevMessage.edit).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: [{ title: 'test embed' }],
                    components: [[], []],
                }),
            )
        })

        it('sends new message if previous message fetch fails', async () => {
            const prevMessageId = 'prev-msg-123'
            registerNowPlayingMessage(
                mockGuild.id,
                prevMessageId,
                mockChannel.id,
            )

            const fetchMock = jest
                .fn()
                .mockRejectedValue(new Error('Not found'))
            mockChannel.messages = { fetch: fetchMock } as unknown as any

            const newMessage = { id: 'new-msg-456' } as unknown as Message
            mockChannel.send = jest.fn().mockResolvedValue(newMessage)

            await sendNowPlayingEmbed(mockQueue, mockTrack, false)

            expect(mockChannel.send).toHaveBeenCalled()
            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Failed to update'),
                }),
            )
        })
    })

    describe('updateLastFmNowPlaying', () => {
        let mockQueue: GuildQueue
        let mockTrack: Track

        beforeEach(() => {
            mockQueue = {
                guild: createMockGuild(),
            } as unknown as GuildQueue
            mockTrack = {
                title: 'Test Song',
                author: 'Test Artist',
                durationMS: 225000,
                requestedBy: { id: 'user-123' },
                metadata: undefined,
            } as unknown as Track
        })

        it('returns early if last.fm not configured or session key unavailable', async () => {
            isLastFmConfiguredMock.mockReturnValue(false)
            await updateLastFmNowPlaying(mockQueue, mockTrack)
            expect(lastFmUpdateNowPlayingMock).not.toHaveBeenCalled()

            jest.clearAllMocks()
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue(null)
            await updateLastFmNowPlaying(mockQueue, mockTrack)
            expect(lastFmUpdateNowPlayingMock).not.toHaveBeenCalled()
        })

        it('updates last.fm now playing with track info and metadata', async () => {
            const testMetadata = {
                artist: 'Test Artist',
                title: 'Test Song',
                album: 'Test Album',
                albumArtist: 'Test Artist',
                mbid: 'test-mbid',
                duration: 225000,
            }
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue('session-key')
            getTrackMetadataMock.mockResolvedValue(testMetadata)
            lastFmUpdateNowPlayingMock.mockResolvedValue(undefined)

            await updateLastFmNowPlaying(mockQueue, mockTrack)

            // Verify the actual update was called with correct parameters including metadata
            expect(lastFmUpdateNowPlayingMock).toHaveBeenCalledWith(
                'Test Artist',
                'Test Song',
                225,
                'session-key',
                testMetadata,
            )

            // Test with no duration
            lastFmUpdateNowPlayingMock.mockClear()
            getTrackMetadataMock.mockResolvedValue(null)
            const trackNoDuration = {
                ...mockTrack,
                durationMS: 0,
            } as unknown as Track

            await updateLastFmNowPlaying(mockQueue, trackNoDuration)

            expect(lastFmUpdateNowPlayingMock).toHaveBeenCalledWith(
                'Test Artist',
                'Test Song',
                undefined,
                'session-key',
                undefined,
            )
        })

        it('handles errors from last.fm (403 and others)', async () => {
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue('session-key')

            const error403 = new Error('403 Forbidden')
            lastFmUpdateNowPlayingMock.mockRejectedValue(error403)
            await updateLastFmNowPlaying(mockQueue, mockTrack)
            expect(warnLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('session expired'),
                }),
            )

            jest.clearAllMocks()
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue('session-key')
            const errorOther = new Error('Network error')
            lastFmUpdateNowPlayingMock.mockRejectedValue(errorOther)
            await updateLastFmNowPlaying(mockQueue, mockTrack)
            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('updateNowPlaying failed'),
                }),
            )
        })
    })

    describe('scrobbleCurrentTrackIfLastFm', () => {
        let mockQueue: GuildQueue
        let mockTrack: Track

        beforeEach(() => {
            mockQueue = {
                guild: createMockGuild(),
                currentTrack: {
                    title: 'Current Song',
                    author: 'Current Artist',
                    durationMS: 200000,
                } as unknown as Track,
            } as unknown as GuildQueue
            mockTrack = {
                title: 'Test Song',
                author: 'Test Artist',
                durationMS: 225000,
                requestedBy: { id: 'user-123' },
                metadata: undefined,
            } as unknown as Track
        })

        it('returns early if last.fm not configured or no track available', async () => {
            isLastFmConfiguredMock.mockReturnValue(false)
            await scrobbleCurrentTrackIfLastFm(mockQueue)
            expect(lastFmScrobbleMock).not.toHaveBeenCalled()

            jest.clearAllMocks()
            const queueNoTrack = {
                guild: createMockGuild(),
                currentTrack: null,
            } as unknown as GuildQueue
            isLastFmConfiguredMock.mockReturnValue(true)
            await scrobbleCurrentTrackIfLastFm(queueNoTrack)
            expect(lastFmScrobbleMock).not.toHaveBeenCalled()
        })

        it('scrobbles track with correct parameters and metadata', async () => {
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue('session-key')
            getTrackMetadataMock.mockResolvedValue({
                artist: 'Test Artist',
                title: 'Test Song',
                album: 'Test Album',
                albumArtist: 'Test Artist',
                mbid: 'test-mbid',
                duration: 225000,
            })
            lastFmScrobbleMock.mockResolvedValue(undefined)

            // Test with provided track
            await scrobbleCurrentTrackIfLastFm(mockQueue, mockTrack)

            expect(lastFmScrobbleMock).toHaveBeenCalledWith(
                'Test Artist',
                'Test Song',
                expect.any(Number),
                225,
                'session-key',
                expect.objectContaining({
                    mbid: 'test-mbid',
                    album: 'Test Album',
                }),
            )

            // Test with queue's current track (no track provided)
            lastFmScrobbleMock.mockClear()
            getSessionKeyForUserMock.mockClear()
            getTrackMetadataMock.mockResolvedValue(null)

            await scrobbleCurrentTrackIfLastFm(mockQueue)

            expect(lastFmScrobbleMock).toHaveBeenCalledWith(
                'Current Artist',
                'Current Song',
                expect.any(Number),
                200,
                'session-key',
                undefined,
            )
        })

        it('handles errors during scrobble (403 and others)', async () => {
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue('session-key')

            const error403 = new Error('403 Forbidden')
            lastFmScrobbleMock.mockRejectedValue(error403)
            await scrobbleCurrentTrackIfLastFm(mockQueue, mockTrack)
            expect(warnLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('session expired'),
                }),
            )

            jest.clearAllMocks()
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue('session-key')
            const errorOther = new Error('API error')
            lastFmScrobbleMock.mockRejectedValue(errorOther)
            await scrobbleCurrentTrackIfLastFm(mockQueue, mockTrack)
            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('scrobble failed'),
                }),
            )
        })

        it('returns early if session key not available', async () => {
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue(null)
            await scrobbleCurrentTrackIfLastFm(mockQueue, mockTrack)
            expect(lastFmScrobbleMock).not.toHaveBeenCalled()
        })
    })
})
