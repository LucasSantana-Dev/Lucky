import { describe, it, expect } from '@jest/globals'
import type { Track } from 'discord-player'
import type { TrackHistoryEntry } from '@lucky/shared/services'
import {
    calculateStringSimilarity,
    areTracksSimilar,
    findSimilarTracks,
    calculateSimilarityScore,
} from './similarityChecker'

const cfg = { titleThreshold: 0.8, artistThreshold: 0.7 }

function makeTrack(title: string, author: string): Track {
    return { title, author } as Track
}

function makeHistory(title: string, author: string): TrackHistoryEntry {
    return { title, author } as unknown as TrackHistoryEntry
}

describe('calculateStringSimilarity', () => {
    it.each([
        ['hello', 'hello', 1.0],
        ['', '', 1.0],
        ['abc', 'xyz', 0],
    ])('returns expected similarity for %s vs %s', (str1, str2, expected) => {
        expect(calculateStringSimilarity(str1, str2)).toBe(expected)
    })

    it('handles edit distance variations (single char, length, misspelling)', () => {
        const singleChar = calculateStringSimilarity('hello', 'helo')
        expect(singleChar).toBeGreaterThan(0.7)
        expect(singleChar).toBeLessThan(1.0)

        const prefixMatch = calculateStringSimilarity('abc', 'abcde')
        expect(prefixMatch).toBeGreaterThan(0.5)

        const longDiff = calculateStringSimilarity('a', 'zzzzz')
        expect(longDiff).toBeLessThan(0.3)

        const misspelling = calculateStringSimilarity('cancion', 'cancoin')
        expect(misspelling).toBeGreaterThan(0.7)
    })

    it('is symmetric regardless of argument order', () => {
        const s1 = calculateStringSimilarity(
            'bohemian rhapsody',
            'bohemian rhapsody live',
        )
        const s2 = calculateStringSimilarity(
            'bohemian rhapsody live',
            'bohemian rhapsody',
        )
        expect(s1).toBeCloseTo(s2, 5)
    })
})

describe('areTracksSimilar', () => {
    it('returns true for identical tracks', () => {
        const t1 = makeTrack('Halo', 'Beyoncé')
        const t2 = makeHistory('Halo', 'Beyoncé')
        expect(areTracksSimilar(t1, t2, cfg)).toBe(true)
    })

    it('returns false when title or artist below threshold', () => {
        const t1 = makeTrack('Halo', 'Beyoncé')
        const t2Title = makeHistory('Crazy in Love', 'Beyoncé')
        const t2Artist = makeHistory('Halo', 'Adele')
        const t2Unrelated = makeHistory('Bohemian Rhapsody', 'Queen')

        expect(areTracksSimilar(t1, t2Title, cfg)).toBe(false)
        expect(areTracksSimilar(t1, t2Artist, cfg)).toBe(false)
        expect(areTracksSimilar(t1, t2Unrelated, cfg)).toBe(false)
    })

    it('is case-insensitive', () => {
        const t1 = makeTrack('HALO', 'BEYONCÉ')
        const t2 = makeHistory('halo', 'beyoncé')
        expect(areTracksSimilar(t1, t2, cfg)).toBe(true)
    })

    it('uses config thresholds to determine matching', () => {
        const t1 = makeTrack('Halo (Live)', 'Beyoncé')
        const t2 = makeHistory('Halo (Live)', 'Beyoncé')
        expect(
            areTracksSimilar(t1, t2, {
                titleThreshold: 0.9,
                artistThreshold: 0.9,
            }),
        ).toBe(true)
    })
})

describe('findSimilarTracks', () => {
    it('filters history entries based on similarity thresholds', () => {
        const track = makeTrack('Halo', 'Beyoncé')

        // Empty history
        expect(findSimilarTracks(track, [], cfg)).toEqual([])

        // Mixed history: 2 matches (identical) + 1 mismatch (different title)
        const mixedHistory: TrackHistoryEntry[] = [
            makeHistory('Halo', 'Beyoncé'),
            makeHistory('Crazy in Love', 'Beyoncé'),
            makeHistory('Halo', 'Beyoncé'),
        ]
        expect(findSimilarTracks(track, mixedHistory, cfg)).toHaveLength(2)

        // No matches history
        const nomatchHistory: TrackHistoryEntry[] = [
            makeHistory('Shape of You', 'Ed Sheeran'),
            makeHistory('Blinding Lights', 'The Weeknd'),
        ]
        expect(findSimilarTracks(track, nomatchHistory, cfg)).toHaveLength(0)
    })
})

describe('calculateSimilarityScore', () => {
    it('returns weighted score with title 0.7 and artist 0.3', () => {
        const t1Identical = makeTrack('Halo', 'Beyoncé')
        const t2Identical = makeHistory('Halo', 'Beyoncé')
        expect(calculateSimilarityScore(t1Identical, t2Identical, cfg)).toBe(
            1.0,
        )

        // title sim = 0 (completely different), artist sim = 1 → 0*0.7 + 1*0.3 = 0.3
        const t1Diff = makeTrack('aaaa', 'same')
        const t2Diff = makeHistory('bbbb', 'same')
        expect(calculateSimilarityScore(t1Diff, t2Diff, cfg)).toBeCloseTo(
            0.3,
            1,
        )
    })

    it('returns value between 0 and 1 for any track pair', () => {
        const t1 = makeTrack('abc', 'xyz')
        const t2 = makeHistory('def', 'uvw')
        const score = calculateSimilarityScore(t1, t2, cfg)
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(1)
    })

    it('ignores config thresholds in score calculation', () => {
        const t1 = makeTrack('Song', 'Artist')
        const t2 = makeHistory('Song', 'Artist')
        const score1 = calculateSimilarityScore(t1, t2, {
            titleThreshold: 0.5,
            artistThreshold: 0.5,
        })
        const score2 = calculateSimilarityScore(t1, t2, {
            titleThreshold: 0.99,
            artistThreshold: 0.99,
        })
        expect(score1).toBe(score2)
    })
})
