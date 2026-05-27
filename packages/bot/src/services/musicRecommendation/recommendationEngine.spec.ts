import {
    describe,
    test,
    expect,
    beforeEach,
    jest,
    afterEach,
} from '@jest/globals'
import type { Track } from 'discord-player'
import type { RecommendationConfig } from './types'
import {
    generateRecommendations,
    generateUserPreferenceRecommendations,
    generateHistoryBasedRecommendations,
    applySpanishLanguagePenalty,
    blendRecommendations,
} from './recommendationEngine'

const calculateTrackSimilarityMock = jest.fn()
const createTrackVectorMock = jest.fn()
const calculateVectorSimilarityMock = jest.fn()
const createUserPreferenceSeedMock = jest.fn()
const applyDiversityFilterMock = jest.fn()
const generateRecommendationReasonsMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('./similarityCalculator', () => ({
    calculateTrackSimilarity: (...args: unknown[]) =>
        calculateTrackSimilarityMock(...args),
    calculateDiversityScore: jest.fn(),
}))

jest.mock('./vectorOperations', () => ({
    createTrackVector: (...args: unknown[]) => createTrackVectorMock(...args),
    calculateVectorSimilarity: (...args: unknown[]) =>
        calculateVectorSimilarityMock(...args),
}))

jest.mock('./recommendationHelpers', () => ({
    createUserPreferenceSeed: (...args: unknown[]) =>
        createUserPreferenceSeedMock(...args),
    applyDiversityFilter: (...args: unknown[]) =>
        applyDiversityFilterMock(...args),
    generateRecommendationReasons: (...args: unknown[]) =>
        generateRecommendationReasonsMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

describe('recommendationEngine', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

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

    const mockTrack = (id: string): Track =>
        ({
            id,
            title: `Track ${id}`,
            author: 'Artist A',
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

    describe('generateRecommendations', () => {
        test('returns empty array when available tracks are empty or below threshold', async () => {
            const seedTrack = mockTrack('seed')

            // Test empty tracks
            const resultEmpty = await generateRecommendations(
                seedTrack,
                [],
                mockConfig,
            )
            expect(resultEmpty).toEqual([])

            // Test tracks below threshold
            const availableTracks = [mockTrack('track1'), mockTrack('track2')]
            createTrackVectorMock.mockReturnValue({
                trackId: 'seed',
                vector: [0.1, 0.2],
            })
            calculateTrackSimilarityMock.mockReturnValue(0.3)
            const resultBelowThreshold = await generateRecommendations(
                seedTrack,
                availableTracks,
                mockConfig,
            )
            expect(resultBelowThreshold).toEqual([])
        })

        test('includes recommendations above threshold with proper scoring', async () => {
            const seedTrack = mockTrack('seed')
            const track1 = mockTrack('track1')
            const track2 = mockTrack('track2')
            const availableTracks = [track1, track2]

            createTrackVectorMock.mockReturnValue({
                vector: [0.5, 0.6],
            })
            calculateTrackSimilarityMock.mockReturnValue(0.75)
            calculateVectorSimilarityMock.mockReturnValue(0.8)
            generateRecommendationReasonsMock.mockReturnValue(['Similar style'])
            applyDiversityFilterMock.mockImplementation((recs) => recs)

            const result = await generateRecommendations(
                seedTrack,
                availableTracks,
                mockConfig,
            )

            expect(result).toHaveLength(2)
            expect(result[0].track.id).toBe('track1')
            expect(result[0].score).toBe(0.775)
        })

        test.each([
            { excludeType: 'id', excludeValue: 'track1' },
            { excludeType: 'url', excludeValue: 'https://example.com/track1' },
        ])('excludes tracks by $excludeType', async ({ excludeValue }) => {
            const seedTrack = mockTrack('seed')
            const track1 = mockTrack('track1')
            const availableTracks = [track1]

            const result = await generateRecommendations(
                seedTrack,
                availableTracks,
                mockConfig,
                [excludeValue],
            )
            expect(result).toEqual([])
        })

        test('applies diversity filter and respects maxRecommendations limit', async () => {
            const seedTrack = mockTrack('seed')
            const availableTracks = Array.from({ length: 20 }, (_, i) =>
                mockTrack(`track${i}`),
            )

            createTrackVectorMock.mockReturnValue({
                vector: [0.5, 0.6],
            })
            calculateTrackSimilarityMock.mockReturnValue(0.75)
            calculateVectorSimilarityMock.mockReturnValue(0.8)
            generateRecommendationReasonsMock.mockReturnValue(['Similar'])

            // Diversity filter removes duplicates
            const filteredRecs = [
                {
                    track: availableTracks[0],
                    score: 0.775,
                    reasons: ['Similar'],
                },
            ]
            applyDiversityFilterMock.mockReturnValue(filteredRecs)

            const result = await generateRecommendations(
                seedTrack,
                availableTracks,
                mockConfig,
            )

            expect(result).toHaveLength(1)
            expect(result.length).toBeLessThanOrEqual(
                mockConfig.maxRecommendations,
            )
        })

        test('handles errors gracefully', async () => {
            const seedTrack = mockTrack('seed')
            createTrackVectorMock.mockImplementation(() => {
                throw new Error('Vector creation failed')
            })

            const result = await generateRecommendations(
                seedTrack,
                [mockTrack('track1')],
                mockConfig,
            )

            expect(result).toEqual([])
            expect(errorLogMock).toHaveBeenCalled()
        })
    })

    describe('generateUserPreferenceRecommendations', () => {
        test('generates recommendations from user preferences, excludes tracks, and handles errors', async () => {
            const preferences = {
                genres: ['rock', 'pop'],
                artists: ['Artist A', 'Artist B'],
                avgDuration: 180,
            }
            const virtualSeed = mockTrack('virtual')
            const track1 = mockTrack('track1')
            const track2 = mockTrack('track2')
            createUserPreferenceSeedMock.mockReturnValue(virtualSeed)
            createTrackVectorMock.mockReturnValue({
                vector: [0.5, 0.6],
            })
            calculateTrackSimilarityMock.mockReturnValue(0.75)
            calculateVectorSimilarityMock.mockReturnValue(0.8)
            generateRecommendationReasonsMock.mockReturnValue([
                'Similar to preference',
            ])
            applyDiversityFilterMock.mockImplementation((recs) => recs)

            // With both tracks available, expect results
            const result = await generateUserPreferenceRecommendations(
                preferences,
                [track1, track2],
                mockConfig,
            )
            expect(result).toHaveLength(2)
            expect(result[0].track.id).toBe('track1')

            // Excluding track1, should return empty
            const resultExcluded = await generateUserPreferenceRecommendations(
                preferences,
                [track1],
                mockConfig,
                ['track1'],
            )
            expect(resultExcluded).toEqual([])

            // Error case
            createUserPreferenceSeedMock.mockImplementation(() => {
                throw new Error('Seed creation failed')
            })
            const resultError = await generateUserPreferenceRecommendations(
                preferences,
                [mockTrack('track1')],
                mockConfig,
            )
            expect(resultError).toEqual([])
            expect(errorLogMock).toHaveBeenCalled()
        })
    })

    describe('generateHistoryBasedRecommendations', () => {
        test('returns empty when history is empty or handles multiple-track blending', async () => {
            // Empty history
            const resultEmpty = await generateHistoryBasedRecommendations(
                [],
                [mockTrack('track1')],
                mockConfig,
            )
            expect(resultEmpty).toEqual([])

            // Multiple history tracks trigger blending
            const historyTracks = [mockTrack('history1'), mockTrack('history2')]
            const track1 = mockTrack('track1')
            const track2 = mockTrack('track2')
            const availableTracks = [track1, track2]

            createTrackVectorMock.mockReturnValue({
                vector: [0.5, 0.6],
            })
            calculateTrackSimilarityMock.mockReturnValue(0.75)
            calculateVectorSimilarityMock.mockReturnValue(0.8)
            generateRecommendationReasonsMock.mockReturnValue(['Similar'])
            applyDiversityFilterMock.mockImplementation((recs) => recs)

            const result = await generateHistoryBasedRecommendations(
                historyTracks,
                availableTracks,
                mockConfig,
            )
            expect(result.length).toBeGreaterThan(0)
            expect(result.length).toBeLessThanOrEqual(availableTracks.length)
        })

        test('generates recommendations from single history track and excludes specified tracks', async () => {
            const historyTracks = [mockTrack('history1')]
            const track1 = mockTrack('track1')
            const availableTracks = [track1]

            createTrackVectorMock.mockReturnValue({
                vector: [0.5, 0.6],
            })
            calculateTrackSimilarityMock.mockReturnValue(0.75)
            calculateVectorSimilarityMock.mockReturnValue(0.8)
            generateRecommendationReasonsMock.mockReturnValue(['Similar'])
            applyDiversityFilterMock.mockImplementation((recs) => recs)

            // With track1 available, expect recommendation
            const result = await generateHistoryBasedRecommendations(
                historyTracks,
                availableTracks,
                mockConfig,
            )
            expect(result).toHaveLength(1)
            expect(result[0].track.id).toBe('track1')

            // Excluding track1, should return empty
            const resultExcluded = await generateHistoryBasedRecommendations(
                historyTracks,
                availableTracks,
                mockConfig,
                ['track1'],
            )
            expect(resultExcluded).toEqual([])
        })

        test('handles errors gracefully', async () => {
            const historyTracks = [mockTrack('history1')]
            createTrackVectorMock.mockImplementation(() => {
                throw new Error('Vector creation failed')
            })

            const result = await generateHistoryBasedRecommendations(
                historyTracks,
                [mockTrack('track1')],
                mockConfig,
            )

            expect(result).toEqual([])
            expect(errorLogMock).toHaveBeenCalled()
        })
    })

    describe('applySpanishLanguagePenalty', () => {
        test('penalizes Spanish tracks in non-Spanish sessions and preserves non-Spanish', () => {
            const recs = [
                {
                    track: {
                        id: '1',
                        title: 'Reggaeton Éxito',
                        author: 'Latino',
                        metadata: {},
                    },
                    score: 0.8,
                    reasons: [],
                },
                {
                    track: {
                        id: '2',
                        title: 'Rock Song',
                        author: 'Band',
                        metadata: {},
                    },
                    score: 0.7,
                    reasons: [],
                },
            ]
            const result = applySpanishLanguagePenalty(recs, false)
            expect(result[0].score).toBe(-2.0)
            expect(result[1].score).toBe(0.7)
            // Empty array also returns empty
            expect(applySpanishLanguagePenalty([], false)).toEqual([])
        })

        test('accepts Spanish in Spanish session', () => {
            const recs = [
                {
                    track: {
                        id: '1',
                        title: 'Reggaeton Éxito',
                        author: 'Latino',
                        metadata: {},
                    },
                    score: 0.8,
                    reasons: [],
                },
            ]
            const result = applySpanishLanguagePenalty(recs, true)
            expect(result[0].score).toBe(0.8)
        })
    })

    describe('blendRecommendations', () => {
        const mockConfig: RecommendationConfig = {
            maxRecommendations: 5,
            diversityThreshold: 0.7,
            prioritizeNewArtists: false,
        }

        test('returns empty array with no inputs', async () => {
            applyDiversityFilterMock.mockImplementation((r) => r)
            const result = await blendRecommendations(
                [],
                [],
                [],
                mockConfig,
                [],
                false,
            )
            expect(result).toEqual([])
        })

        test('sorts by score (including negative scores) and respects max recommendations', async () => {
            applyDiversityFilterMock.mockImplementation((r) => r)

            // Test sorting with positive and negative scores
            const primary = [
                { track: { id: '1' }, score: -0.5, reasons: [] },
                { track: { id: '2' }, score: 0.5, reasons: [] },
                { track: { id: '3' }, score: 0.9, reasons: [] },
            ]
            const result = await blendRecommendations(
                primary,
                [],
                [],
                mockConfig,
                [],
                false,
            )
            // Should be sorted descending
            expect(result[0].score >= result[1].score).toBe(true)
            expect(result[1].score >= result[2].score).toBe(true)

            // Test max recommendations with 10 items
            const manyItems = Array.from({ length: 10 }, (_, i) => ({
                track: { id: String(i) },
                score: 0.5,
                reasons: [],
            }))
            const resultMax = await blendRecommendations(
                manyItems,
                [],
                [],
                mockConfig,
                [],
                false,
            )
            expect(resultMax.length <= 5).toBe(true)
        })
    })
})
