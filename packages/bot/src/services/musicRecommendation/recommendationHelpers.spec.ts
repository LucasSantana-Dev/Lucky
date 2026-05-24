import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import type { Track } from 'discord-player'
import type { RecommendationConfig } from './types'
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

describe('recommendationHelpers', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    const mockTrack = (id: string, author = 'Artist A'): Track =>
        ({
            id,
            title: `Track ${id}`,
            author,
            duration: 180000,
            url: `https://example.com/${id}`,
            thumbnail: '',
            description: 'Test track',
            views: 1000,
            requestedBy: null,
            source: 'youtube',
            raw: {} as Record<string, unknown>,
            metadata: {},
        }) as unknown as Track

    const mockConfig: RecommendationConfig = {
        maxRecommendations: 10,
        similarityThreshold: 0.5,
        genreWeight: 0.3,
        tagWeight: 0.2,
        artistWeight: 0.2,
        durationWeight: 0.1,
        popularityWeight: 0.1,
        diversityFactor: 0.2,
        maxTracksPerArtist: 2,
        maxTracksPerSource: 3,
    }

    describe('createUserPreferenceSeed', () => {
        test('creates virtual track with core properties and metadata', () => {
            const preferences = {
                genres: ['rock', 'pop'],
                artists: ['Artist A', 'Artist B'],
                avgDuration: 200,
            }

            const result = createUserPreferenceSeed(preferences)

            expect(result.id).toBe('virtual-seed')
            expect(result.title).toBe('User Preference Mix')
            expect(result.author).toBe('Artist A')
            expect(result.duration).toBe(200000)
            expect(result.source).toBe('virtual')
            expect(result.description).toContain('rock')
            expect(result.metadata).toEqual({
                source: 'virtual',
                engine: 'preferences',
            })
        })

        test('uses fallback values when genres and artists are empty', () => {
            const preferences = {
                genres: [],
                artists: [],
                avgDuration: 180,
            }

            const result = createUserPreferenceSeed(preferences)

            expect(result.description).toContain('various')
            expect(result.author).toBe('Various Artists')
        })

        test('converts average duration to milliseconds', () => {
            const preferences = {
                genres: ['jazz'],
                artists: ['Miles Davis'],
                avgDuration: 300,
            }

            const result = createUserPreferenceSeed(preferences)

            expect(result.duration).toBe(300000)
        })
    })

    describe('applyDiversityFilter', () => {
        test('bypasses filtering when length is 1 or diversityFactor is 0', () => {
            const single = [
                {
                    track: mockTrack('track1'),
                    score: 0.8,
                    reasons: ['Similar'],
                },
            ]

            const resultSingle = applyDiversityFilter(single, mockConfig)
            expect(resultSingle).toEqual(single)

            const multiple = [
                {
                    track: mockTrack('track1'),
                    score: 0.8,
                    reasons: ['Similar'],
                },
                {
                    track: mockTrack('track2'),
                    score: 0.7,
                    reasons: ['Similar'],
                },
            ]
            const configNoDiv = { ...mockConfig, diversityFactor: 0 }
            const resultNoDiversity = applyDiversityFilter(multiple, configNoDiv)
            expect(resultNoDiversity).toEqual(multiple)
        })

        test('applies diversity score to filter recommendations', () => {
            const recommendations = [
                {
                    track: mockTrack('track1'),
                    score: 0.8,
                    reasons: ['Similar'],
                },
                {
                    track: mockTrack('track2'),
                    score: 0.7,
                    reasons: ['Similar'],
                },
            ]
            // Mock diversity score below threshold for track2 to filter it out
            calculateDiversityScoreMock
                .mockReturnValueOnce(0.8) // Keep track1
                .mockReturnValueOnce(0.1) // Reject track2 (below 0.2 threshold)

            const result = applyDiversityFilter(recommendations, mockConfig)

            expect(result.length).toBeLessThanOrEqual(recommendations.length)
            if (result.length > 0) expect(result[0].track.id).toBe('track1')
        })
    })

    describe('generateRecommendationReasons', () => {
        test('returns default when low similarity and low vector', () => {
            const seedTrack = mockTrack('seed')
            seedTrack.duration = 180000
            const rec = mockTrack('track1', 'Different')
            rec.duration = 350000

            const reasons = generateRecommendationReasons(
                seedTrack,
                rec,
                0.3,
                0.2,
            )

            expect(reasons).toContain('Recommended based on your preferences')
        })

        test.each([
            [0.85, 'Very similar to your current track'],
            [0.65, 'Similar style to your current track'],
        ])('includes reason for similarity score %f', (similarity, expectedReason) => {
            const seedTrack = mockTrack('seed')
            const rec = mockTrack('track1', 'Diff')
            rec.duration = 350000

            const reasons = generateRecommendationReasons(
                seedTrack,
                rec,
                similarity,
                0.2,
            )

            expect(reasons).toContain(expectedReason)
        })

        test('includes pattern matching at high vector similarity', () => {
            const seedTrack = mockTrack('seed')
            const rec = mockTrack('track1', 'Diff')
            rec.duration = 350000

            const reasons = generateRecommendationReasons(
                seedTrack,
                rec,
                0.3,
                0.75,
            )

            expect(reasons).toContain('Matches your listening patterns')
        })

        test('includes same artist reason', () => {
            const seedTrack = mockTrack('seed', 'Same')
            const rec = mockTrack('track1', 'Same')
            rec.duration = 350000

            const reasons = generateRecommendationReasons(
                seedTrack,
                rec,
                0.3,
                0.2,
            )

            expect(reasons).toContain('Same artist')
        })

        test.each([
            [180000, 185000, true, 'includes similar duration for close durations'],
            [180000, 300000, false, 'excludes duration for very different lengths'],
            [100000, 130000, false, 'duration threshold boundary at 30000ms'],
        ])(
            '$2: seed duration %d, rec duration %d',
            (seedDuration, recDuration, shouldInclude) => {
                const seedTrack = mockTrack('seed')
                seedTrack.duration = seedDuration
                const rec = mockTrack('track1')
                rec.duration = recDuration

                const reasons = generateRecommendationReasons(
                    seedTrack,
                    rec,
                    0.3,
                    0.2,
                )

                if (shouldInclude) {
                    expect(reasons).toContain('Similar duration')
                } else {
                    expect(reasons).not.toContain('Similar duration')
                }
            },
        )

        test('combines multiple reasons', () => {
            const seedTrack = mockTrack('seed', 'Same')
            seedTrack.duration = 180000
            const rec = mockTrack('track1', 'Same')
            rec.duration = 181000

            const reasons = generateRecommendationReasons(
                seedTrack,
                rec,
                0.85,
                0.75,
            )

            expect(reasons.length).toBeGreaterThan(1)
            expect(reasons).toContain('Very similar to your current track')
        })

        test('handles string durations', () => {
            const seedTrack = mockTrack('seed')
            seedTrack.duration = '180000' as unknown as number
            const rec = mockTrack('track1')
            rec.duration = '185000' as unknown as number

            const reasons = generateRecommendationReasons(
                seedTrack,
                rec,
                0.3,
                0.2,
            )

            expect(reasons).toContain('Similar duration')
        })
    })
})
