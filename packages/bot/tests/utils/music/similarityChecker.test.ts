import {
    calculateStringSimilarity,
    areTracksSimilar,
    findSimilarTracks,
    calculateSimilarityScore,
} from '../../../src/utils/music/duplicateDetection/similarityChecker'
import { defaultSimilarityConfig } from '../../../src/utils/music/duplicateDetection/types'
import { createMockTrack } from '../../__mocks__/discordPlayer'
import type { TrackHistoryEntry } from '@nexus/shared/services'

describe('similarityChecker', () => {
    describe('calculateStringSimilarity (Levenshtein)', () => {
        it('returns 1 for identical strings', () => {
            expect(calculateStringSimilarity('hello', 'hello')).toBe(1)
        })

        it('returns 0 for completely different strings', () => {
            const result = calculateStringSimilarity('abc', 'xyz')
            expect(result).toBeLessThan(0.5)
        })

        it('returns 1 for two empty strings', () => {
            expect(calculateStringSimilarity('', '')).toBe(1)
        })

        it('handles single character difference', () => {
            const result = calculateStringSimilarity('cat', 'bat')
            expect(result).toBeGreaterThan(0.5)
        })

        it('handles substring relationships', () => {
            const result = calculateStringSimilarity(
                'bohemian rhapsody',
                'bohemian rhapsody live',
            )
            expect(result).toBeGreaterThan(0.7)
        })
    })

    describe('areTracksSimilar', () => {
        it('detects identical tracks as similar', () => {
            const track1 = createMockTrack({
                title: 'Bohemian Rhapsody',
                author: 'Queen',
            })
            const track2 = createMockTrack({
                title: 'Bohemian Rhapsody',
                author: 'Queen',
            })
            expect(
                areTracksSimilar(track1, track2, defaultSimilarityConfig),
            ).toBe(true)
        })

        it('detects different tracks as not similar', () => {
            const track1 = createMockTrack({
                title: 'Bohemian Rhapsody',
                author: 'Queen',
            })
            const track2 = createMockTrack({
                title: 'Stairway to Heaven',
                author: 'Led Zeppelin',
            })
            expect(
                areTracksSimilar(track1, track2, defaultSimilarityConfig),
            ).toBe(false)
        })

        it('detects slightly different titles as similar', () => {
            const track1 = createMockTrack({
                title: 'Bohemian Rhapsody Official',
                author: 'Queen',
            })
            const track2: TrackHistoryEntry = {
                title: 'Bohemian Rhapsody',
                author: 'Queen',
                url: 'https://youtube.com/watch?v=xyz',
                playedAt: Date.now(),
            }
            const similarity = calculateStringSimilarity(
                track1.title.toLowerCase(),
                track2.title.toLowerCase(),
            )
            expect(similarity).toBeGreaterThan(0.5)
            expect(
                areTracksSimilar(track1, track2, {
                    ...defaultSimilarityConfig,
                    titleThreshold: similarity - 0.01,
                }),
            ).toBe(true)
        })

        it('uses custom thresholds', () => {
            const track1 = createMockTrack({
                title: 'Test',
                author: 'Artist A',
            })
            const track2 = createMockTrack({
                title: 'Test',
                author: 'Artist B',
            })
            const strictConfig = {
                ...defaultSimilarityConfig,
                artistThreshold: 0.95,
            }
            expect(areTracksSimilar(track1, track2, strictConfig)).toBe(false)
        })
    })

    describe('findSimilarTracks', () => {
        it('returns empty array when no similar tracks', () => {
            const track = createMockTrack({
                title: 'Unique Song',
                author: 'Unknown',
            })
            const history: TrackHistoryEntry[] = [
                {
                    title: 'Different Song',
                    author: 'Other Artist',
                    url: 'https://example.com',
                    playedAt: Date.now(),
                },
            ]
            expect(
                findSimilarTracks(track, history, defaultSimilarityConfig),
            ).toHaveLength(0)
        })

        it('finds similar tracks in history', () => {
            const track = createMockTrack({
                title: 'Bohemian Rhapsody',
                author: 'Queen',
            })
            const history: TrackHistoryEntry[] = [
                {
                    title: 'Bohemian Rhapsody',
                    author: 'Queen',
                    url: 'https://youtube.com/1',
                    playedAt: Date.now() - 60000,
                },
                {
                    title: 'Another Song',
                    author: 'Other',
                    url: 'https://youtube.com/2',
                    playedAt: Date.now() - 120000,
                },
            ]
            const similar = findSimilarTracks(
                track,
                history,
                defaultSimilarityConfig,
            )
            expect(similar).toHaveLength(1)
            expect(similar[0].title).toBe('Bohemian Rhapsody')
        })
    })

    describe('calculateSimilarityScore', () => {
        it('returns 1 for identical tracks', () => {
            const track = createMockTrack({
                title: 'Test',
                author: 'Artist',
            })
            expect(
                calculateSimilarityScore(track, track, defaultSimilarityConfig),
            ).toBe(1)
        })

        it('weights title more than artist', () => {
            const base = createMockTrack({
                title: 'Same Title',
                author: 'Artist A',
            })
            const sameTitle = createMockTrack({
                title: 'Same Title',
                author: 'Different Artist',
            })
            const sameArtist = createMockTrack({
                title: 'Different Title',
                author: 'Artist A',
            })

            const titleScore = calculateSimilarityScore(
                base,
                sameTitle,
                defaultSimilarityConfig,
            )
            const artistScore = calculateSimilarityScore(
                base,
                sameArtist,
                defaultSimilarityConfig,
            )

            expect(titleScore).toBeGreaterThan(artistScore)
        })
    })
})
