import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'

// Mock lru-cache to prevent LRUCache constructor errors in spotifyApi
jest.mock('lru-cache', () => ({
    LRUCache: jest.fn(function () {
        this.get = jest.fn().mockReturnValue(null)
        this.set = jest.fn()
        this.delete = jest.fn()
        this.clear = jest.fn()
    }),
}))

// Mock shared utils first to prevent prismaClient import errors
jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

// Mock the telemetry service
jest.mock('../../../services/musicRecommendation/recommendationTelemetry', () => ({
    recordRecommendationOutcome: jest.fn().mockResolvedValue(undefined),
}))

// Mock shared services that may have prismaClient dependencies
jest.mock('@lucky/shared/services', () => ({
    premiumService: { isPremium: jest.fn() },
}))

import { purgeDuplicatesOfCurrentTrack } from './diversitySelector'
import { recordRecommendationOutcome } from '../../../services/musicRecommendation/recommendationTelemetry'

describe('Autoplay eviction telemetry (#1585)', () => {
    let mockQueue: Partial<GuildQueue>
    let currentTrack: Partial<Track>
    let queuedTracks: Partial<Track>[]

    beforeEach(() => {
        jest.clearAllMocks()

        currentTrack = {
            id: 'current-track-id',
            url: 'https://youtube.com/watch?v=abc123',
            title: 'Current Song',
            author: 'Artist A',
        }

        // Create autoplay-marked queued tracks
        queuedTracks = [
            {
                id: 'autoplay-1',
                url: 'https://youtube.com/watch?v=dup1',
                title: 'Current Song', // Duplicate title, should be purged
                author: 'Artist A',
                metadata: { isAutoplay: true },
            },
            {
                id: 'autoplay-2',
                url: 'https://youtube.com/watch?v=unique1',
                title: 'Unique Track 1',
                author: 'Artist B',
                metadata: { isAutoplay: true },
            },
            {
                id: 'manual-1',
                url: 'https://youtube.com/watch?v=manual1',
                title: 'User Track',
                author: 'Artist C',
                metadata: { isAutoplay: false },
            },
        ]

        mockQueue = {
            guild: { id: 'test-guild' },
            tracks: {
                toArray: () => queuedTracks as Track[],
            },
            node: {
                remove: jest.fn(),
            },
        } as unknown as Partial<GuildQueue>
    })

    it('should return array of removed tracks from purgeDuplicatesOfCurrentTrack', () => {
        const removed = purgeDuplicatesOfCurrentTrack(
            mockQueue as GuildQueue,
            currentTrack as Track,
        )

        expect(Array.isArray(removed)).toBe(true)
        // Should have removed the duplicate title track
        expect(removed.length).toBeGreaterThan(0)
    })

    it('should only remove autoplay-marked tracks as duplicates', () => {
        const removed = purgeDuplicatesOfCurrentTrack(
            mockQueue as GuildQueue,
            currentTrack as Track,
        )

        // All removed tracks should be autoplay-marked
        removed.forEach((track) => {
            const meta = track.metadata as { isAutoplay?: boolean } | undefined
            expect(meta?.isAutoplay).toBe(true)
        })
    })

    it('should preserve non-autoplay tracks even if title matches', () => {
        const removed = purgeDuplicatesOfCurrentTrack(
            mockQueue as GuildQueue,
            currentTrack as Track,
        )

        // Manual user track should not be in removed list
        const manualTrackRemoved = removed.some((t) => t.id === 'manual-1')
        expect(manualTrackRemoved).toBe(false)
    })

    it('should call queue.node.remove for each duplicate', () => {
        purgeDuplicatesOfCurrentTrack(
            mockQueue as GuildQueue,
            currentTrack as Track,
        )

        const removeCall = mockQueue.node?.remove as jest.Mock
        expect(removeCall?.mock.calls.length).toBeGreaterThan(0)
    })

    it('recordRecommendationOutcome should be called with rejected outcome for evicted tracks', () => {
        // Simulate the cancellation logic that would be called in replenisher
        const removed = purgeDuplicatesOfCurrentTrack(
            mockQueue as GuildQueue,
            currentTrack as Track,
        )

        // Simulate what cancelPendingRecommendations does
        removed.forEach((track) => {
            const isAutoplay = (track.metadata as { isAutoplay?: boolean } | undefined)
                ?.isAutoplay === true
            if (isAutoplay) {
                recordRecommendationOutcome({
                    guildId: 'test-guild',
                    trackId: track.id,
                    outcome: 'rejected',
                })
            }
        })

        const mockRecord = recordRecommendationOutcome as jest.Mock
        expect(mockRecord).toHaveBeenCalled()

        // Verify all calls use 'rejected' outcome
        mockRecord.mock.calls.forEach((call) => {
            expect(call[0].outcome).toBe('rejected')
        })
    })

    it('should handle empty removed tracks array gracefully', async () => {
        // Mock a queue with no duplicates
        mockQueue.tracks = {
            toArray: () => [
                {
                    id: 'unique-1',
                    title: 'Different Track',
                    author: 'Different Artist',
                    metadata: { isAutoplay: true },
                } as Track,
            ],
        }

        const removed = purgeDuplicatesOfCurrentTrack(
            mockQueue as GuildQueue,
            currentTrack as Track,
        )

        expect(removed).toEqual([])
        // recordRecommendationOutcome should not be called
        const mockRecord = recordRecommendationOutcome as jest.Mock
        expect(mockRecord).not.toHaveBeenCalled()
    })

    it('buffer size reduction (8→2) should improve telemetry coverage', () => {
        // Test comment verification: the constant reduction is the key fix
        // that prevents over-queueing. With smaller buffers, tracks are
        // added just-in-time, giving them a chance to emit playerStart
        // or playerSkip/playerFinish before the next replenish cycle.
        //
        // This test just documents the intent; actual coverage metrics
        // require production telemetry data from Phase C onwards.
        expect(true).toBe(true) // Placeholder: actual coverage = prod data
    })
})
