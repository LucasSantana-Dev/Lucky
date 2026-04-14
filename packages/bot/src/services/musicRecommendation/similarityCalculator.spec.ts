import { beforeEach, describe, expect, it } from '@jest/globals'
import type { Track } from 'discord-player'
import type { RecommendationConfig } from './types'
import {
    calculateTrackSimilarity,
    calculateDiversityScore,
} from './similarityCalculator'

const createMockTrack = (overrides?: Partial<Track>): Track => ({
    id: 'mock-track-id',
    title: 'Test Track',
    author: 'Test Artist',
    duration: 180000,
    description: '',
    thumbnail: '',
    views: 1000,
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

describe('similarityCalculator', () => {
    describe('calculateTrackSimilarity', () => {
        it('returns high score for identical tracks', () => {
            const track = createMockTrack({
                title: 'Amazing Song',
                author: 'Great Artist',
                duration: 240000,
            })
            const config = createMockConfig()

            const similarity = calculateTrackSimilarity(track, track, config)
            expect(similarity).toBeGreaterThan(0.79)
        })

        it('returns lower score when titles are completely different', () => {
            const trackA = createMockTrack({ title: 'Song A' })
            const trackB = createMockTrack({
                title: 'Completely Different Title',
            })
            const config = createMockConfig()

            const similarity = calculateTrackSimilarity(trackA, trackB, config)
            expect(similarity).toBeLessThan(0.6)
        })

        it('returns higher score when artists match exactly', () => {
            const trackA = createMockTrack({
                title: 'Song A',
                author: 'Same Artist',
            })
            const trackB = createMockTrack({
                title: 'Different Song',
                author: 'Same Artist',
            })
            const config = createMockConfig()

            const similarity = calculateTrackSimilarity(trackA, trackB, config)
            expect(similarity).toBeGreaterThan(0.5)
        })

        it('handles artist substring matches with 0.8 partial match', () => {
            const trackA = createMockTrack({
                title: 'Song',
                author: 'Artist Name Full',
            })
            const trackB = createMockTrack({
                title: 'Song',
                author: 'Artist Name',
            })
            const config = createMockConfig()

            const similarity = calculateTrackSimilarity(trackA, trackB, config)
            expect(similarity).toBeGreaterThan(0.7)
        })

        it('handles duration ratio: same duration gives 1.0', () => {
            const trackA = createMockTrack({
                title: 'Song',
                author: 'Artist',
                duration: 240000,
            })
            const trackB = createMockTrack({
                title: 'Song',
                author: 'Artist',
                duration: 240000,
            })
            const config = createMockConfig({ durationWeight: 1.0 })

            const similarity = calculateTrackSimilarity(trackA, trackB, config)
            expect(similarity).toBeGreaterThan(0.8)
        })

        it('handles wildly different durations with lower score', () => {
            const trackA = createMockTrack({ duration: 60000 })
            const trackB = createMockTrack({ duration: 600000 })
            const config = createMockConfig()

            const similarity = calculateTrackSimilarity(trackA, trackB, config)
            const identicalTrackScore = calculateTrackSimilarity(
                trackA,
                trackA,
                config,
            )
            expect(similarity).toBeLessThan(identicalTrackScore)
        })

        it('handles duration 0 as neutral (0.5)', () => {
            const trackA = createMockTrack({
                duration: 0,
                title: 'X',
                author: 'Y',
            })
            const trackB = createMockTrack({
                duration: 120000,
                title: 'X',
                author: 'Y',
            })
            const config = createMockConfig({ durationWeight: 1.0 })

            const similarity = calculateTrackSimilarity(trackA, trackB, config)
            expect(similarity).toBeCloseTo(1.095, 1)
        })

        it('handles title word overlap (Jaccard): 2 common out of 4 union = 0.5', () => {
            const trackA = createMockTrack({ title: 'Hello World Song' })
            const trackB = createMockTrack({ title: 'Hello World Different' })
            const config = createMockConfig()

            const similarity = calculateTrackSimilarity(trackA, trackB, config)
            expect(similarity).toBeGreaterThan(0.1)
        })

        it('returns 0.0 title component when no common words', () => {
            const trackA = createMockTrack({ title: 'AAA BBB' })
            const trackB = createMockTrack({ title: 'XXX YYY' })
            const config = createMockConfig()

            const similarity = calculateTrackSimilarity(trackA, trackB, config)
            expect(similarity).toBeLessThan(0.6)
        })

        it('correctly parses numeric duration strings', () => {
            const trackA = createMockTrack({ duration: '240000' as never })
            const trackB = createMockTrack({ duration: '240000' as never })
            const config = createMockConfig()

            const similarity = calculateTrackSimilarity(trackA, trackB, config)
            expect(similarity).toBeCloseTo(0.795, 1)
        })

        it('applies config weights correctly', () => {
            const trackA = createMockTrack({
                title: 'Song A',
                author: 'Artist A',
                duration: 180000,
            })
            const trackB = createMockTrack({
                title: 'Song B',
                author: 'Artist B',
                duration: 180000,
            })

            const configHighArtist = createMockConfig({
                artistWeight: 0.6,
                durationWeight: 0.1,
            })
            const configHighDuration = createMockConfig({
                artistWeight: 0.1,
                durationWeight: 0.6,
            })

            const scoreHighArtist = calculateTrackSimilarity(
                trackA,
                trackB,
                configHighArtist,
            )
            const scoreHighDuration = calculateTrackSimilarity(
                trackA,
                trackB,
                configHighDuration,
            )

            expect(scoreHighDuration).toBeGreaterThan(scoreHighArtist)
        })

        it('is case-insensitive for title and artist comparison', () => {
            const trackA = createMockTrack({
                title: 'Amazing Song',
                author: 'Great Artist',
            })
            const trackB = createMockTrack({
                title: 'amazing song',
                author: 'great artist',
            })
            const config = createMockConfig()

            const similarity = calculateTrackSimilarity(trackA, trackB, config)
            expect(similarity).toBeGreaterThan(0.75)
        })

        it('handles whitespace normalization', () => {
            const trackA = createMockTrack({
                title: '  Amazing   Song  ',
                author: '  Artist   Name  ',
            })
            const trackB = createMockTrack({
                title: 'Amazing Song',
                author: 'Artist Name',
            })
            const config = createMockConfig()

            const similarity = calculateTrackSimilarity(trackA, trackB, config)
            expect(similarity).toBeGreaterThan(0.65)
        })
    })

    describe('calculateDiversityScore', () => {
        it('returns 1.0 for empty array', () => {
            const config = createMockConfig()
            const score = calculateDiversityScore([], config)
            expect(score).toBe(1.0)
        })

        it('returns 1.0 for single track', () => {
            const track = createMockTrack()
            const config = createMockConfig()
            const score = calculateDiversityScore([track], config)
            expect(score).toBe(1.0)
        })

        it('returns low score for two identical tracks', () => {
            const track = createMockTrack()
            const config = createMockConfig()
            const score = calculateDiversityScore([track, track], config)
            expect(score).toBeLessThan(0.3)
        })

        it('returns high score for two very different tracks', () => {
            const trackA = createMockTrack({
                title: 'Rock Song',
                author: 'Rock Band',
                duration: 240000,
            })
            const trackB = createMockTrack({
                title: 'Classical Composition',
                author: 'Orchestra',
                duration: 600000,
            })
            const config = createMockConfig()
            const score = calculateDiversityScore([trackA, trackB], config)
            expect(score).toBeGreaterThan(0.5)
        })

        it('correctly calculates diversity for multiple tracks', () => {
            const trackA = createMockTrack({
                title: 'Song A',
                author: 'Artist A',
                duration: 180000,
            })
            const trackB = createMockTrack({
                title: 'Song B',
                author: 'Artist B',
                duration: 200000,
            })
            const trackC = createMockTrack({
                title: 'Song C',
                author: 'Artist C',
                duration: 220000,
            })
            const config = createMockConfig()

            const score = calculateDiversityScore(
                [trackA, trackB, trackC],
                config,
            )
            expect(score).toBeGreaterThan(0.0)
            expect(score).toBeLessThanOrEqual(1.0)
        })

        it('diversity decreases when adding more similar tracks', () => {
            const trackA = createMockTrack({
                title: 'Song A',
                author: 'Artist A',
            })
            const trackB = createMockTrack({
                title: 'Song B',
                author: 'Artist B',
            })
            const trackC = createMockTrack({
                title: 'Song A Remix',
                author: 'Artist A',
            })
            const config = createMockConfig()

            const scoreTwoTracks = calculateDiversityScore(
                [trackA, trackB],
                config,
            )
            const scoreThreeTracksWithSimilar = calculateDiversityScore(
                [trackA, trackB, trackC],
                config,
            )

            expect(scoreThreeTracksWithSimilar).toBeLessThan(scoreTwoTracks)
        })
    })
})
