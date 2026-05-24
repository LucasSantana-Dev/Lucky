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
        it.each([
            {
                id: 'unique-id-123',
                url: 'https://example.com/track',
                expected: 'unique-id-123',
                desc: 'from id',
            },
            {
                id: undefined,
                url: 'https://example.com/song',
                expected: 'https://example.com/song',
                desc: 'fallback url',
            },
        ])('trackId $desc', ({ id, url, expected }) => {
            const track = createMockTrack({ id, url })
            const vector = createTrackVector(track)
            expect(vector.trackId).toBe(expected)
        })

        it('populates title, artist, duration, views, genre, tags; coerces string duration; constructs vector', () => {
            const track = createMockTrack({
                title: 'My Song',
                author: 'My Artist',
                duration: '240000' as never,
                views: 5000000,
            })
            extractTagsMock.mockReturnValue(['rock'])
            extractGenreMock.mockReturnValue('rock')

            const vector = createTrackVector(track)

            expect(vector.title).toBe('My Song')
            expect(vector.artist).toBe('My Artist')
            expect(vector.duration).toBe(240000)
            expect(vector.views).toBe(5000000)
            expect(vector.genre).toBe('rock')
            expect(vector.tags).toEqual(['rock'])
            expect(Array.isArray(vector.vector)).toBe(true)
            expect(vector.vector.every((v) => typeof v === 'number')).toBe(true)
            expect(vector.vector.length).toBeGreaterThan(10)
        })
    })

    describe('calculateCosineSimilarity', () => {
        it.each([
            {
                a: [1, 2, 3, 4],
                b: [1, 2, 3, 4],
                expected: 1.0,
                desc: 'identical',
            },
            {
                a: [1, 0, 0, 0],
                b: [0, 1, 0, 0],
                expected: 0.0,
                desc: 'orthogonal',
            },
            {
                a: [1, 2, 3],
                b: [1, 2, 3, 4],
                expected: 0,
                desc: 'different lengths',
            },
            {
                a: [0, 0, 0, 0],
                b: [0, 0, 0, 0],
                expected: 0,
                desc: 'both zero',
            },
            { a: [1, 2, 3], b: [2, 4, 6], expected: 1.0, desc: 'proportional' },
            {
                a: [1, -1, 0],
                b: [1, -1, 0],
                expected: 1.0,
                desc: 'negative values',
            },
        ])('$desc: $expected', ({ a, b, expected }) => {
            const similarity = calculateCosineSimilarity(a, b)
            expect(similarity).toBeCloseTo(expected, 5)
        })
    })

    describe('calculateEuclideanDistance', () => {
        it.each([
            { a: [1, 2, 3, 4], b: [1, 2, 3, 4], expected: 0.0 },
            { a: [1, 2, 3], b: [1, 2, 3, 4], expected: Infinity },
            { a: [0, 0], b: [3, 4], expected: 5.0 },
            { a: [0, 0, 0], b: [10, 10, 10], expected: Math.sqrt(300) },
        ])('distance $expected', ({ a, b, expected }) => {
            expect(calculateEuclideanDistance(a, b)).toBeCloseTo(expected, 5)
        })

        it('is symmetric and handles [1,2,3] ↔ [4,5,6]', () => {
            const a = [1, 2, 3]
            const b = [4, 5, 6]
            expect(calculateEuclideanDistance(a, b)).toBeCloseTo(
                calculateEuclideanDistance(b, a),
                5,
            )
        })
    })

    describe('normalizeVector', () => {
        it.each([
            { v: [0, 0, 0], expected: [0, 0, 0], desc: 'zero vector' },
            { v: [3, 4], expected: [0.6, 0.8], desc: '[3,4]' },
            { v: [1, 0, 0], expected: [1, 0, 0], desc: '[1,0,0]' },
        ])('$desc unchanged/expected', ({ v, expected }) => {
            const normalized = normalizeVector(v)
            normalized.forEach((val, i) => {
                expect(val).toBeCloseTo(expected[i], 5)
            })
        })

        it('magnitude of [3,4,5] and [-3,4] after normalization equals 1.0', () => {
            for (const v of [
                [3, 4, 5],
                [-3, 4],
            ]) {
                const normalized = normalizeVector(v)
                const magnitude = Math.sqrt(
                    normalized.reduce((sum, val) => sum + val * val, 0),
                )
                expect(magnitude).toBeCloseTo(1.0, 5)
            }
        })

        it('preserves direction: [2,3,6] ratios constant after normalization', () => {
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
    })

    describe('calculateVectorSimilarity', () => {
        it('genre match: +0.2 bonus, clamped ≤1.0; mismatch/missing: no bonus, result in [0,1]', () => {
            const config = createMockConfig()
            const vectorA = createTrackVector(createMockTrack())
            const vectorB = createTrackVector(createMockTrack())

            // match with different vectors (to see bonus effect)
            vectorA.genre = 'rock'
            vectorB.genre = 'rock'
            vectorA.vector = [1, 2, 3]
            vectorB.vector = [1.1, 2.1, 3.1]
            const simMatch = calculateVectorSimilarity(vectorA, vectorB, config)
            expect(simMatch).toBeLessThanOrEqual(1.0)
            expect(simMatch).toBeGreaterThan(0.1)

            // mismatch (no bonus)
            vectorB.genre = 'pop'
            const simMismatch = calculateVectorSimilarity(
                vectorA,
                vectorB,
                config,
            )
            expect(simMismatch).toBeGreaterThanOrEqual(0)
            expect(simMismatch).toBeLessThanOrEqual(1.0)
            expect(simMatch).toBeGreaterThan(simMismatch)

            // missing genre (no bonus)
            vectorA.genre = undefined
            vectorB.genre = 'rock'
            const simMissing = calculateVectorSimilarity(
                vectorA,
                vectorB,
                config,
            )
            expect(simMissing).toBeGreaterThanOrEqual(0)
            expect(simMissing).toBeLessThanOrEqual(1.0)
        })
    })
})
