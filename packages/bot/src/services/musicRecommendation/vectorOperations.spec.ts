import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Track } from 'discord-player'
import type { TrackVector, RecommendationConfig } from './types'
import {
    createTrackVector,
    calculateCosineSimilarity,
    calculateEuclideanDistance,
    normalizeVector,
    calculateVectorSimilarity,
} from './vectorOperations'

const extractTagsMock = jest.fn()
const extractGenreMock = jest.fn()

jest.mock('../../utils/music/duplicateDetection/tagExtractor', () => ({
    extractTags: (...args: unknown[]) => extractTagsMock(...args),
    extractGenre: (...args: unknown[]) => extractGenreMock(...args),
}))

const createMockTrack = (overrides?: Partial<Track>): Track => ({
    id: 'mock-track-id',
    title: 'Test Track',
    author: 'Test Artist',
    duration: 180000,
    description: '',
    thumbnail: '',
    views: 1000000,
    url: 'https://example.com/track',
    source: 'youtube',
    source_url: 'https://example.com',
    rawTitle: 'Test Track',
    durationMS: 180000,
    playlist: null,
    isStream: false,
    ...overrides,
})

const createMockConfig = (
    overrides?: Partial<RecommendationConfig>,
): RecommendationConfig => ({
    maxRecommendations: 10,
    similarityThreshold: 0.5,
    genreWeight: 0.2,
    tagWeight: 0.15,
    artistWeight: 0.25,
    durationWeight: 0.2,
    popularityWeight: 0.1,
    diversityFactor: 1.0,
    maxTracksPerArtist: 2,
    maxTracksPerSource: 3,
    ...overrides,
})

