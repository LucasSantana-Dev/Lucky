import {
    calculateTrackSimilarity,
    calculateStringSimilarity,
    calculateDurationSimilarity,
    calculateTrackQuality,
} from '../../../src/utils/music/trackSimilarity'
import { createMockTrack } from '../../__mocks__/discordPlayer'

describe('trackSimilarity', () => {
    describe('calculateStringSimilarity', () => {
        it('returns 1 for identical strings', () => {
            expect(
                calculateStringSimilarity('hello world', 'hello world'),
            ).toBe(1)
        })

        it('returns 0 for completely different strings', () => {
            expect(calculateStringSimilarity('abc', 'xyz')).toBe(0)
        })

        it('returns partial similarity for overlapping words', () => {
            const result = calculateStringSimilarity(
                'bohemian rhapsody queen',
                'bohemian rhapsody live',
            )
            expect(result).toBeGreaterThan(0.4)
            expect(result).toBeLessThan(1)
        })

        it('is case insensitive', () => {
            expect(
                calculateStringSimilarity('Hello World', 'hello world'),
            ).toBe(1)
        })

        it('handles empty strings', () => {
            const result = calculateStringSimilarity('', 'test')
            expect(result).toBeDefined()
        })
    })

    describe('calculateDurationSimilarity', () => {
        it('returns 1 for identical durations', () => {
            expect(calculateDurationSimilarity(210000, 210000)).toBe(1)
        })

        it('returns high similarity for close durations', () => {
            expect(calculateDurationSimilarity(210000, 215000)).toBeGreaterThan(
                0.95,
            )
        })

        it('returns low similarity for very different durations', () => {
            expect(calculateDurationSimilarity(60000, 600000)).toBeLessThan(0.2)
        })

        it('returns 0 when either duration is 0', () => {
            expect(calculateDurationSimilarity(0, 210000)).toBe(0)
            expect(calculateDurationSimilarity(210000, 0)).toBe(0)
        })

        it('handles string durations', () => {
            const result = calculateDurationSimilarity('210000', '210000')
            expect(result).toBe(1)
        })
    })

    describe('calculateTrackSimilarity', () => {
        it('returns 1 for identical tracks', () => {
            const track = createMockTrack({
                title: 'Test Song',
                author: 'Test Artist',
                duration: '210000',
                url: 'https://youtube.com/watch?v=abc',
            })
            const result = calculateTrackSimilarity(track, track)
            expect(result).toBeGreaterThan(0.9)
        })

        it('returns high similarity for same song different URL', () => {
            const trackA = createMockTrack({
                title: 'Bohemian Rhapsody',
                author: 'Queen',
                duration: '355000',
                url: 'https://youtube.com/watch?v=abc',
            })
            const trackB = createMockTrack({
                title: 'Bohemian Rhapsody',
                author: 'Queen',
                duration: '355000',
                url: 'https://youtube.com/watch?v=xyz',
            })
            const result = calculateTrackSimilarity(trackA, trackB)
            expect(result).toBeGreaterThan(0.8)
        })

        it('returns low similarity for different tracks', () => {
            const trackA = createMockTrack({
                title: 'Bohemian Rhapsody',
                author: 'Queen',
            })
            const trackB = createMockTrack({
                title: 'Stairway to Heaven',
                author: 'Led Zeppelin',
            })
            const result = calculateTrackSimilarity(trackA, trackB)
            expect(result).toBeLessThan(0.5)
        })
    })

    describe('calculateTrackQuality', () => {
        it('gives high score to well-formed tracks', () => {
            const track = createMockTrack({
                title: 'Bohemian Rhapsody - Official Video',
                author: 'Queen',
                duration: '355000',
                thumbnail: 'https://img.youtube.com/thumb.jpg',
                views: 1500000000,
            })
            const score = calculateTrackQuality(track)
            expect(score).toBeGreaterThanOrEqual(0.8)
        })

        it('gives lower score to sparse tracks', () => {
            const track = createMockTrack({
                title: 'x',
                author: '',
                duration: '5000',
                thumbnail: '',
                views: 0,
            })
            const score = calculateTrackQuality(track)
            expect(score).toBeLessThan(0.7)
        })

        it('caps score at 1.0', () => {
            const track = createMockTrack({
                title: 'A reasonably long track title here',
                author: 'Some Artist',
                duration: '210000',
                thumbnail: 'https://thumb.jpg',
                views: 999999999,
            })
            expect(calculateTrackQuality(track)).toBeLessThanOrEqual(1.0)
        })
    })
})
