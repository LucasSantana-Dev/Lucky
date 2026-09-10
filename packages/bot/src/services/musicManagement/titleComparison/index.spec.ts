import { describe, expect, it, beforeEach, jest } from '@jest/globals'

// Only the three the service actually uses. Do NOT requireActual this barrel:
// it re-exports database/prismaClient, which is ESM and cannot be required from
// the CommonJS test sandbox. stringUtils reaches similarity through its own
// deep specifier, so it is unaffected by this mock and stays real.
jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    // The service starts a cache-cleanup interval in its constructor, and the
    // barrel constructs a singleton at import time. Left real, that timer keeps
    // the jest worker alive after the suite finishes.
    safeSetInterval: jest.fn(),
}))

import {
    TitleComparison,
    titleComparison,
    extractArtistTitle,
    isSimilarTitle,
    calculateSimilarity,
    clearCache,
    getCacheSize,
} from './index'

describe('titleComparison barrel', () => {
    beforeEach(() => {
        clearCache()
    })

    describe('delegation', () => {
        // Run against the real TitleComparisonService rather than a double, so
        // these assert the facade wires through to working behaviour instead of
        // just that a mock was called.
        it('extractArtistTitle returns the whole input with an unknown artist', () => {
            const result = extractArtistTitle('Daft Punk - Around the World')

            // Not an aspiration about splitting. applyPatterns in
            // utils/misc/stringUtils.ts is a stub: it takes `_patterns` and
            // ignores them, always returning { artist: 'Unknown', title: input }.
            // So this takes the matched branch, not the fallback, and no input
            // can ever yield a real artist. Asserting what the code does, with
            // the gap filed as #2356 rather than encoded as a passing
            // expectation.
            expect(result.artist).toBe('Unknown')
            expect(result.title).toBe('Daft Punk - Around the World')
        })

        it('extractArtistTitle trims surrounding whitespace', () => {
            expect(extractArtistTitle('  Around the World  ').title).toBe(
                'Around the World',
            )
        })

        it('isSimilarTitle is true for a near-identical pair', () => {
            expect(isSimilarTitle('Around the World', 'Around The World')).toBe(
                true,
            )
        })

        it('isSimilarTitle is false for unrelated titles', () => {
            expect(
                isSimilarTitle('Around the World', 'Bohemian Rhapsody'),
            ).toBe(false)
        })

        it('calculateSimilarity reports a bounded score', () => {
            const result = calculateSimilarity('One More Time', 'One More Time')

            expect(result.score).toBeGreaterThanOrEqual(0)
            expect(result.score).toBeLessThanOrEqual(1)
            expect(result.isSimilar).toBe(true)
        })
    })

    describe('cache', () => {
        it('grows as titles are extracted and empties on clear', () => {
            expect(getCacheSize()).toBe(0)

            extractArtistTitle('Daft Punk - Around the World')
            expect(getCacheSize()).toBeGreaterThan(0)

            clearCache()
            expect(getCacheSize()).toBe(0)
        })

        it('does not grow when the same input is extracted twice', () => {
            extractArtistTitle('Daft Punk - Around the World')
            const afterFirst = getCacheSize()

            extractArtistTitle('Daft Punk - Around the World')

            expect(getCacheSize()).toBe(afterFirst)
        })

        it('keys the cache case-insensitively', () => {
            extractArtistTitle('Daft Punk - Around the World')
            const afterFirst = getCacheSize()

            extractArtistTitle('DAFT PUNK - AROUND THE WORLD')

            expect(getCacheSize()).toBe(afterFirst)
        })
    })

    describe('TitleComparison instances', () => {
        it('holds a cache separate from the module singleton', () => {
            const instance = new TitleComparison()

            instance.extractArtistTitle('Daft Punk - Around the World')

            expect(instance.getCacheSize()).toBeGreaterThan(0)
            expect(getCacheSize()).toBe(0)
        })

        it('honours a custom threshold', () => {
            // The pair below is similar but not identical, so a threshold of 1
            // must reject what the default 0.8 accepts.
            const strict = new TitleComparison({ threshold: 1 })

            expect(isSimilarTitle('Around the World', 'Around The Worl')).toBe(
                true,
            )
            expect(
                strict.isSimilarTitle('Around the World', 'Around The Worl'),
            ).toBe(false)
        })

        it('exposes clearCache per instance', () => {
            const instance = new TitleComparison()
            instance.extractArtistTitle('Daft Punk - Around the World')

            instance.clearCache()

            expect(instance.getCacheSize()).toBe(0)
        })
    })

    it('exports a singleton that the free functions share', () => {
        extractArtistTitle('Daft Punk - Around the World')

        expect(titleComparison.getCacheSize()).toBe(getCacheSize())
        expect(getCacheSize()).toBeGreaterThan(0)
    })
})
