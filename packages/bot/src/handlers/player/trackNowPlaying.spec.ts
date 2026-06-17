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
const getPerSourceAcceptanceRateCachedMock = jest.fn()

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

jest.mock('../../utils/music/autoplay/autoplayAcceptanceCache', () => ({
    getPerSourceAcceptanceRateCached: (...args: unknown[]) =>
        getPerSourceAcceptanceRateCachedMock(...args),
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
        getPerSourceAcceptanceRateCachedMock.mockReset()
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

        it('returns undefined if guild has no registered message', () => {
            const result = getSongInfoMessage('non-existent-guild')
            expect(result).toBeUndefined()
        })

        it('handles deletion of registered message', () => {
            const guildId = 'guild-123'
            registerNowPlayingMessage(guildId, 'msg-123', 'channel-123')

            deleteSongInfoMessage(guildId)
            const result = getSongInfoMessage(guildId)
            expect(result).toBeUndefined()
        })

        it('cleans up guild state including messages and timestamps', () => {
            const guildId = 'guild-cleanup'
            registerNowPlayingMessage(guildId, 'msg-123', 'channel-123')

            cleanupGuildState(guildId)

            expect(getSongInfoMessage(guildId)).toBeUndefined()
            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Cleaned up'),
                    data: { guildId },
                }),
            )
        })
    })

    describe('sendNowPlayingEmbed', () => {
        let mockQueue: GuildQueue
        let mockTrack: Track
        let mockChannel: TextChannel

        beforeEach(() => {
            mockChannel = createMockTextChannel()
            const mockGuild = createMockGuild()
            mockQueue = {
                guild: mockGuild,
                metadata: {
                    channel: mockChannel,
                },
            } as unknown as GuildQueue

            mockTrack = {
                title: 'Test Song',
                author: 'Test Artist',
                url: 'https://youtube.com/watch?v=test123',
                id: 'test-id',
                duration: '3:00',
                thumbnail: 'http://example.com/thumb.jpg',
                durationMS: 180000,
                requestedBy: undefined,
                metadata: {},
            } as unknown as Track

            getAutoplayCountMock.mockResolvedValue(5)
        })

        it('sends embed without registering if no channel metadata', async () => {
            const queueNoChannel = {
                guild: createMockGuild(),
                metadata: { channel: undefined },
            } as unknown as GuildQueue

            await sendNowPlayingEmbed(queueNoChannel, mockTrack, false)

            expect(createEmbedMock).not.toHaveBeenCalled()
        })

        it('includes acceptance rate in autoplay "Why this track" field when source available', async () => {
            getPerSourceAcceptanceRateCachedMock.mockResolvedValueOnce([
                { source: 'spotify-rec', acceptanceRate: 0.87 },
                { source: 'lastfm-loved', acceptanceRate: 0.92 },
            ])

            mockChannel.send = jest.fn().mockResolvedValueOnce({
                id: 'msg-123',
                react: jest.fn().mockResolvedValue(undefined),
            })

            const trackWithSource = {
                ...mockTrack,
                metadata: {
                    isAutoplay: true,
                    recommendationReason: 'spotify rec • preferred artist',
                    recommendationSource: 'spotify-rec',
                },
            } as unknown as Track

            await sendNowPlayingEmbed(mockQueue, trackWithSource, true)

            expect(createEmbedMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    fields: expect.arrayContaining([
                        expect.objectContaining({
                            name: '🤖 Why this track',
                            value: 'spotify rec • preferred artist · 87% accepted',
                        }),
                    ]),
                }),
            )
        })

        it('omits acceptance rate if recommendationSource not provided', async () => {
            mockChannel.send = jest.fn().mockResolvedValueOnce({
                id: 'msg-123',
                react: jest.fn().mockResolvedValue(undefined),
            })

            const trackWithoutSource = {
                ...mockTrack,
                metadata: {
                    isAutoplay: true,
                    recommendationReason: 'spotify rec • preferred artist',
                },
            } as unknown as Track

            await sendNowPlayingEmbed(mockQueue, trackWithoutSource, true)

            expect(getPerSourceAcceptanceRateCachedMock).not.toHaveBeenCalled()
            expect(createEmbedMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    fields: expect.arrayContaining([
                        expect.objectContaining({
                            name: '🤖 Why this track',
                            value: 'spotify rec • preferred artist',
                        }),
                    ]),
                }),
            )
        })

        it('gracefully omits acceptance rate if source not found in cache', async () => {
            getPerSourceAcceptanceRateCachedMock.mockResolvedValueOnce([
                { source: 'lastfm-loved', acceptanceRate: 0.92 },
            ])

            mockChannel.send = jest.fn().mockResolvedValueOnce({
                id: 'msg-123',
                react: jest.fn().mockResolvedValue(undefined),
            })

            const trackWithSource = {
                ...mockTrack,
                metadata: {
                    isAutoplay: true,
                    recommendationReason: 'spotify rec • preferred artist',
                    recommendationSource: 'spotify-rec',
                },
            } as unknown as Track

            await sendNowPlayingEmbed(mockQueue, trackWithSource, true)

            expect(createEmbedMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    fields: expect.arrayContaining([
                        expect.objectContaining({
                            name: '🤖 Why this track',
                            value: 'spotify rec • preferred artist',
                        }),
                    ]),
                }),
            )
        })

        it('gracefully omits acceptance rate if cache throws error', async () => {
            getPerSourceAcceptanceRateCachedMock.mockRejectedValueOnce(
                new Error('Cache error'),
            )

            mockChannel.send = jest.fn().mockResolvedValueOnce({
                id: 'msg-123',
                react: jest.fn().mockResolvedValue(undefined),
            })

            const trackWithSource = {
                ...mockTrack,
                metadata: {
                    isAutoplay: true,
                    recommendationReason: 'spotify rec • preferred artist',
                    recommendationSource: 'spotify-rec',
                },
            } as unknown as Track

            await sendNowPlayingEmbed(mockQueue, trackWithSource, true)

            expect(createEmbedMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    fields: expect.arrayContaining([
                        expect.objectContaining({
                            name: '🤖 Why this track',
                            value: 'spotify rec • preferred artist',
                        }),
                    ]),
                }),
            )
        })

        it('omits "Why this track" field entirely for non-autoplay tracks', async () => {
            mockChannel.send = jest.fn().mockResolvedValueOnce({
                id: 'msg-123',
                react: jest.fn().mockResolvedValue(undefined),
            })

            const userTrack = {
                ...mockTrack,
                requestedBy: { id: 'user-123', username: 'TestUser' },
                metadata: {},
            } as unknown as Track

            await sendNowPlayingEmbed(mockQueue, userTrack, false)

            const embedCall = createEmbedMock.mock.calls[0][0]
            const hasWhyField = embedCall.fields.some(
                (f: any) => f.name === '🤖 Why this track',
            )
            expect(hasWhyField).toBe(false)
        })

        it('appends /invite CTA to footer for non-autoplay tracks', async () => {
            mockChannel.send = jest.fn().mockResolvedValueOnce({
                id: 'msg-123',
                react: jest.fn().mockResolvedValue(undefined),
            })

            const userTrack = {
                ...mockTrack,
                requestedBy: { id: 'user-123', username: 'TestUser' },
                metadata: {},
            } as unknown as Track

            await sendNowPlayingEmbed(mockQueue, userTrack, false)

            const embedCall = createEmbedMock.mock.calls[0][0]
            expect(embedCall.footer).toContain('/invite to add Lucky')
            expect(embedCall.footer).toContain('TestUser')
        })

        it('appends /invite CTA to autoplay footer', async () => {
            getAutoplayCountMock.mockResolvedValueOnce(5)
            mockChannel.send = jest.fn().mockResolvedValueOnce({
                id: 'msg-123',
                react: jest.fn().mockResolvedValue(undefined),
            })

            const autoplayTrack = {
                ...mockTrack,
                requestedBy: undefined,
                metadata: {},
            } as unknown as Track

            await sendNowPlayingEmbed(mockQueue, autoplayTrack, true)

            const embedCall = createEmbedMock.mock.calls[0][0]
            expect(embedCall.footer).toContain('Autoplay')
            expect(embedCall.footer).toContain('/invite to add Lucky')
            expect(embedCall.footer).toContain('5/50')
        })

        it('does not duplicate /invite CTA if already present in footer', async () => {
            mockChannel.send = jest.fn().mockResolvedValueOnce({
                id: 'msg-123',
                react: jest.fn().mockResolvedValue(undefined),
            })

            const userTrack = {
                ...mockTrack,
                requestedBy: { id: 'user-123', username: 'TestUser' },
                metadata: {},
            } as unknown as Track

            await sendNowPlayingEmbed(mockQueue, userTrack, false)

            const embedCall = createEmbedMock.mock.calls[0][0]
            const footer = embedCall.footer

            // Count occurrences of '/invite' in footer
            const inviteCount = (footer.match(/\/invite/g) || []).length
            expect(inviteCount).toBe(1)
        })
    })

    describe('updateLastFmNowPlaying', () => {
        let mockQueue: GuildQueue
        let mockTrack: Track

        beforeEach(() => {
            mockQueue = {
                guild: createMockGuild(),
                metadata: { requestedBy: undefined },
            } as unknown as GuildQueue

            mockTrack = {
                title: 'Test Song',
                author: 'Test Artist',
                url: 'https://youtube.com/watch?v=test123',
                id: 'test-id',
                durationMS: 180000,
                requestedBy: undefined,
                metadata: undefined,
            } as unknown as Track
        })

        it('returns early if last.fm not configured', async () => {
            isLastFmConfiguredMock.mockReturnValue(false)
            await updateLastFmNowPlaying(mockQueue, mockTrack)
            expect(lastFmUpdateNowPlayingMock).not.toHaveBeenCalled()
        })

        it('returns early if session key not found', async () => {
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue(null)
            await updateLastFmNowPlaying(mockQueue, mockTrack)
            expect(lastFmUpdateNowPlayingMock).not.toHaveBeenCalled()
        })

        it('calls last.fm updateNowPlaying with correct parameters', async () => {
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue('session-key')
            getTrackMetadataMock.mockResolvedValue({
                artist: 'Test Artist',
                title: 'Test Song',
                album: 'Test Album',
                albumArtist: 'Test Artist',
                mbid: 'test-mbid',
                duration: 180000,
            })
            lastFmUpdateNowPlayingMock.mockResolvedValue(undefined)

            await updateLastFmNowPlaying(mockQueue, mockTrack)

            expect(lastFmUpdateNowPlayingMock).toHaveBeenCalledWith(
                'Test Artist',
                'Test Song',
                180,
                'session-key',
                expect.objectContaining({
                    mbid: 'test-mbid',
                    album: 'Test Album',
                }),
            )
        })

        it('handles 403 error from last.fm', async () => {
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
        })

        it('handles non-403 errors from last.fm', async () => {
            isLastFmConfiguredMock.mockReturnValue(true)
            getSessionKeyForUserMock.mockResolvedValue('session-key')
            const errorOther = new Error('API error')
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
            const mockGuild = createMockGuild()
            mockQueue = {
                guild: mockGuild,
                currentTrack: {
                    title: 'Current Song',
                    author: 'Current Artist',
                    url: 'https://youtube.com/watch?v=current',
                    id: 'current-id',
                    duration: '3:20',
                    durationMS: 200000,
                    requestedBy: { id: 'user-123' },
                    metadata: undefined,
                } as unknown as Track,
                metadata: { requestedBy: undefined },
            } as unknown as GuildQueue

            mockTrack = {
                title: 'Test Song',
                author: 'Test Artist',
                url: 'https://youtube.com/watch?v=test123',
                id: 'test-id',
                duration: '3:45',
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
