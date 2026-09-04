import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { Track } from 'discord-player'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
}))

jest.mock('./diversitySelector', () => ({
    isDuplicateCandidate: jest.fn(),
}))

import {
    shouldIncludeCandidate,
    upsertScoredCandidate,
    getRejectionCounts,
} from './candidateContracts'
import type { ScoredTrack } from './diversitySelector'
import { isDuplicateCandidate } from './diversitySelector'

function createTrack(overrides: Partial<Track> = {}): Track {
    return {
        title: 'Test Song',
        author: 'Test Artist',
        durationMS: 3 * 60 * 1000,
        url: 'https://example.com/track',
        id: 'testid',
        source: 'spotify',
        ...overrides,
    } as Track
}

describe('candidateContracts', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(isDuplicateCandidate as jest.Mock).mockReturnValue(false)
    })

    it('upsertScoredCandidate with hard-reject score increments hardReject count', () => {
        const candidates = new Map<string, ScoredTrack>()
        const track = createTrack()

        upsertScoredCandidate(candidates, track, {
            score: -Infinity,
            source: 'spotify-rec',
            signals: [],
        })

        expect(candidates.size).toBe(0)
        const counts = getRejectionCounts(candidates)
        expect(counts.hardReject).toBe(1)
        expect(counts.duplicate).toBe(0)
    })

    it('shouldIncludeCandidate with duplicate and candidates map increments duplicate count', () => {
        ;(isDuplicateCandidate as jest.Mock).mockReturnValue(true)
        const candidates = new Map<string, ScoredTrack>()
        const excludedUrls = new Set<string>()
        const excludedKeys = new Set<string>()
        const track = createTrack()

        const result = shouldIncludeCandidate(
            track,
            excludedUrls,
            excludedKeys,
            candidates,
        )

        expect(result).toBe(false)
        const counts = getRejectionCounts(candidates)
        expect(counts.duplicate).toBe(1)
        expect(counts.hardReject).toBe(0)
    })

    it('shouldIncludeCandidate returns true for non-duplicate tracks', () => {
        ;(isDuplicateCandidate as jest.Mock).mockReturnValue(false)
        const candidates = new Map<string, ScoredTrack>()
        const excludedUrls = new Set<string>()
        const excludedKeys = new Set<string>()
        const track = createTrack()

        const result = shouldIncludeCandidate(
            track,
            excludedUrls,
            excludedKeys,
            candidates,
        )

        expect(result).toBe(true)
        const counts = getRejectionCounts(candidates)
        expect(counts.duplicate).toBe(0)
        expect(counts.hardReject).toBe(0)
    })

    it('getRejectionCounts initializes on first call', () => {
        const candidates = new Map<string, ScoredTrack>()

        const counts = getRejectionCounts(candidates)

        expect(counts).toEqual({ hardReject: 0, duplicate: 0 })
    })

    it('getRejectionCounts returns same counts on subsequent calls', () => {
        const candidates = new Map<string, ScoredTrack>()
        const track = createTrack()

        upsertScoredCandidate(candidates, track, {
            score: -Infinity,
            source: 'spotify-rec',
            signals: [],
        })

        const counts1 = getRejectionCounts(candidates)
        const counts2 = getRejectionCounts(candidates)

        expect(counts1).toBe(counts2)
        expect(counts1.hardReject).toBe(1)
    })
})
