import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Track } from 'discord-player'
import type { RecommendationResult, RecommendationConfig } from './types'
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

describe('generateRecommendations', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('filters out excluded tracks by id', async () => {
        const seedTrack = {
            id: 'track-seed',
            title: 'Seed',
            author: 'Artist',
        } as Track
        const availableTracks = [
            { id: 'track-1', title: 'Song 1', author: 'Artist A' } as Track,
            { id: 'track-2', title: 'Song 2', author: 'Artist B' } as Track,
        ]
        const excludeIds = ['track-1']

        createTrackVectorMock.mockReturnValue([0.1, 0.2])
        calculateTrackSimilarityMock.mockReturnValue(0.5)
        calculateVectorSimilarityMock.mockReturnValue(0.6)
        generateRecommendationReasonsMock.mockReturnValue(['reason1'])
        applyDiversityFilterMock.mockReturnValue([
            {
                track: availableTracks[1],
                score: 0.55,
                reasons: ['reason1'],
            },
        ])

        const result = await generateRecommendations(
            seedTrack,
            availableTracks,
            defaultConfig,
            excludeIds,
        )

        expect(result).toHaveLength(1)
        expect(result[0].track.id).toBe('track-2')
    })

    it('filters by similarity threshold', async () => {
        const seedTrack = {
            id: 'track-seed',
            title: 'Seed',
            author: 'Artist',
        } as Track
        const availableTracks = [
            { id: 'track-low', title: 'Song 1', author: 'Artist A' } as Track,
            { id: 'track-high', title: 'Song 2', author: 'Artist B' } as Track,
        ]

        createTrackVectorMock.mockReturnValue([0.1, 0.2])
        calculateTrackSimilarityMock
            .mockReturnValueOnce(0.2) // below threshold
            .mockReturnValueOnce(0.5) // above threshold
        calculateVectorSimilarityMock.mockReturnValue(0.6)
        generateRecommendationReasonsMock.mockReturnValue(['reason1'])
        applyDiversityFilterMock.mockReturnValue([
            {
                track: availableTracks[1],
                score: 0.55,
                reasons: ['reason1'],
            },
        ])

        const result = await generateRecommendations(
            seedTrack,
            availableTracks,
            defaultConfig,
        )

        expect(result).toHaveLength(1)
        expect(result[0].track.id).toBe('track-high')
    })

    it('sorts recommendations by score descending', async () => {
        const seedTrack = {
            id: 'track-seed',
            title: 'Seed',
            author: 'Artist',
        } as Track
        const availableTracks = [
            {
                id: 'track-1',
                title: 'Song 1',
                author: 'Artist A',
                url: 'url1',
            } as Track,
            {
                id: 'track-2',
                title: 'Song 2',
                author: 'Artist B',
                url: 'url2',
            } as Track,
        ]

        createTrackVectorMock.mockReturnValue([0.1, 0.2])
        calculateTrackSimilarityMock.mockReturnValue(0.5)
        calculateVectorSimilarityMock
            .mockReturnValueOnce(0.4) // first track gets 0.45 score
            .mockReturnValueOnce(0.8) // second track gets 0.65 score
        generateRecommendationReasonsMock.mockReturnValue(['reason1'])
        applyDiversityFilterMock.mockImplementation((recs) =>
            recs.sort((a, b) => b.score - a.score),
        )

        const result = await generateRecommendations(
            seedTrack,
            availableTracks,
            defaultConfig,
        )

        expect(result[0].score).toBeGreaterThanOrEqual(result[1].score)
    })

    it('applies diversity filter to results', async () => {
        const seedTrack = {
            id: 'track-seed',
            title: 'Seed',
            author: 'Artist',
        } as Track
        const availableTracks = [
            { id: 'track-1', title: 'Song 1', author: 'Artist A' } as Track,
        ]

        createTrackVectorMock.mockReturnValue([0.1, 0.2])
        calculateTrackSimilarityMock.mockReturnValue(0.5)
        calculateVectorSimilarityMock.mockReturnValue(0.6)
        generateRecommendationReasonsMock.mockReturnValue(['reason1'])
        const filtered: RecommendationResult[] = [
            {
                track: availableTracks[0],
                score: 0.55,
                reasons: ['reason1'],
            },
        ]
        applyDiversityFilterMock.mockReturnValue(filtered)

        const result = await generateRecommendations(
            seedTrack,
            availableTracks,
            defaultConfig,
        )

        expect(applyDiversityFilterMock).toHaveBeenCalledWith(
            expect.any(Array),
            defaultConfig,
        )
        expect(result).toEqual(filtered)
    })

    it('limits results to maxRecommendations', async () => {
        const seedTrack = {
            id: 'track-seed',
            title: 'Seed',
            author: 'Artist',
        } as Track
        const manyTracks = Array.from(
            { length: 20 },
            (_, i) =>
                ({
                    id: `track-${i}`,
                    title: `Song ${i}`,
                    author: `Artist ${i}`,
                }) as Track,
        )

        createTrackVectorMock.mockReturnValue([0.1, 0.2])
        calculateTrackSimilarityMock.mockReturnValue(0.5)
        calculateVectorSimilarityMock.mockReturnValue(0.6)
        generateRecommendationReasonsMock.mockReturnValue(['reason1'])
        const manyResults = manyTracks.map((t) => ({
            track: t,
            score: 0.55,
            reasons: ['reason1'],
        }))
        applyDiversityFilterMock.mockReturnValue(manyResults)

        const result = await generateRecommendations(
            seedTrack,
            manyTracks,
            defaultConfig,
        )

        expect(result).toHaveLength(defaultConfig.maxRecommendations)
    })

    it('returns empty array on error', async () => {
        const seedTrack = {
            id: 'track-seed',
            title: 'Seed',
            author: 'Artist',
        } as Track
        createTrackVectorMock.mockImplementation(() => {
            throw new Error('vector error')
        })

        const result = await generateRecommendations(
            seedTrack,
            [],
            defaultConfig,
        )

        expect(result).toEqual([])
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Error generating recommendations:',
            }),
        )
    })

    it('calculates average score from similarity and vector similarity', async () => {
        const seedTrack = {
            id: 'track-seed',
            title: 'Seed',
            author: 'Artist',
        } as Track
        const availableTracks = [
            { id: 'track-1', title: 'Song 1', author: 'Artist A' } as Track,
        ]

        createTrackVectorMock.mockReturnValue([0.1, 0.2])
        calculateTrackSimilarityMock.mockReturnValue(0.6)
        calculateVectorSimilarityMock.mockReturnValue(0.8)
        generateRecommendationReasonsMock.mockReturnValue(['reason1'])
        applyDiversityFilterMock.mockImplementation((recs) => recs)

        const result = await generateRecommendations(
            seedTrack,
            availableTracks,
            defaultConfig,
        )

        expect(result[0].score).toBe((0.6 + 0.8) / 2)
    })
})

