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
import { createMockGuild, createMockTextChannel } from '../../../tests/__mocks__/discord'

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
    createMusicControlButtons: (...args: unknown[]) => createMusicControlButtonsMock(...args),
    createMusicActionButtons: (...args: unknown[]) => createMusicActionButtonsMock(...args),
}))

jest.mock('../../lastfm', () => ({
    isLastFmConfigured: (...args: unknown[]) => isLastFmConfiguredMock(...args),
    getSessionKeyForUser: (...args: unknown[]) => getSessionKeyForUserMock(...args),
    updateNowPlaying: (...args: unknown[]) => lastFmUpdateNowPlayingMock(...args),
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
    })

    describe('TrackNowPlayingState - registerNowPlayingMessage', () => {
        it('registers a now-playing message for a guild', () => {
            const guildId = 'guild-123'
            const messageId = 'message-456'
            const channelId = 'channel-789'

            registerNowPlayingMessage(guildId, messageId, channelId)
            const result = getSongInfoMessage(guildId)

            expect(result).toEqual({ messageId, channelId })
        })

        it('overwrites previous message registration for the same guild', () => {
            const guildId = 'guild-123'

            registerNowPlayingMessage(guildId, 'message-1', 'channel-1')
            registerNowPlayingMessage(guildId, 'message-2', 'channel-2')

            const result = getSongInfoMessage(guildId)
            expect(result).toEqual({ messageId: 'message-2', channelId: 'channel-2' })
        })
    })

    describe('TrackNowPlayingState - getSongInfoMessage', () => {
        it('returns undefined when no message is registered for guild', () => {
            const result = getSongInfoMessage('non-existent-guild')
            expect(result).toBeUndefined()
        })

        it('returns stored message info for registered guild', () => {
            const guildId = 'guild-123'
            registerNowPlayingMessage(guildId, 'msg-1', 'ch-1')

            const result = getSongInfoMessage(guildId)
            expect(result?.messageId).toBe('msg-1')
            expect(result?.channelId).toBe('ch-1')
        })
    })

    describe('TrackNowPlayingState - deleteSongInfoMessage', () => {
        it('removes registered message for a guild', () => {
            const guildId = 'guild-123'
            registerNowPlayingMessage(guildId, 'msg-1', 'ch-1')
            expect(getSongInfoMessage(guildId)).toBeDefined()

            deleteSongInfoMessage(guildId)

            expect(getSongInfoMessage(guildId)).toBeUndefined()
        })

        it('silently succeeds when deleting non-existent guild', () => {
            expect(() => deleteSongInfoMessage('non-existent')).not.toThrow()
        })
    })

    describe('TrackNowPlayingState - cleanupGuild', () => {
        it('cleans up all state for a guild', () => {
            const guildId = 'guild-123'
            registerNowPlayingMessage(guildId, 'msg-1', 'ch-1')

            cleanupGuildState(guildId)

            expect(getSongInfoMessage(guildId)).toBeUndefined()
            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Cleaned up now-playing state for guild',
                    data: { guildId },
                })
            )
        })

        it('logs cleanup event with guild id', () => {
            const guildId = 'guild-456'
            cleanupGuildState(guildId)

            expect(debugLogMock).toHaveBeenCalled()
            const call = debugLogMock.mock.calls[0][0]
            expect(call.data.guildId).toBe(guildId)
        })

        it('cleans up both song info and lastFm track start time', () => {
            const guildId = 'guild-789'
            registerNowPlayingMessage(guildId, 'msg-1', 'ch-1')

            cleanupGuildState(guildId)

            expect(getSongInfoMessage(guildId)).toBeUndefined()
            expect(debugLogMock).toHaveBeenCalled()
        })
    })

    describe('TrackNowPlayingState - LastFm track timing', () => {
        it('cleans up lastFm track start time on guild cleanup', () => {
            const guildId = 'guild-111'

            cleanupGuildState(guildId)

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Cleaned up now-playing state for guild',
                })
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

            expect(mockChannel.send).toHaveBeenCalled()
        })

        it('includes embed colors in create embed call', async () => {
            const mockMessage = {
                id: 'new-msg',
            } as unknown as Message
            mockChannel.send = jest.fn().mockResolvedValue(mockMessage)

            await sendNowPlayingEmbed(mockQueue, mockTrack, false)

            expect(createEmbedMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: '🎵 Now Playing',
                    color: '#1DB954',
                })
            )
        })

        it('adds requester info to footer when not autoplay', async () => {
            const userTrack = {
                ...mockTrack,
                requestedBy: { username: 'TestUser', id: 'user-123' },
            } as unknown as Track

            const mockMessage = { id: 'msg-1' } as unknown as Message
            mockChannel.send = jest.fn().mockResolvedValue(mockMessage)

            await sendNowPlayingEmbed(mockQueue, userTrack, false)

            expect(createEmbedMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    footer: 'Added by TestUser',
                })
            )
        })

        it('adds autoplay info to footer when autoplay is enabled', async () => {
            getAutoplayCountMock.mockResolvedValue(5)

            const mockMessage = { id: 'msg-1' } as unknown as Message
            mockChannel.send = jest.fn().mockResolvedValue(mockMessage)

            await sendNowPlayingEmbed(mockQueue, mockTrack, true)

            expect(createEmbedMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    footer: 'Autoplay • 5/50 songs',
                })
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
                ])
            )
        })

        it('edits previous message if it still exists in channel', async () => {
            const prevMessageId = 'prev-msg-123'
            registerNowPlayingMessage(mockGuild.id, prevMessageId, mockChannel.id)

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
                    embeds: expect.arrayContaining([{ title: 'test embed' }]),
                    components: expect.anything(),
                })
            )
        })

        it('sends new message if previous message fetch fails', async () => {
            const prevMessageId = 'prev-msg-123'
            registerNowPlayingMessage(mockGuild.id, prevMessageId, mockChannel.id)

            const fetchMock = jest.fn().mockRejectedValue(new Error('Not found'))
            mockChannel.messages = { fetch: fetchMock } as unknown as any

            const newMessage = { id: 'new-msg-456' } as unknown as Message
            mockChannel.send = jest.fn().mockResolvedValue(newMessage)

            await sendNowPlayingEmbed(mockQueue, mockTrack, false)

            expect(mockChannel.send).toHaveBeenCalled()
            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Failed to update'),
                })
            )
        })

        it('detects YouTube source from URL', async () => {
            const youtubeTrack = {
                ...mockTrack,
                url: 'https://youtu.be/dQw4w9WgXcQ',
            } as unknown as Track

            const mockMessage = { id: 'msg-1' } as unknown as Message
            mockChannel.send = jest.fn().mockResolvedValue(mockMessage)

            await sendNowPlayingEmbed(mockQueue, youtubeTrack, false)

            const embedCall = createEmbedMock.mock.calls[0][0]
            const sourceField = embedCall.fields.find(
                (f: any) => f.name === '🌐 Source'
            )
            expect(sourceField.value).toBe('YouTube')
        })

        it('detects Spotify source from URL', async () => {
            const spotifyTrack = {
                ...mockTrack,
                url: 'https://open.spotify.com/track/123',
            } as unknown as Track

            const mockMessage = { id: 'msg-1' } as unknown as Message
            mockChannel.send = jest.fn().mockResolvedValue(mockMessage)

            await sendNowPlayingEmbed(mockQueue, spotifyTrack, false)

            const embedCall = createEmbedMock.mock.calls[0][0]
            const sourceField = embedCall.fields.find(
                (f: any) => f.name === '🌐 Source'
            )
            expect(sourceField.value).toBe('Spotify')
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

        it('returns early if last.fm is not configured', async () => {
            isLastFmConfiguredMock.mockReturnValue(false)

            await updateLastFmNowPlaying(mockQueue, mockTrack)

            expect(lastFmUpdateNowPlayingMock).not.toHaveBeenCalled()
        })

        it('returns early if session key is not available', async () => {
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue(null)

            await updateLastFmNowPlaying(mockQueue, mockTrack)

            expect(lastFmUpdateNowPlayingMock).not.toHaveBeenCalled()
        })

        it('calls lastfm update with track and session info', async () => {
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue('session-key-123')
            lastFmUpdateNowPlayingMock.mockResolvedValue(undefined)

            await updateLastFmNowPlaying(mockQueue, mockTrack)

            expect(lastFmUpdateNowPlayingMock).toHaveBeenCalledWith(
                'Test Artist',
                'Test Song',
                225,
                'session-key-123'
            )
        })

        it('handles 403 auth error from last.fm', async () => {
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue('session-key')
            const error = new Error('403 Forbidden')
            lastFmUpdateNowPlayingMock.mockRejectedValue(error)

            await updateLastFmNowPlaying(mockQueue, mockTrack)

            expect(warnLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('session expired'),
                })
            )
        })

        it('handles non-403 errors from last.fm', async () => {
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue('session-key')
            const error = new Error('Network error')
            lastFmUpdateNowPlayingMock.mockRejectedValue(error)

            await updateLastFmNowPlaying(mockQueue, mockTrack)

            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('updateNowPlaying failed'),
                })
            )
        })

        it('handles track with no duration', async () => {
            const trackNoDuration = {
                ...mockTrack,
                durationMS: 0,
            } as unknown as Track
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue('session-key')
            lastFmUpdateNowPlayingMock.mockResolvedValue(undefined)

            await updateLastFmNowPlaying(mockQueue, trackNoDuration)

            expect(lastFmUpdateNowPlayingMock).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                undefined,
                expect.anything()
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

        it('returns early if last.fm is not configured', async () => {
            isLastFmConfiguredMock.mockReturnValue(false)

            await scrobbleCurrentTrackIfLastFm(mockQueue)

            expect(lastFmScrobbleMock).not.toHaveBeenCalled()
        })

        it('returns early if no current track and no provided track', async () => {
            const queueNoTrack = {
                guild: createMockGuild(),
                currentTrack: null,
            } as unknown as GuildQueue
            isLastFmConfiguredMock.mockReturnValue(true)

            await scrobbleCurrentTrackIfLastFm(queueNoTrack)

            expect(lastFmScrobbleMock).not.toHaveBeenCalled()
        })

        it('scrobbles provided track if available', async () => {
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue('session-key')
            lastFmScrobbleMock.mockResolvedValue(undefined)

            await scrobbleCurrentTrackIfLastFm(mockQueue, mockTrack)

            expect(lastFmScrobbleMock).toHaveBeenCalledWith(
                'Test Artist',
                'Test Song',
                expect.any(Number),
                225,
                'session-key'
            )
        })

        it('uses current queue track if no track provided', async () => {
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue('session-key')
            lastFmScrobbleMock.mockResolvedValue(undefined)

            await scrobbleCurrentTrackIfLastFm(mockQueue)

            expect(lastFmScrobbleMock).toHaveBeenCalledWith(
                'Current Artist',
                'Current Song',
                expect.any(Number),
                200,
                'session-key'
            )
        })

        it('handles 403 auth error during scrobble', async () => {
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue('session-key')
            const error = new Error('403 Forbidden')
            lastFmScrobbleMock.mockRejectedValue(error)

            await scrobbleCurrentTrackIfLastFm(mockQueue, mockTrack)

            expect(warnLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('session expired'),
                })
            )
        })

        it('handles non-403 errors during scrobble', async () => {
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue('session-key')
            const error = new Error('API error')
            lastFmScrobbleMock.mockRejectedValue(error)

            await scrobbleCurrentTrackIfLastFm(mockQueue, mockTrack)

            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('scrobble failed'),
                })
            )
        })

        it('handles track with no duration', async () => {
            const trackNoDuration = {
                ...mockTrack,
                durationMS: 0,
            } as unknown as Track
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue('session-key')
            lastFmScrobbleMock.mockResolvedValue(undefined)

            await scrobbleCurrentTrackIfLastFm(mockQueue, trackNoDuration)

            expect(lastFmScrobbleMock).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.any(Number),
                undefined,
                expect.anything()
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
