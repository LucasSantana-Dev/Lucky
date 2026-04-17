import { describe, it, expect } from 'vitest'
import type { Track } from 'discord-player'
import { calculateRecommendationScore } from './candidateScorer'
import type { UserSpotifySeeds } from '../../../spotify/spotifyUserSeeds'

const mockTrack = (overrides?: Partial<Track>): Track => ({
    title: 'Test Track',
    author: 'Test Artist',
    duration: '3:00',
    durationMS: 180000,
    url: 'https://example.com/track',
    source: 'youtube',
    thumbnail: 'https://example.com/thumb.jpg',
    id: 'track-123',
    ...overrides,
})

describe('calculateRecommendationScore with Spotify seeds', () => {
    it('should boost score when candidate artist is in user Spotify top artists', () => {
        const spotifySeeds: UserSpotifySeeds = {
            artistIds: ['spotify-artist-1'],
            artistNames: new Set(['test artist']),
            trackIds: [],
        }

        const current = mockTrack()
        const candidate = mockTrack({ author: 'Test Artist' })

        const baseScore = calculateRecommendationScore(
            candidate,
            current,
            new Set(),
        )

        const withSeedsScore = calculateRecommendationScore(
            candidate,
            current,
            new Set(),
            new Map(),
            new Set(),
            new Set(),
            'similar',
            new Map(),
            new Set(),
            new Set(),
            new Map(),
            null,
            spotifySeeds,
        )

        expect(withSeedsScore.score).toBeGreaterThan(baseScore.score)
        expect(withSeedsScore.score).toBe(baseScore.score + 0.08)
        expect(withSeedsScore.reason).toContain('spotify taste')
    })

    it('should not boost score when candidate artist is not in user Spotify top artists', () => {
        const spotifySeeds: UserSpotifySeeds = {
            artistIds: ['spotify-artist-1'],
            artistNames: new Set(['different artist']),
            trackIds: [],
        }

        const current = mockTrack()
        const candidate = mockTrack({ author: 'Test Artist' })

        const baseScore = calculateRecommendationScore(
            candidate,
            current,
            new Set(),
        )

        const withSeedsScore = calculateRecommendationScore(
            candidate,
            current,
            new Set(),
            new Map(),
            new Set(),
            new Set(),
            'similar',
            new Map(),
            new Set(),
            new Set(),
            new Map(),
            null,
            spotifySeeds,
        )

        expect(withSeedsScore.score).toBe(baseScore.score)
    })

    it('should not modify score when spotifySeeds is null', () => {
        const current = mockTrack()
        const candidate = mockTrack()

        const score1 = calculateRecommendationScore(
            candidate,
            current,
            new Set(),
            new Map(),
            new Set(),
            new Set(),
            'similar',
            new Map(),
            new Set(),
            new Set(),
            new Map(),
            null,
            null,
        )

        const score2 = calculateRecommendationScore(
            candidate,
            current,
            new Set(),
            new Map(),
            new Set(),
            new Set(),
            'similar',
            new Map(),
            new Set(),
            new Set(),
            new Map(),
            null,
            undefined,
        )

        expect(score1.score).toBe(score2.score)
    })

    it('should handle case-insensitive artist name matching', () => {
        const spotifySeeds: UserSpotifySeeds = {
            artistIds: [],
            artistNames: new Set(['the beatles']),
            trackIds: [],
        }

        const current = mockTrack()
        const candidate = mockTrack({ author: 'The Beatles' })

        const score = calculateRecommendationScore(
            candidate,
            current,
            new Set(),
            new Map(),
            new Set(),
            new Set(),
            'similar',
            new Map(),
            new Set(),
            new Set(),
            new Map(),
            null,
            spotifySeeds,
        )

        expect(score.reason).toContain('spotify taste')
    })

    it('should stack boost with other scoring factors', () => {
        const spotifySeeds: UserSpotifySeeds = {
            artistIds: [],
            artistNames: new Set(['test artist']),
            trackIds: [],
        }

        const current = mockTrack()
        const candidate = mockTrack({ author: 'Test Artist' })
        const preferredArtists = new Set(['test artist'])

        const score = calculateRecommendationScore(
            candidate,
            current,
            new Set(),
            new Map(),
            preferredArtists,
            new Set(),
            'similar',
            new Map(),
            new Set(),
            new Set(),
            new Map(),
            null,
            spotifySeeds,
        )

        expect(score.reason).toContain('preferred artist')
        expect(score.reason).toContain('spotify taste')
        expect(score.score).toBeGreaterThan(1.0)
    })
})
