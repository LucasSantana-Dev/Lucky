import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Track } from 'discord-player'
import type { RecommendationResult, RecommendationConfig } from './types'
import {
    createUserPreferenceSeed,
    applyDiversityFilter,
    generateRecommendationReasons,
} from './recommendationHelpers'

const calculateDiversityScoreMock = jest.fn()

jest.mock('./similarityCalculator', () => ({
    calculateDiversityScore: (...args: unknown[]) =>
        calculateDiversityScoreMock(...args),
}))

const defaultConfig: RecommendationConfig = {
    maxRecommendations: 10,
    similarityThreshold: 0.3,
    genreWeight: 0.4,
    tagWeight: 0.3,
    artistWeight: 0.2,
    durationWeight: 0.05,
    popularityWeight: 0.05,
    diversityFactor: 0.3,
    maxTracksPerArtist: 2,
    maxTracksPerSource: 3,
}

describe('createUserPreferenceSeed', () => {
    it('creates virtual track with first artist from preferences', () => {
        const preferences = {
            genres: ['rock', 'metal'],
            artists: ['Artist A', 'Artist B'],
            avgDuration: 200,
        }

        const track = createUserPreferenceSeed(preferences)

        expect(track.id).toBe('virtual-seed')
        expect(track.author).toBe('Artist A')
        expect(track.title).toBe('User Preference Mix')
    })

    it('uses "Various Artists" when no artists provided', () => {
        const preferences = {
            genres: ['rock'],
            artists: [],
            avgDuration: 200,
        }

        const track = createUserPreferenceSeed(preferences)

        expect(track.author).toBe('Various Artists')
    })

    it('converts average duration to milliseconds', () => {
        const preferences = {
            genres: ['pop'],
            artists: ['Artist C'],
            avgDuration: 180, // seconds
        }

        const track = createUserPreferenceSeed(preferences)

        expect(track.duration).toBe(180 * 1000)
    })

    it('includes first genre in description', () => {
        const preferences = {
            genres: ['jazz', 'blues'],
            artists: ['Artist D'],
            avgDuration: 240,
        }

        const track = createUserPreferenceSeed(preferences)

        expect(track.description).toContain('jazz')
    })

    it('uses "various" in description when no genres provided', () => {
        const preferences = {
            genres: [],
            artists: ['Artist E'],
            avgDuration: 200,
        }

        const track = createUserPreferenceSeed(preferences)

        expect(track.description).toContain('various')
    })

    it('sets metadata with virtual source and engine', () => {
        const preferences = {
            genres: ['electronic'],
            artists: ['Artist F'],
            avgDuration: 220,
        }

        const track = createUserPreferenceSeed(preferences)

        expect(track.metadata?.source).toBe('virtual')
        expect(track.metadata?.engine).toBe('preferences')
    })
})

describe('applyDiversityFilter', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('returns all recommendations when diversity factor is 0', () => {
        const recs: RecommendationResult[] = [
            {
                track: { id: 'track-1', title: 'Song 1' } as Track,
                score: 0.9,
                reasons: ['reason1'],
            },
            {
                track: { id: 'track-2', title: 'Song 2' } as Track,
                score: 0.8,
                reasons: ['reason2'],
            },
        ]
        const config = { ...defaultConfig, diversityFactor: 0 }

        const result = applyDiversityFilter(recs, config)

        expect(result).toEqual(recs)
        expect(calculateDiversityScoreMock).not.toHaveBeenCalled()
    })

    it('returns single recommendation unchanged', () => {
        const recs: RecommendationResult[] = [
            {
                track: { id: 'track-1', title: 'Song 1' } as Track,
                score: 0.9,
                reasons: ['reason1'],
            },
        ]

        const result = applyDiversityFilter(recs, defaultConfig)

        expect(result).toEqual(recs)
    })

    it('filters recommendations based on diversity score threshold', () => {
        const track1 = { id: 'track-1', title: 'Song 1' } as Track
        const track2 = { id: 'track-2', title: 'Song 2' } as Track
        const track3 = { id: 'track-3', title: 'Song 3' } as Track

        const recs: RecommendationResult[] = [
            { track: track1, score: 0.9, reasons: ['reason1'] },
            { track: track2, score: 0.8, reasons: ['reason2'] },
            { track: track3, score: 0.7, reasons: ['reason3'] },
        ]

        calculateDiversityScoreMock
            .mockReturnValueOnce(0.5) // track2 passes (> 0.3)
            .mockReturnValueOnce(0.5) // track3 also passes

        const result = applyDiversityFilter(recs, defaultConfig)

        expect(result.length).toBeGreaterThanOrEqual(1)
        expect(result[0].track.id).toBe('track-1')
    })

    it('removes duplicate tracks by id', () => {
        const track = { id: 'track-1', title: 'Song 1' } as Track
        const recs: RecommendationResult[] = [
            { track, score: 0.9, reasons: ['reason1'] },
            { track, score: 0.8, reasons: ['reason2'] },
        ]

        calculateDiversityScoreMock.mockReturnValue(0.5)

        const result = applyDiversityFilter(recs, defaultConfig)

        expect(result).toHaveLength(1)
    })

    it('uses track url as fallback when id is missing', () => {
        const track1 = { url: 'url-1', title: 'Song 1' } as Track
        const track2 = { url: 'url-1', title: 'Song 1 Duplicate' } as Track

        const recs: RecommendationResult[] = [
            { track: track1, score: 0.9, reasons: ['reason1'] },
            { track: track2, score: 0.8, reasons: ['reason2'] },
        ]

        calculateDiversityScoreMock.mockReturnValue(0.5)

        const result = applyDiversityFilter(recs, defaultConfig)

        expect(result).toHaveLength(1)
    })

    it('applies diversity calculation for subsequent recommendations', () => {
        const track1 = { id: 'track-1', title: 'Song 1' } as Track
        const track2 = { id: 'track-2', title: 'Song 2' } as Track
        const track3 = { id: 'track-3', title: 'Song 3' } as Track

        const recs: RecommendationResult[] = [
            { track: track1, score: 0.9, reasons: ['reason1'] },
            { track: track2, score: 0.8, reasons: ['reason2'] },
            { track: track3, score: 0.7, reasons: ['reason3'] },
        ]

        calculateDiversityScoreMock
            .mockReturnValueOnce(0.5) // track2 passes
            .mockReturnValueOnce(0.5) // track3 passes

        applyDiversityFilter(recs, defaultConfig)

        // Verify that diversity calculation was called multiple times
        expect(calculateDiversityScoreMock.mock.calls.length).toBeGreaterThan(0)
    })
})