describe('generateUserPreferenceRecommendations', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('creates virtual seed from preferences', async () => {
        const preferences = {
            genres: ['rock'],
            artists: ['Artist A'],
            avgDuration: 180,
        }
        const virtualTrack = { id: 'virtual-seed' } as Track
        createUserPreferenceSeedMock.mockReturnValue(virtualTrack)
        applyDiversityFilterMock.mockReturnValue([])

        await generateUserPreferenceRecommendations(
            preferences,
            [],
            defaultConfig,
        )

        expect(createUserPreferenceSeedMock).toHaveBeenCalledWith(preferences)
    })

    it('passes virtual seed to generateRecommendations', async () => {
        const preferences = {
            genres: ['rock'],
            artists: ['Artist A'],
            avgDuration: 180,
        }
        const virtualTrack = { id: 'virtual-seed' } as Track
        const availableTracks = [{ id: 'track-1', title: 'Song 1' } as Track]

        createUserPreferenceSeedMock.mockReturnValue(virtualTrack)
        createTrackVectorMock.mockReturnValue([0.1])
        calculateTrackSimilarityMock.mockReturnValue(0.5)
        calculateVectorSimilarityMock.mockReturnValue(0.6)
        generateRecommendationReasonsMock.mockReturnValue(['reason1'])
        applyDiversityFilterMock.mockReturnValue([
            {
                track: availableTracks[0],
                score: 0.55,
                reasons: ['reason1'],
            },
        ])

        const result = await generateUserPreferenceRecommendations(
            preferences,
            availableTracks,
            defaultConfig,
        )

        expect(createTrackVectorMock).toHaveBeenCalledWith(virtualTrack)
        expect(result).toHaveLength(1)
    })

    it('respects exclude track ids', async () => {
        const preferences = {
            genres: ['rock'],
            artists: ['Artist A'],
            avgDuration: 180,
        }
        const virtualTrack = { id: 'virtual-seed' } as Track
        createUserPreferenceSeedMock.mockReturnValue(virtualTrack)
        applyDiversityFilterMock.mockReturnValue([])

        await generateUserPreferenceRecommendations(
            preferences,
            [],
            defaultConfig,
            ['excluded-1'],
        )

        expect(createUserPreferenceSeedMock).toHaveBeenCalledWith(preferences)
    })

    it('returns empty array on error', async () => {
        const preferences = {
            genres: ['rock'],
            artists: ['Artist A'],
            avgDuration: 180,
        }
        createUserPreferenceSeedMock.mockImplementation(() => {
            throw new Error('preference error')
        })

        const result = await generateUserPreferenceRecommendations(
            preferences,
            [],
            defaultConfig,
        )

        expect(result).toEqual([])
        expect(errorLogMock).toHaveBeenCalled()
    })
})

