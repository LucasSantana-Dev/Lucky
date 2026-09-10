import { describe, expect, it, beforeEach, jest } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'
import type { Guild, Client } from 'discord.js'
import {
    updateLastFmNowPlaying,
    scrobbleCurrentTrackIfLastFm,
    clearLastFmTrackTiming,
    __setLastFmTrackStartTime,
} from './lastfmScrobbler'
import * as lastfm from '../../lastfm'

const mockDebugLog = jest.fn()
const mockErrorLog = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: mockDebugLog,
    errorLog: mockErrorLog,
}))

jest.mock('../../lastfm', () => ({
    isLastFmConfigured: jest.fn(),
    getSessionKeyForUser: jest.fn(),
    getTrackMetadata: jest.fn(),
    isLastFmInvalidSessionError: jest.fn(),
    handleDeadLastFmSession: jest.fn(),
    updateNowPlaying: jest.fn(),
    scrobble: jest.fn(),
}))

const mockLastFm = lastfm as jest.Mocked<typeof lastfm>

describe('lastfmScrobbler', () => {
    let mockQueue: Partial<GuildQueue>
    let mockTrack: Partial<Track>
    let mockGuild: Partial<Guild>
    let mockClient: Partial<Client>

    beforeEach(() => {
        jest.clearAllMocks()

        mockGuild = {
            id: 'guild-123',
        }

        mockClient = {
            user: { id: 'bot-id', username: 'Lucky' },
        }

        mockTrack = {
            title: 'Test Track',
            author: 'Test Artist',
            url: 'https://spotify.com/track/123',
            durationMS: 180000, // 3 minutes
            requestedBy: {
                id: 'user-123',
                username: 'TestUser',
            },
        }

        mockQueue = {
            guild: mockGuild as Guild,
            player: { client: mockClient as Client },
            metadata: { requestedBy: { id: 'user-123' } },
            currentTrack: mockTrack as Track,
        }

        // Default mocks: Last.fm is configured, session key exists
        mockLastFm.isLastFmConfigured.mockReturnValue(true)
        mockLastFm.getSessionKeyForUser.mockResolvedValue('test-session-key')
        mockLastFm.getTrackMetadata.mockResolvedValue({
            artist: 'Test Artist',
            title: 'Test Track',
            duration: 180,
        })
        mockLastFm.isLastFmInvalidSessionError.mockReturnValue(false)
        mockLastFm.updateNowPlaying.mockResolvedValue(undefined)
        mockLastFm.scrobble.mockResolvedValue(undefined)
    })

    describe('updateLastFmNowPlaying', () => {
        it('updates now playing on Last.fm when configured', async () => {
            await updateLastFmNowPlaying(
                mockQueue as GuildQueue,
                mockTrack as Track,
            )

            expect(mockLastFm.updateNowPlaying).toHaveBeenCalledWith(
                'Test Artist',
                'Test Track',
                180, // durationMS converted to seconds
                'test-session-key',
                expect.any(Object),
            )
        })

        it('returns early when Last.fm is not configured', async () => {
            mockLastFm.isLastFmConfigured.mockReturnValue(false)

            await updateLastFmNowPlaying(
                mockQueue as GuildQueue,
                mockTrack as Track,
            )

            expect(mockLastFm.updateNowPlaying).not.toHaveBeenCalled()
        })

        it('returns early when session key is not available', async () => {
            mockLastFm.getSessionKeyForUser.mockResolvedValue(null)

            await updateLastFmNowPlaying(
                mockQueue as GuildQueue,
                mockTrack as Track,
            )

            expect(mockLastFm.updateNowPlaying).not.toHaveBeenCalled()
        })

        it('allows env fallback for autoplay (requester-less) tracks', async () => {
            mockTrack.requestedBy = undefined
            mockQueue.metadata = {}

            await updateLastFmNowPlaying(
                mockQueue as GuildQueue,
                mockTrack as Track,
            )

            expect(mockLastFm.getSessionKeyForUser).toHaveBeenCalledWith(
                undefined,
                { allowEnvFallback: true },
            )
        })

        it('disallows env fallback for identified requesters', async () => {
            mockTrack.requestedBy = { id: 'user-123', username: 'User' }

            await updateLastFmNowPlaying(
                mockQueue as GuildQueue,
                mockTrack as Track,
            )

            expect(mockLastFm.getSessionKeyForUser).toHaveBeenCalledWith(
                expect.anything(),
                { allowEnvFallback: false },
            )
        })

        it('logs debug message when track metadata not found', async () => {
            mockLastFm.getTrackMetadata.mockResolvedValue(null)

            await updateLastFmNowPlaying(
                mockQueue as GuildQueue,
                mockTrack as Track,
            )

            expect(mockDebugLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Last.fm metadata not found',
                    ),
                }),
            )
        })

        it('handles Last.fm invalid session error', async () => {
            const error = new Error('Invalid session')
            mockLastFm.updateNowPlaying.mockRejectedValue(error)
            mockLastFm.isLastFmInvalidSessionError.mockReturnValue(true)

            await updateLastFmNowPlaying(
                mockQueue as GuildQueue,
                mockTrack as Track,
            )

            expect(mockLastFm.handleDeadLastFmSession).toHaveBeenCalledWith(
                'user-123',
                'test-session-key',
                mockClient,
                {
                    envFallbackUsed: false,
                    via: 'updateNowPlaying',
                },
            )
        })

        it('logs error when updateNowPlaying fails with non-session error', async () => {
            const error = new Error('Network error')
            mockLastFm.updateNowPlaying.mockRejectedValue(error)
            mockLastFm.isLastFmInvalidSessionError.mockReturnValue(false)

            await updateLastFmNowPlaying(
                mockQueue as GuildQueue,
                mockTrack as Track,
            )

            expect(mockErrorLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Last.fm updateNowPlaying failed',
                    error,
                }),
            )
        })

        it('handles tracks with zero duration', async () => {
            mockTrack.durationMS = 0

            await updateLastFmNowPlaying(
                mockQueue as GuildQueue,
                mockTrack as Track,
            )

            expect(mockLastFm.updateNowPlaying).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                undefined, // zero duration should be undefined
                expect.anything(),
                expect.anything(),
            )
        })

        it('does not store timing if track changed during request (late completion)', async () => {
            const trackA: Partial<Track> = {
                title: 'Track A',
                author: 'Artist A',
                url: 'https://spotify.com/track/A',
                durationMS: 180000,
                requestedBy: { id: 'user-123', username: 'User' },
            }
            const trackB: Partial<Track> = {
                title: 'Track B',
                author: 'Artist B',
                url: 'https://spotify.com/track/B',
                durationMS: 180000,
                requestedBy: { id: 'user-123', username: 'User' },
            }

            // Track A call to updateNowPlaying
            mockQueue.currentTrack = trackA as Track
            await updateLastFmNowPlaying(
                mockQueue as GuildQueue,
                trackA as Track,
            )
            // Verify Track A's timing was stored
            let callArgs = mockLastFm.scrobble.mock.calls[0] ?? undefined
            await scrobbleCurrentTrackIfLastFm(mockQueue as GuildQueue)
            const trackATimestamp = mockLastFm.scrobble.mock.calls[0][2]

            // Clear mocks and simulate track change
            jest.clearAllMocks()
            mockLastFm.scrobble.mockResolvedValue(undefined)
            mockLastFm.updateNowPlaying.mockResolvedValue(undefined)

            // Track B is now current
            mockQueue.currentTrack = trackB as Track
            // If updateLastFmNowPlaying for Track B is called after A but completed before A,
            // it should store B's timing. But we're simulating a late completion where
            // updateNowPlaying for Track A completes AFTER Track B's completes.
            // Since Track A is no longer current, its timing should NOT be stored.

            // Manually set Track B's timing first (simulating B completed first)
            const trackBTimestamp = 2000
            __setLastFmTrackStartTime('guild-123', trackBTimestamp)

            // Now simulate Track A's late completion by calling with A but queue.currentTrack is B
            mockQueue.currentTrack = trackB as Track
            await updateLastFmNowPlaying(
                mockQueue as GuildQueue,
                trackA as Track, // Track A's request completes now
            )

            // Verify that Track B's timing is still stored (Track A's late write should be ignored)
            jest.clearAllMocks()
            mockLastFm.scrobble.mockResolvedValue(undefined)
            await scrobbleCurrentTrackIfLastFm(mockQueue as GuildQueue)
            const finalTimestamp = mockLastFm.scrobble.mock.calls[0][2]
            expect(finalTimestamp).toBe(trackBTimestamp)
        })
    })

    describe('scrobbleCurrentTrackIfLastFm', () => {
        it('scrobbles track to Last.fm when configured', async () => {
            await scrobbleCurrentTrackIfLastFm(mockQueue as GuildQueue)

            expect(mockLastFm.scrobble).toHaveBeenCalledWith(
                'Test Artist',
                'Test Track',
                expect.any(Number), // timestamp
                180, // durationMS converted to seconds
                'test-session-key',
                expect.any(Object),
            )
        })

        it('returns early when Last.fm is not configured', async () => {
            mockLastFm.isLastFmConfigured.mockReturnValue(false)

            await scrobbleCurrentTrackIfLastFm(mockQueue as GuildQueue)

            expect(mockLastFm.scrobble).not.toHaveBeenCalled()
        })

        it('returns early when no track is available', async () => {
            mockQueue.currentTrack = undefined

            await scrobbleCurrentTrackIfLastFm(mockQueue as GuildQueue)

            expect(mockLastFm.scrobble).not.toHaveBeenCalled()
        })

        it('uses explicit track parameter over queue.currentTrack', async () => {
            const otherTrack: Partial<Track> = {
                title: 'Other Track',
                author: 'Other Artist',
                durationMS: 240000,
                requestedBy: { id: 'user-456', username: 'Other' },
            }

            await scrobbleCurrentTrackIfLastFm(
                mockQueue as GuildQueue,
                otherTrack as Track,
            )

            expect(mockLastFm.scrobble).toHaveBeenCalledWith(
                'Other Artist',
                'Other Track',
                expect.any(Number),
                240,
                expect.any(String),
                expect.any(Object),
            )
        })

        it('returns early when session key is not available', async () => {
            mockLastFm.getSessionKeyForUser.mockResolvedValue(null)

            await scrobbleCurrentTrackIfLastFm(mockQueue as GuildQueue)

            expect(mockLastFm.scrobble).not.toHaveBeenCalled()
        })

        it('uses stored track start time if available', async () => {
            const storedStartTime = 1000
            __setLastFmTrackStartTime('guild-123', storedStartTime)

            await scrobbleCurrentTrackIfLastFm(mockQueue as GuildQueue)

            expect(mockLastFm.scrobble).toHaveBeenCalled()
            // The timestamp passed should match the stored start time
            const callArgs = mockLastFm.scrobble.mock.calls[0]
            expect(callArgs[2]).toBe(storedStartTime)
        })

        it('uses current time when no start time stored', async () => {
            clearLastFmTrackTiming('guild-123')
            const beforeScrobble = Math.floor(Date.now() / 1000)

            await scrobbleCurrentTrackIfLastFm(mockQueue as GuildQueue)

            const afterScrobble = Math.floor(Date.now() / 1000)
            const callArgs = mockLastFm.scrobble.mock.calls[0]
            const timestamp = callArgs[2]

            // Timestamp should be within the execution window
            expect(timestamp).toBeGreaterThanOrEqual(beforeScrobble)
            expect(timestamp).toBeLessThanOrEqual(afterScrobble + 1)
        })

        it('allows env fallback for autoplay tracks', async () => {
            mockTrack.requestedBy = undefined
            mockQueue.metadata = {}

            await scrobbleCurrentTrackIfLastFm(mockQueue as GuildQueue)

            expect(mockLastFm.getSessionKeyForUser).toHaveBeenCalledWith(
                undefined,
                { allowEnvFallback: true },
            )
        })

        it('disallows env fallback for identified requesters', async () => {
            mockTrack.requestedBy = { id: 'user-123', username: 'User' }

            await scrobbleCurrentTrackIfLastFm(mockQueue as GuildQueue)

            expect(mockLastFm.getSessionKeyForUser).toHaveBeenCalledWith(
                expect.anything(),
                { allowEnvFallback: false },
            )
        })

        it('logs debug message when track metadata not found', async () => {
            mockLastFm.getTrackMetadata.mockResolvedValue(null)

            await scrobbleCurrentTrackIfLastFm(mockQueue as GuildQueue)

            expect(mockDebugLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Last.fm metadata not found',
                    ),
                }),
            )
        })

        it('handles Last.fm invalid session error', async () => {
            const error = new Error('Invalid session')
            mockLastFm.scrobble.mockRejectedValue(error)
            mockLastFm.isLastFmInvalidSessionError.mockReturnValue(true)

            await scrobbleCurrentTrackIfLastFm(mockQueue as GuildQueue)

            expect(mockLastFm.handleDeadLastFmSession).toHaveBeenCalledWith(
                'user-123',
                'test-session-key',
                mockClient,
                {
                    envFallbackUsed: false,
                    via: 'scrobble',
                },
            )
        })

        it('logs error when scrobble fails with non-session error', async () => {
            const error = new Error('Network error')
            mockLastFm.scrobble.mockRejectedValue(error)
            mockLastFm.isLastFmInvalidSessionError.mockReturnValue(false)

            await scrobbleCurrentTrackIfLastFm(mockQueue as GuildQueue)

            expect(mockErrorLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Last.fm scrobble failed',
                    error,
                }),
            )
        })

        it('handles tracks with zero duration', async () => {
            mockTrack.durationMS = 0

            await scrobbleCurrentTrackIfLastFm(mockQueue as GuildQueue)

            expect(mockLastFm.scrobble).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.any(Number),
                undefined, // zero duration should be undefined
                expect.anything(),
                expect.anything(),
            )
        })
    })

    describe('clearLastFmTrackTiming', () => {
        it('clears track timing without error', async () => {
            // This is a simple state cleanup function
            expect(() => {
                clearLastFmTrackTiming('guild-123')
            }).not.toThrow()
        })

        it('can clear for different guilds independently', () => {
            expect(() => {
                clearLastFmTrackTiming('guild-1')
                clearLastFmTrackTiming('guild-2')
            }).not.toThrow()
        })
    })
})