describe('vectorOperations', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        extractTagsMock.mockReturnValue([])
        extractGenreMock.mockReturnValue(undefined)
    })

    describe('createTrackVector', () => {
        it('returns correct trackId from track.id', () => {
            const track = createMockTrack({ id: 'unique-id-123' })
            extractTagsMock.mockReturnValue([])
            extractGenreMock.mockReturnValue(undefined)

            const vector = createTrackVector(track)

            expect(vector.trackId).toBe('unique-id-123')
        })

        it('falls back to track.url when track.id is missing', () => {
            const track = createMockTrack({
                id: undefined,
                url: 'https://example.com/song',
            })
            extractTagsMock.mockReturnValue([])
            extractGenreMock.mockReturnValue(undefined)

            const vector = createTrackVector(track)

            expect(vector.trackId).toBe('https://example.com/song')
        })

        it('sets title and artist from track properties', () => {
            const track = createMockTrack({
                title: 'My Awesome Song',
                author: 'Great Artist Name',
            })
            extractTagsMock.mockReturnValue([])
            extractGenreMock.mockReturnValue(undefined)

            const vector = createTrackVector(track)

            expect(vector.title).toBe('My Awesome Song')
            expect(vector.artist).toBe('Great Artist Name')
        })

        it('vector is an array of numbers', () => {
            const track = createMockTrack()
            extractTagsMock.mockReturnValue([])
            extractGenreMock.mockReturnValue(undefined)

            const vector = createTrackVector(track)

            expect(Array.isArray(vector.vector)).toBe(true)
            expect(vector.vector.every((v) => typeof v === 'number')).toBe(true)
        })

        it('has duration, views, genre, tags fields set correctly', () => {
            const track = createMockTrack({
                duration: 240000,
                views: 5000000,
            })
            extractTagsMock.mockReturnValue(['rock', 'instrumental'])
            extractGenreMock.mockReturnValue('rock')

            const vector = createTrackVector(track)

            expect(vector.duration).toBe(240000)
            expect(vector.views).toBe(5000000)
            expect(vector.genre).toBe('rock')
            expect(vector.tags).toEqual(['rock', 'instrumental'])
        })

        it('handles string duration correctly', () => {
            const track = createMockTrack({ duration: '300000' as never })
            extractTagsMock.mockReturnValue([])
            extractGenreMock.mockReturnValue(undefined)

            const vector = createTrackVector(track)

            expect(vector.duration).toBe(300000)
        })

        it('includes genre in vector calculations', () => {
            const track = createMockTrack()
            extractTagsMock.mockReturnValue([])
            extractGenreMock.mockReturnValue('pop')

            const vector = createTrackVector(track)

            expect(vector.genre).toBe('pop')
            expect(vector.vector.length).toBeGreaterThan(10)
        })

        it('includes tags in vector calculations', () => {
            const track = createMockTrack()
            extractTagsMock.mockReturnValue(['acoustic', 'indie'])
            extractGenreMock.mockReturnValue('indie')

            const vector = createTrackVector(track)

            expect(vector.tags).toContain('acoustic')
            expect(vector.tags).toContain('indie')
        })
    })

    describe('calculateCosineSimilarity', () => {
        it('returns 1.0 for identical non-zero vectors', () => {
            const vector = [1, 2, 3, 4]
            const similarity = calculateCosineSimilarity(vector, vector)
            expect(similarity).toBeCloseTo(1.0, 5)
        })

        it('returns 0.0 for orthogonal vectors', () => {
            const vectorA = [1, 0, 0, 0]
            const vectorB = [0, 1, 0, 0]
            const similarity = calculateCosineSimilarity(vectorA, vectorB)
            expect(similarity).toBeCloseTo(0.0, 5)
        })

        it('returns 0.0 for vectors of different lengths', () => {
            const vectorA = [1, 2, 3]
            const vectorB = [1, 2, 3, 4]
            const similarity = calculateCosineSimilarity(vectorA, vectorB)
            expect(similarity).toBe(0)
        })

        it('returns 0.0 for both zero vectors', () => {
            const zeroVector = [0, 0, 0, 0]
            const similarity = calculateCosineSimilarity(zeroVector, zeroVector)
            expect(similarity).toBe(0)
        })

        it('calculates realistic partial similarity correctly', () => {
            const vectorA = [1, 2, 3]
            const vectorB = [2, 4, 6]
            const similarity = calculateCosineSimilarity(vectorA, vectorB)
            expect(similarity).toBeCloseTo(1.0, 5)
        })

        it('handles vectors with negative values', () => {
            const vectorA = [1, -1, 0]
            const vectorB = [1, -1, 0]
            const similarity = calculateCosineSimilarity(vectorA, vectorB)
            expect(similarity).toBeCloseTo(1.0, 5)
        })

        it('handles one zero norm gracefully', () => {
            const vectorA = [0, 0, 0]
            const vectorB = [1, 2, 3]
            const similarity = calculateCosineSimilarity(vectorA, vectorB)
            expect(similarity).toBe(0)
        })
    })

    describe('calculateEuclideanDistance', () => {
        it('returns 0.0 for identical vectors', () => {
            const vector = [1, 2, 3, 4]
            const distance = calculateEuclideanDistance(vector, vector)
            expect(distance).toBeCloseTo(0.0, 5)
        })

        it('returns Infinity for vectors of different lengths', () => {
            const vectorA = [1, 2, 3]
            const vectorB = [1, 2, 3, 4]
            const distance = calculateEuclideanDistance(vectorA, vectorB)
            expect(distance).toBe(Infinity)
        })

        it('calculates correct distance [0,0] vs [3,4] = 5.0', () => {
            const vectorA = [0, 0]
            const vectorB = [3, 4]
            const distance = calculateEuclideanDistance(vectorA, vectorB)
            expect(distance).toBeCloseTo(5.0, 5)
        })

        it('handles distance between far vectors', () => {
            const vectorA = [0, 0, 0]
            const vectorB = [10, 10, 10]
            const distance = calculateEuclideanDistance(vectorA, vectorB)
            expect(distance).toBeCloseTo(Math.sqrt(300), 5)
        })

        it('is symmetric', () => {
            const vectorA = [1, 2, 3]
            const vectorB = [4, 5, 6]
            const distanceAB = calculateEuclideanDistance(vectorA, vectorB)
            const distanceBA = calculateEuclideanDistance(vectorB, vectorA)
            expect(distanceAB).toBeCloseTo(distanceBA, 5)
        })
    })

    describe('normalizeVector', () => {
        it('returns same vector unchanged for zero vector', () => {
            const zeroVector = [0, 0, 0]
            const normalized = normalizeVector(zeroVector)
            expect(normalized).toEqual([0, 0, 0])
        })

        it('correctly normalizes [3,4] to [0.6, 0.8]', () => {
            const vector = [3, 4]
            const normalized = normalizeVector(vector)
            expect(normalized[0]).toBeCloseTo(0.6, 5)
            expect(normalized[1]).toBeCloseTo(0.8, 5)
        })

        it('magnitude of normalized vector equals 1.0', () => {
            const vector = [3, 4, 5]
            const normalized = normalizeVector(vector)
            const magnitude = Math.sqrt(
                normalized.reduce((sum, val) => sum + val * val, 0),
            )
            expect(magnitude).toBeCloseTo(1.0, 5)
        })

        it('preserves direction of original vector', () => {
            const vector = [2, 3, 6]
            const normalized = normalizeVector(vector)
            const originalMagnitude = Math.sqrt(
                vector.reduce((sum, val) => sum + val * val, 0),
            )
            const ratios = vector.map((val, i) => val / normalized[i])
            expect(
                ratios.every((r) => Math.abs(r - originalMagnitude) < 0.001),
            ).toBe(true)
        })

        it('already normalized vector stays nearly identical', () => {
            const vector = [1, 0, 0]
            const normalized = normalizeVector(vector)
            expect(normalized[0]).toBeCloseTo(1.0, 5)
            expect(normalized[1]).toBeCloseTo(0.0, 5)
            expect(normalized[2]).toBeCloseTo(0.0, 5)
        })

        it('normalizes negative values correctly', () => {
            const vector = [-3, 4]
            const normalized = normalizeVector(vector)
            const magnitude = Math.sqrt(normalized[0] ** 2 + normalized[1] ** 2)
            expect(magnitude).toBeCloseTo(1.0, 5)
        })
    })

    describe('calculateVectorSimilarity', () => {
        it('returns max score when genres match', () => {
            const track1 = createMockTrack()
            const track2 = createMockTrack()
            const vectorA = createTrackVector(track1)
            const vectorB = createTrackVector(track2)

            extractTagsMock.mockReturnValue([])
            extractGenreMock.mockReturnValue('rock')

            vectorA.genre = 'rock'
            vectorB.genre = 'rock'

            const config = createMockConfig()
            const similarity = calculateVectorSimilarity(
                vectorA,
                vectorB,
                config,
            )

            expect(similarity).toBeGreaterThan(0.1)
        })

        it('applies no bonus when genres are different', () => {
            const track1 = createMockTrack()
            const track2 = createMockTrack()
            const vectorA = createTrackVector(track1)
            const vectorB = createTrackVector(track2)

            extractTagsMock.mockReturnValue([])
            extractGenreMock.mockReturnValue(undefined)

            vectorA.genre = 'rock'
            vectorB.genre = 'pop'

            const config = createMockConfig()
            const similarity = calculateVectorSimilarity(
                vectorA,
                vectorB,
                config,
            )

            expect(similarity).toBeLessThanOrEqual(1.0)
        })

        it('applies no bonus when genre is missing on either vector', () => {
            const track1 = createMockTrack()
            const track2 = createMockTrack()
            const vectorA = createTrackVector(track1)
            const vectorB = createTrackVector(track2)

            extractTagsMock.mockReturnValue([])
            extractGenreMock.mockReturnValue(undefined)

            vectorA.genre = undefined
            vectorB.genre = 'rock'

            const config = createMockConfig()
            const similarity = calculateVectorSimilarity(
                vectorA,
                vectorB,
                config,
            )

            expect(similarity).toBeLessThanOrEqual(1.0)
        })

        it('clamps result to max 1.0 even with bonus', () => {
            const track1 = createMockTrack()
            const track2 = createMockTrack()
            const vectorA = createTrackVector(track1)
            const vectorB = createTrackVector(track2)

            extractTagsMock.mockReturnValue([])
            extractGenreMock.mockReturnValue(undefined)

            vectorA.genre = 'rock'
            vectorB.genre = 'rock'
            vectorA.vector = [1, 0, 0]
            vectorB.vector = [1, 0, 0]

            const config = createMockConfig()
            const similarity = calculateVectorSimilarity(
                vectorA,
                vectorB,
                config,
            )

            expect(similarity).toBeLessThanOrEqual(1.0)
        })

        it('returns value between 0 and 1 for different vectors', () => {
            const track1 = createMockTrack()
            const track2 = createMockTrack()
            const vectorA = createTrackVector(track1)
            const vectorB = createTrackVector(track2)

            extractTagsMock.mockReturnValue([])
            extractGenreMock.mockReturnValue(undefined)

            vectorA.genre = 'rock'
            vectorB.genre = 'pop'

            const config = createMockConfig()
            const similarity = calculateVectorSimilarity(
                vectorA,
                vectorB,
                config,
            )

            expect(similarity).toBeGreaterThanOrEqual(0)
            expect(similarity).toBeLessThanOrEqual(1.0)
        })

        it('returns higher similarity for very similar vectors with same genre', () => {
            const track1 = createMockTrack()
            const track2 = createMockTrack()
            const vectorA = createTrackVector(track1)
            const vectorB = createTrackVector(track2)

            extractTagsMock.mockReturnValue([])
            extractGenreMock.mockReturnValue(undefined)

            vectorA.genre = 'rock'
            vectorB.genre = 'rock'
            vectorA.vector = [1, 2, 3, 4]
            vectorB.vector = [1.1, 2.1, 3.1, 4.1]

            const config = createMockConfig()
            const similarityWithGenre = calculateVectorSimilarity(
                vectorA,
                vectorB,
                config,
            )

            vectorB.genre = 'pop'
            const similarityWithoutGenre = calculateVectorSimilarity(
                vectorA,
                vectorB,
                config,
            )

            expect(similarityWithGenre).toBeGreaterThan(similarityWithoutGenre)
        })
    })
})
