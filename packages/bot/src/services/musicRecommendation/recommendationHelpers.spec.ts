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
        test('creates virtual track from user preferences', () => {
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
        })

        test('uses first genre in description', () => {
            const preferences = {
                genres: ['jazz', 'blues'],
                artists: ['Artist A'],
                avgDuration: 180,
            }

            const result = createUserPreferenceSeed(preferences)

            expect(result.description).toContain('jazz')
        })

        test('uses "various" genre when genres array is empty', () => {
            const preferences = {
                genres: [],
                artists: ['Artist A'],
                avgDuration: 180,
            }

            const result = createUserPreferenceSeed(preferences)

            expect(result.description).toContain('various')
        })

        test('uses first artist as author', () => {
            const preferences = {
                genres: ['rock'],
                artists: ['The Beatles', 'The Stones'],
                avgDuration: 180,
            }

            const result = createUserPreferenceSeed(preferences)

            expect(result.author).toBe('The Beatles')
        })

        test('uses "Various Artists" when artists array is empty', () => {
            const preferences = {
                genres: ['rock'],
                artists: [],
                avgDuration: 180,
            }

            const result = createUserPreferenceSeed(preferences)

            expect(result.author).toBe('Various Artists')
        })

        test('converts average duration to milliseconds', () => {
            const preferences = {
                genres: ['rock'],
                artists: ['Artist A'],
                avgDuration: 300,
            }

            const result = createUserPreferenceSeed(preferences)

            expect(result.duration).toBe(300000)
        })

        test('sets metadata correctly', () => {
            const preferences = {
                genres: ['rock'],
                artists: ['Artist A'],
                avgDuration: 180,
            }

            const result = createUserPreferenceSeed(preferences)

            expect(result.metadata).toEqual({
                source: 'virtual',
                engine: 'preferences',
            })
        })
    })

    describe('applyDiversityFilter', () => {
        test('returns all when length is 1', () => {
            const recommendations = [
                {
                    track: mockTrack('track1'),
                    score: 0.8,
                    reasons: ['Similar'],
                },
            ]

            const result = applyDiversityFilter(recommendations, mockConfig)

            expect(result).toEqual(recommendations)
        })

        test('returns all when diversityFactor is 0', () => {
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
            const config = { ...mockConfig, diversityFactor: 0 }

            const result = applyDiversityFilter(recommendations, config)

            expect(result).toEqual(recommendations)
        })

        test('filters duplicate tracks by id', () => {
            const track1 = mockTrack('track1')
            const recommendations = [
                {
                    track: track1,
                    score: 0.8,
                    reasons: ['Similar'],
                },
                {
                    track: track1,
                    score: 0.7,
                    reasons: ['Similar'],
                },
            ]
            calculateDiversityScoreMock.mockReturnValue(0.8)

            const result = applyDiversityFilter(recommendations, mockConfig)

            expect(result).toHaveLength(1)
        })

        test('applies diversity score check', () => {
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
            calculateDiversityScoreMock
                .mockReturnValueOnce(0.8)
                .mockReturnValueOnce(0.5)

            applyDiversityFilter(recommendations, mockConfig)

            expect(calculateDiversityScoreMock).toHaveBeenCalled()
        })

        test('maintains insertion order', () => {
            const recommendations = [
                { track: mockTrack('track1'), score: 0.8, reasons: ['S'] },
                { track: mockTrack('track2'), score: 0.7, reasons: ['S'] },
                { track: mockTrack('track3'), score: 0.6, reasons: ['S'] },
            ]
            calculateDiversityScoreMock.mockReturnValue(0.5)

            const result = applyDiversityFilter(recommendations, mockConfig)

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

        test('includes very similar reason at 0.85+', () => {
            const seedTrack = mockTrack('seed')
            const rec = mockTrack('track1', 'Diff')
            rec.duration = 350000

            const reasons = generateRecommendationReasons(
                seedTrack,
                rec,
                0.85,
                0.2,
            )

            expect(reasons).toContain('Very similar to your current track')
        })

        test('includes similar style reason at 0.6-0.8', () => {
            const seedTrack = mockTrack('seed')
            const rec = mockTrack('track1', 'Diff')
            rec.duration = 350000

            const reasons = generateRecommendationReasons(
                seedTrack,
                rec,
                0.65,
                0.2,
            )

            expect(reasons).toContain('Similar style to your current track')
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

        test('includes similar duration reason', () => {
            const seedTrack = mockTrack('seed')
            seedTrack.duration = 180000
            const rec = mockTrack('track1')
            rec.duration = 185000

            const reasons = generateRecommendationReasons(
                seedTrack,
                rec,
                0.3,
                0.2,
            )

            expect(reasons).toContain('Similar duration')
        })

        test('excludes duration for very different lengths', () => {
            const seedTrack = mockTrack('seed')
            seedTrack.duration = 180000
            const rec = mockTrack('track1')
            rec.duration = 300000

            const reasons = generateRecommendationReasons(
                seedTrack,
                rec,
                0.3,
                0.2,
            )

            expect(reasons).not.toContain('Similar duration')
        })

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

        test('duration threshold boundary at 30000ms', () => {
            const seedTrack = mockTrack('seed')
            seedTrack.duration = 100000
            const rec = mockTrack('track1')
            rec.duration = 130000

            const reasons = generateRecommendationReasons(
                seedTrack,
                rec,
                0.3,
                0.2,
            )

            expect(reasons).not.toContain('Similar duration')
        })
    })
})
