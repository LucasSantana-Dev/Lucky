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
        test('returns empty array when available tracks are empty', async () => {
            const seedTrack = mockTrack('seed')
            const result = await generateRecommendations(
                seedTrack,
                [],
                mockConfig,
            )
            expect(result).toEqual([])
        })

        test('filters tracks below similarity threshold', async () => {
            const seedTrack = mockTrack('seed')
            const availableTracks = [mockTrack('track1'), mockTrack('track2')]

            createTrackVectorMock.mockReturnValue({
                trackId: 'seed',
                vector: [0.1, 0.2],
            })
            calculateTrackSimilarityMock.mockReturnValue(0.3)

            const result = await generateRecommendations(
                seedTrack,
                availableTracks,
                mockConfig,
            )
            expect(result).toEqual([])
        })

        test('includes tracks above similarity threshold', async () => {
            const seedTrack = mockTrack('seed')
            const track1 = mockTrack('track1')
            const availableTracks = [track1]

            createTrackVectorMock.mockReturnValue({
                trackId: 'track1',
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

            expect(result).toHaveLength(1)
            expect(result[0].track.id).toBe('track1')
        })

        test('excludes tracks by id', async () => {
            const seedTrack = mockTrack('seed')
            const track1 = mockTrack('track1')
            const availableTracks = [track1]

            const result = await generateRecommendations(
                seedTrack,
                availableTracks,
                mockConfig,
                ['track1'],
            )
            expect(result).toEqual([])
        })

        test('excludes tracks by url', async () => {
            const seedTrack = mockTrack('seed')
            const track1 = mockTrack('track1')
            const availableTracks = [track1]

            const result = await generateRecommendations(
                seedTrack,
                availableTracks,
                mockConfig,
                ['https://example.com/track1'],
            )
            expect(result).toEqual([])
        })

        test('includes multiple matching recommendations', async () => {
            const seedTrack = mockTrack('seed')
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

            const result = await generateRecommendations(
                seedTrack,
                availableTracks,
                mockConfig,
            )

            expect(result).toHaveLength(2)
        })

        test('applies diversity filter', async () => {
            const seedTrack = mockTrack('seed')
            const track1 = mockTrack('track1')
            const availableTracks = [track1]

            createTrackVectorMock.mockReturnValue({
                vector: [0.5, 0.6],
            })
            calculateTrackSimilarityMock.mockReturnValue(0.75)
            calculateVectorSimilarityMock.mockReturnValue(0.8)
            generateRecommendationReasonsMock.mockReturnValue(['Similar'])

            const filteredRecs = [
                {
                    track: track1,
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

            expect(applyDiversityFilterMock).toHaveBeenCalled()
        })

        test('respects maxRecommendations limit', async () => {
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

            const allRecs = availableTracks.map((track, idx) => ({
                track,
                score: 0.775 - idx * 0.01,
                reasons: ['Similar'],
            }))
            applyDiversityFilterMock.mockReturnValue(allRecs)

            const result = await generateRecommendations(
                seedTrack,
                availableTracks,
                mockConfig,
            )

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
        test('creates virtual seed from preferences', async () => {
            const preferences = {
                genres: ['rock', 'pop'],
                artists: ['Artist A', 'Artist B'],
                avgDuration: 180,
            }
            const virtualSeed = mockTrack('virtual')
            createUserPreferenceSeedMock.mockReturnValue(virtualSeed)
            createTrackVectorMock.mockReturnValue({
                vector: [0.5, 0.6],
            })
            applyDiversityFilterMock.mockImplementation((recs) => recs)

            await generateUserPreferenceRecommendations(
                preferences,
                [mockTrack('track1')],
                mockConfig,
            )

            expect(createUserPreferenceSeedMock).toHaveBeenCalledWith(
                preferences,
            )
        })

        test('returns empty array on error', async () => {
            const preferences = {
                genres: ['rock'],
                artists: ['Artist A'],
                avgDuration: 180,
            }
            createUserPreferenceSeedMock.mockImplementation(() => {
                throw new Error('Seed creation failed')
            })

            const result = await generateUserPreferenceRecommendations(
                preferences,
                [mockTrack('track1')],
                mockConfig,
            )

            expect(result).toEqual([])
            expect(errorLogMock).toHaveBeenCalled()
        })

        test('excludes specified tracks', async () => {
            const preferences = {
                genres: ['rock'],
                artists: ['Artist A'],
                avgDuration: 180,
            }
            const virtualSeed = mockTrack('virtual')
            createUserPreferenceSeedMock.mockReturnValue(virtualSeed)
            createTrackVectorMock.mockReturnValue({
                vector: [0.5, 0.6],
            })
            calculateTrackSimilarityMock.mockReturnValue(0.75)
            calculateVectorSimilarityMock.mockReturnValue(0.8)
            generateRecommendationReasonsMock.mockReturnValue(['Similar'])
            applyDiversityFilterMock.mockImplementation((recs) => recs)

            const result = await generateUserPreferenceRecommendations(
                preferences,
                [mockTrack('track1')],
                mockConfig,
                ['track1'],
            )

            expect(result).toEqual([])
        })
    })

    describe('generateHistoryBasedRecommendations', () => {
        test('returns empty array when history is empty', async () => {
            const result = await generateHistoryBasedRecommendations(
                [],
                [mockTrack('track1')],
                mockConfig,
            )
            expect(result).toEqual([])
        })

        test('uses first history track as primary seed', async () => {
            const historyTracks = [mockTrack('history1'), mockTrack('history2')]
            const availableTracks = [mockTrack('track1')]

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

            expect(calculateTrackSimilarityMock).toHaveBeenCalledWith(
                historyTracks[0],
                availableTracks[0],
                mockConfig,
            )
        })

        test('blends recommendations when history has multiple tracks', async () => {
            const historyTracks = [mockTrack('history1'), mockTrack('history2')]
            const availableTracks = [mockTrack('track1')]

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

            expect(calculateTrackSimilarityMock).toHaveBeenCalledTimes(2)
        })

        test('returns primary recommendations when history has one track', async () => {
            const historyTracks = [mockTrack('history1')]
            const availableTracks = [mockTrack('track1')]

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

            expect(result).toHaveLength(1)
            expect(calculateTrackSimilarityMock).toHaveBeenCalledTimes(1)
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

        test('excludes specified tracks', async () => {
            const historyTracks = [mockTrack('history1')]
            const availableTracks = [mockTrack('track1')]

            const result = await generateHistoryBasedRecommendations(
                historyTracks,
                availableTracks,
                mockConfig,
                ['track1'],
            )

            expect(result).toEqual([])
        })
    })
})