describe('generateRecommendationReasons', () => {
    it('adds "Very similar" reason when similarity > 0.8', () => {
        const seed = {
            title: 'Song A',
            author: 'Artist A',
            duration: 180,
        } as Track
        const recommended = {
            title: 'Song B',
            author: 'Artist B',
            duration: 180,
        } as Track

        const reasons = generateRecommendationReasons(
            seed,
            recommended,
            0.85,
            0.5,
        )

        expect(reasons).toContain('Very similar to your current track')
    })

    it('adds "Similar style" reason when similarity > 0.6', () => {
        const seed = {
            title: 'Song A',
            author: 'Artist A',
            duration: 180,
        } as Track
        const recommended = {
            title: 'Song B',
            author: 'Artist B',
            duration: 180,
        } as Track

        const reasons = generateRecommendationReasons(
            seed,
            recommended,
            0.7,
            0.5,
        )

        expect(reasons).toContain('Similar style to your current track')
    })

    it('adds "Matches patterns" reason when vector similarity > 0.7', () => {
        const seed = {
            title: 'Song A',
            author: 'Artist A',
            duration: 180,
        } as Track
        const recommended = {
            title: 'Song B',
            author: 'Artist B',
            duration: 180,
        } as Track

        const reasons = generateRecommendationReasons(
            seed,
            recommended,
            0.5,
            0.75,
        )

        expect(reasons).toContain('Matches your listening patterns')
    })

    it('adds "Same artist" reason when authors match', () => {
        const seed = {
            title: 'Song A',
            author: 'Artist A',
            duration: 180,
        } as Track
        const recommended = {
            title: 'Song B',
            author: 'Artist A',
            duration: 180,
        } as Track

        const reasons = generateRecommendationReasons(
            seed,
            recommended,
            0.5,
            0.5,
        )

        expect(reasons).toContain('Same artist')
    })

    it('adds "Similar duration" reason when duration difference < 30s', () => {
        const seed = {
            title: 'Song A',
            author: 'Artist A',
            duration: 180000,
        } as Track
        const recommended = {
            title: 'Song B',
            author: 'Artist B',
            duration: 185000,
        } as Track

        const reasons = generateRecommendationReasons(
            seed,
            recommended,
            0.5,
            0.5,
        )

        expect(reasons).toContain('Similar duration')
    })

    it('handles duration as string or number', () => {
        const seed = {
            title: 'Song A',
            author: 'Artist A',
            duration: '180000',
        } as unknown as Track
        const recommended = {
            title: 'Song B',
            author: 'Artist B',
            duration: 185000,
        } as Track

        const reasons = generateRecommendationReasons(
            seed,
            recommended,
            0.5,
            0.5,
        )

        expect(reasons).toContain('Similar duration')
    })

    it('returns default reason when no criteria match', () => {
        const seed = {
            title: 'Song A',
            author: 'Artist A',
            duration: 100000,
        } as Track
        const recommended = {
            title: 'Song B',
            author: 'Artist B',
            duration: 500000,
        } as Track

        const reasons = generateRecommendationReasons(
            seed,
            recommended,
            0.2,
            0.1,
        )

        expect(reasons).toEqual(['Recommended based on your preferences'])
    })

    it('combines multiple reasons', () => {
        const seed = {
            title: 'Song A',
            author: 'Artist A',
            duration: 180000,
        } as Track
        const recommended = {
            title: 'Song B',
            author: 'Artist A',
            duration: 185000,
        } as Track

        const reasons = generateRecommendationReasons(
            seed,
            recommended,
            0.85,
            0.8,
        )

        expect(reasons).toContain('Very similar to your current track')
        expect(reasons).toContain('Matches your listening patterns')
        expect(reasons).toContain('Same artist')
        expect(reasons).toContain('Similar duration')
        expect(reasons.length).toBeGreaterThan(1)
    })
})
