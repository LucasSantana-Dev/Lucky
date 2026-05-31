import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { Track } from 'discord-player'
import { markAsAutoplayTrack, markAndRecordAutoplayTrack } from './queueMarkers'
import type { RecommendationBasis } from './recommendationBasis'

jest.mock(
    '../../../services/musicRecommendation/recommendationTelemetry',
    () => ({
        recordRecommendationPick: jest.fn(),
    }),
)

import { recordRecommendationPick } from '../../../services/musicRecommendation/recommendationTelemetry'

function createTrack(overrides: Partial<Track> = {}): Track {
    return {
        title: 'Test Song',
        author: 'Test Artist',
        url: 'https://youtube.com/watch?v=test123',
        id: 'test-id',
        metadata: {},
        ...overrides,
    } as unknown as Track
}

describe('markAsAutoplayTrack', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('marks track with autoplay metadata', () => {
        const track = createTrack()
        markAsAutoplayTrack(track, 'similar vibes')

        expect(track.metadata?.isAutoplay).toBe(true)
        expect(track.metadata?.recommendationReason).toBe('similar vibes')
    })

    it('preserves existing requestedById when not overridden', () => {
        const track = createTrack({
            metadata: { requestedById: 'existing-user' },
        })
        markAsAutoplayTrack(track, 'reason')

        expect(track.metadata?.requestedById).toBe('existing-user')
    })

    it('overwrites requestedById when provided', () => {
        const track = createTrack({
            metadata: { requestedById: 'existing-user' },
        })
        markAsAutoplayTrack(track, 'reason', 'new-user')

        expect(track.metadata?.requestedById).toBe('new-user')
    })

    it('attaches recommendationSource when provided', () => {
        const track = createTrack()
        markAsAutoplayTrack(track, 'reason', 'user-id', 'spotify-rec')

        expect(track.metadata?.recommendationSource).toBe('spotify-rec')
    })

    it('does not attach recommendationSource when not provided', () => {
        const track = createTrack()
        markAsAutoplayTrack(track, 'reason', 'user-id')

        expect(track.metadata?.recommendationSource).toBeUndefined()
    })
})

describe('markAndRecordAutoplayTrack', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(recordRecommendationPick as jest.Mock).mockResolvedValue(undefined)
    })

    it('marks the track as autoplay with serialized reason', async () => {
        const track = createTrack()
        const basis: RecommendationBasis = {
            source: 'spotify-rec',
            signals: ['preferred artist'],
        }

        await markAndRecordAutoplayTrack(track, basis, 'guild-123', 'user-456')

        expect(track.metadata?.isAutoplay).toBe(true)
        // serializeBasis produces "spotify rec • preferred artist"
        expect(track.metadata?.recommendationReason).toBe(
            'spotify rec • preferred artist',
        )
    })

    it('attaches the basis.source to track.metadata', async () => {
        const track = createTrack()
        const basis: RecommendationBasis = {
            source: 'lastfm-loved',
            signals: ['liked artist'],
        }

        await markAndRecordAutoplayTrack(track, basis, 'guild-123', 'user-456')

        expect(track.metadata?.recommendationSource).toBe('lastfm-loved')
    })

    it('records the recommendation pick with serialized reason', async () => {
        const track = createTrack({
            title: 'Song Title',
            author: 'Song Author',
            url: 'https://youtube.com/watch?v=abc123',
            id: 'track-id-123',
        })
        const basis: RecommendationBasis = {
            source: 'lastfm-similar',
            signals: ['liked artist', 'energy match'],
        }

        await markAndRecordAutoplayTrack(track, basis, 'guild-456', 'user-789')

        expect(track.metadata?.isAutoplay).toBe(true)
        expect(recordRecommendationPick).toHaveBeenCalled()
    })

    it('records the mode when provided', async () => {
        const track = createTrack({
            title: 'Song Title',
            author: 'Song Author',
            url: 'https://youtube.com/watch?v=abc123',
            id: 'track-id-123',
        })
        const basis: RecommendationBasis = {
            source: 'spotify-rec',
            signals: [],
        }

        await markAndRecordAutoplayTrack(
            track,
            basis,
            'guild-123',
            'user-456',
            'discover',
        )

        expect(recordRecommendationPick).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: 'discover',
            }),
        )
    })

    it('records with all three mode values', async () => {
        const modes: Array<'similar' | 'discover' | 'popular'> = [
            'similar',
            'discover',
            'popular',
        ]

        for (const mode of modes) {
            jest.clearAllMocks()
            ;(recordRecommendationPick as jest.Mock).mockResolvedValueOnce(
                undefined,
            )

            const track = createTrack()
            const basis: RecommendationBasis = {
                source: 'spotify-rec',
                signals: [],
            }

            await markAndRecordAutoplayTrack(
                track,
                basis,
                'guild-123',
                'user-456',
                mode,
            )

            expect(recordRecommendationPick).toHaveBeenCalledWith(
                expect.objectContaining({
                    mode,
                }),
            )
        }
    })

    it('does not throw even if recordRecommendationPick resolves successfully', async () => {
        const track = createTrack()
        const basis: RecommendationBasis = {
            source: 'spotify-rec',
            signals: [],
        }

        // Mock success case
        ;(recordRecommendationPick as jest.Mock).mockResolvedValueOnce(
            undefined,
        )

        // Should resolve normally
        await expect(
            markAndRecordAutoplayTrack(track, basis, 'guild-123'),
        ).resolves.toBeUndefined()
    })
})