describe('generateHistoryBasedRecommendations', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('returns empty array for empty history', async () => {
        const result = await generateHistoryBasedRecommendations(
            [],
            [],
            defaultConfig,
        )

        expect(result).toEqual([])
    })

    it('uses first history track as primary seed', async () => {
        const history = [{ id: 'history-1', title: 'Past Song 1' } as Track]
        const availableTracks = [{ id: 'track-1', title: 'Song 1' } as Track]

        createTrackVectorMock.mockReturnValue([0.1])
        calculateTrackSimilarityMock.mockReturnValue(0.5)
        calculateVectorSimilarityMock.mockReturnValue(0.6)
        generateRecommendationReasonsMock.mockReturnValue(['reason1'])
        applyDiversityFilterMock.mockReturnValue([
            {
                track: availableTracks[0],
                score: 0.55,
                reasons: ['reason1'],
            },
        ])

        const result = await generateHistoryBasedRecommendations(
            history,
            availableTracks,
            defaultConfig,
        )

        expect(createTrackVectorMock).toHaveBeenCalledWith(history[0])
        expect(result).toHaveLength(1)
    })

    it('blends recommendations from multiple history tracks', async () => {
        const history = [
            { id: 'history-1', title: 'Past Song 1' } as Track,
            { id: 'history-2', title: 'Past Song 2' } as Track,
            { id: 'history-3', title: 'Past Song 3' } as Track,
        ]
        const availableTracks = [
            {
                id: 'track-1',
                title: 'Song 1',
                url: 'url1',
            } as Track,
        ]

        createTrackVectorMock.mockReturnValue([0.1])
        calculateTrackSimilarityMock.mockReturnValue(0.5)
        calculateVectorSimilarityMock.mockReturnValue(0.6)
        generateRecommendationReasonsMock.mockReturnValue(['reason1'])
        applyDiversityFilterMock.mockReturnValue([
            {
                track: availableTracks[0],
                score: 0.55,
                reasons: ['reason1'],
            },
        ])

        const result = await generateHistoryBasedRecommendations(
            history,
            availableTracks,
            defaultConfig,
        )

        expect(result).toHaveLength(1)
        expect(createTrackVectorMock.mock.calls.length).toBeGreaterThan(1)
    })

    it('returns empty array on error', async () => {
        const history = [{ id: 'history-1' } as Track]
        createTrackVectorMock.mockImplementation(() => {
            throw new Error('history error')
        })

        const result = await generateHistoryBasedRecommendations(
            history,
            [],
            defaultConfig,
        )

        expect(result).toEqual([])
        expect(errorLogMock).toHaveBeenCalled()
    })
})
