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
    it('returns 1.0 for identical strings', () => {
        expect(calculateStringSimilarity('hello', 'hello')).toBe(1.0)
    })

    it('returns 1.0 for two empty strings', () => {
        expect(calculateStringSimilarity('', '')).toBe(1.0)
    })

    it('returns 0 for completely different strings of same length', () => {
        expect(calculateStringSimilarity('abc', 'xyz')).toBe(0)
    })

    it('returns 1.0 when one string is empty and other is empty', () => {
        expect(calculateStringSimilarity('', '')).toBe(1.0)
    })

    it('handles single character difference', () => {
        const sim = calculateStringSimilarity('hello', 'helo')
        expect(sim).toBeGreaterThan(0.7)
        expect(sim).toBeLessThan(1.0)
    })

    it('handles prefix match (longer is denominator)', () => {
        const sim = calculateStringSimilarity('abc', 'abcde')
        expect(sim).toBeGreaterThan(0.5)
    })

    it('handles completely different strings of different lengths', () => {
        const sim = calculateStringSimilarity('a', 'zzzzz')
        expect(sim).toBeLessThan(0.3)
    })

    it('returns same result regardless of argument order (symmetric)', () => {
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

    it('returns high similarity for minor misspelling', () => {
        expect(calculateStringSimilarity('cancion', 'cancoin')).toBeGreaterThan(
            0.7,
        )
    })
})

describe('areTracksSimilar', () => {
    it('returns true for identical tracks', () => {
        const t1 = makeTrack('Halo', 'Beyoncé')
        const t2 = makeHistory('Halo', 'Beyoncé')
        expect(areTracksSimilar(t1, t2, cfg)).toBe(true)
    })

    it('returns false when title similarity below threshold', () => {
        const t1 = makeTrack('Halo', 'Beyoncé')
        const t2 = makeHistory('Crazy in Love', 'Beyoncé')
        expect(areTracksSimilar(t1, t2, cfg)).toBe(false)
    })

    it('returns false when artist similarity below threshold', () => {
        const t1 = makeTrack('Halo', 'Beyoncé')
        const t2 = makeHistory('Halo', 'Adele')
        expect(areTracksSimilar(t1, t2, cfg)).toBe(false)
    })

    it('returns true when both title and artist meet their thresholds', () => {
        const t1 = makeTrack('Halo (Live)', 'Beyoncé')
        const t2 = makeHistory('Halo (Live)', 'Beyoncé')
        expect(
            areTracksSimilar(t1, t2, {
                titleThreshold: 0.9,
                artistThreshold: 0.9,
            }),
        ).toBe(true)
    })

    it('is case-insensitive', () => {
        const t1 = makeTrack('HALO', 'BEYONCÉ')
        const t2 = makeHistory('halo', 'beyoncé')
        expect(areTracksSimilar(t1, t2, cfg)).toBe(true)
    })

    it('returns false when titles are completely unrelated', () => {
        const t1 = makeTrack('Bohemian Rhapsody', 'Queen')
        const t2 = makeHistory('Stairway to Heaven', 'Led Zeppelin')
        expect(areTracksSimilar(t1, t2, cfg)).toBe(false)
    })
})

describe('findSimilarTracks', () => {
    it('returns empty array when history is empty', () => {
        const track = makeTrack('Halo', 'Beyoncé')
        expect(findSimilarTracks(track, [], cfg)).toEqual([])
    })

    it('returns matching history entries', () => {
        const track = makeTrack('Halo', 'Beyoncé')
        const history: TrackHistoryEntry[] = [
            makeHistory('Halo', 'Beyoncé'),
            makeHistory('Crazy in Love', 'Beyoncé'),
            makeHistory('Halo', 'Beyoncé'),
        ]
        const result = findSimilarTracks(track, history, cfg)
        expect(result).toHaveLength(2)
    })

    it('returns empty array when no matches above threshold', () => {
        const track = makeTrack('Halo', 'Beyoncé')
        const history: TrackHistoryEntry[] = [
            makeHistory('Shape of You', 'Ed Sheeran'),
            makeHistory('Blinding Lights', 'The Weeknd'),
        ]
        expect(findSimilarTracks(track, history, cfg)).toHaveLength(0)
    })
})

describe('calculateSimilarityScore', () => {
    it('returns 1.0 for identical tracks', () => {
        const t1 = makeTrack('Halo', 'Beyoncé')
        const t2 = makeHistory('Halo', 'Beyoncé')
        expect(calculateSimilarityScore(t1, t2, cfg)).toBe(1.0)
    })

    it('title contributes 0.7 weight and artist 0.3', () => {
        const t1 = makeTrack('aaaa', 'same')
        const t2 = makeHistory('bbbb', 'same')
        const score = calculateSimilarityScore(t1, t2, cfg)
        // title sim = 0, artist sim = 1 → 0*0.7 + 1*0.3 = 0.3
        expect(score).toBeCloseTo(0.3, 1)
    })

    it('returns value between 0 and 1', () => {
        const t1 = makeTrack('abc', 'xyz')
        const t2 = makeHistory('def', 'uvw')
        const score = calculateSimilarityScore(t1, t2, cfg)
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(1)
    })

    it('is not affected by config (config param is unused in score)', () => {
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
