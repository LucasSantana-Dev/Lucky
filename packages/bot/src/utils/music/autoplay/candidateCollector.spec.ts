import { jest } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'
import {
    shouldIncludeCandidate,
    upsertScoredCandidate,
    type ScoredTrack,
} from './candidateCollector'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    spotifyLinkService: jest.fn(),
    trackHistoryService: jest.fn(),
    guildSettingsService: jest.fn(),
    lastFmLinkService: jest.fn(),
}))

jest.mock('./spotifyRecommender', () => ({
    collectSpotifyRecommendationCandidates: jest.fn(),
    searchSeedCandidates: jest.fn(),
}))

jest.mock('./diversitySelector', () => ({
    isDuplicateCandidate: jest.fn(),
}))

jest.mock('../queueManipulation', () => ({
    calculateRecommendationScore: jest.fn(() => ({
        score: 0.5,
        reason: 'test',
    })),
    normalizeTrackKey: jest.fn(
        (title?: string, author?: string) =>
            `${author}|${title}`.toLowerCase(),
    ),
}))

function createTrack(overrides: Partial<Track> = {}): Track {
    return {
        title: 'Test Song',
        author: 'Test Artist',
        durationMS: 3 * 60 * 1000,
        url: 'https://open.spotify.com/track/testid',
        id: 'testid',
        source: 'spotify',
        ...overrides,
    } as Track
}

describe('candidateCollector', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('shouldIncludeCandidate', () => {
        it('should return true when track is not in excluded sets', () => {
            const { isDuplicateCandidate } = require('./diversitySelector')
            isDuplicateCandidate.mockReturnValue(false)

            const track = createTrack()
            const excludedUrls = new Set<string>()
            const excludedKeys = new Set<string>()

            const result = shouldIncludeCandidate(track, excludedUrls, excludedKeys)

            expect(result).toBe(true)
        })

        it('should return false when track is a duplicate', () => {
            const { isDuplicateCandidate } = require('./diversitySelector')
            isDuplicateCandidate.mockReturnValue(true)

            const track = createTrack({
                url: 'https://open.spotify.com/track/excluded',
            })
            const excludedUrls = new Set([
                'https://open.spotify.com/track/excluded',
            ])
            const excludedKeys = new Set<string>()

            const result = shouldIncludeCandidate(track, excludedUrls, excludedKeys)

            expect(result).toBe(false)
        })
    })

    describe('upsertScoredCandidate', () => {
        it('should add new candidate to pool', () => {
            const candidates = new Map<string, ScoredTrack>()
            const track = createTrack({ title: 'Song 1', author: 'Artist 1' })
            const recommendation = { score: 0.8, reason: 'test' }

            upsertScoredCandidate(candidates, track, recommendation)

            expect(candidates.size).toBe(1)
            const entry = Array.from(candidates.values())[0]
            expect(entry.track).toBe(track)
            expect(entry.score).toBe(0.8)
            expect(entry.reason).toBe('test')
        })

        it('should update candidate if new score is higher', () => {
            const candidates = new Map<string, ScoredTrack>()
            const track1 = createTrack({ title: 'Song 1', author: 'Artist 1' })
            const track2 = createTrack({
                title: 'Song 1',
                author: 'Artist 1',
                url: 'https://different-url',
            })

            upsertScoredCandidate(candidates, track1, {
                score: 0.5,
                reason: 'test1',
            })
            upsertScoredCandidate(candidates, track2, {
                score: 0.8,
                reason: 'test2',
            })

            expect(candidates.size).toBe(1)
            const entry = Array.from(candidates.values())[0]
            expect(entry.score).toBe(0.8)
            expect(entry.reason).toBe('test2')
        })

        it('should keep higher score when duplicate key inserted', () => {
            const candidates = new Map<string, ScoredTrack>()
            const track = createTrack()

            upsertScoredCandidate(candidates, track, {
                score: 0.9,
                reason: 'high',
            })
            upsertScoredCandidate(candidates, track, {
                score: 0.3,
                reason: 'low',
            })

            const entry = Array.from(candidates.values())[0]
            expect(entry.score).toBe(0.9)
            expect(entry.reason).toBe('high')
        })

        it('should use track URL as fallback key when normalized key is empty', () => {
            const candidates = new Map<string, ScoredTrack>()
            const track = createTrack({
                title: '',
                author: '',
                url: 'https://example.com/track',
            })

            upsertScoredCandidate(candidates, track, {
                score: 0.5,
                reason: 'fallback',
            })

            expect(candidates.size).toBe(1)
        })

        it('should use track ID as final fallback', () => {
            const candidates = new Map<string, ScoredTrack>()
            const track = createTrack({
                title: '',
                author: '',
                id: 'uniqueid',
                url: '',
            })

            upsertScoredCandidate(candidates, track, {
                score: 0.5,
                reason: 'id-fallback',
            })

            expect(candidates.size).toBe(1)
        })
    })
})
