import { jest } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'
import {
    collectRecommendationCandidates,
    shouldIncludeCandidate,
    upsertScoredCandidate,
    type ScoredTrack,
} from './candidateCollector'
import type { SpotifyAudioFeatures } from '../../../spotify/spotifyApi'
import type { SessionMood } from './sessionMood'
import type { AutoplayContext } from './autoplayContext'

const debugLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    spotifyLinkService: jest.fn(),
    trackHistoryService: jest.fn(),
    guildSettingsService: jest.fn(),
    lastFmLinkService: jest.fn(),
}))

const collectSpotifyRecommendationCandidatesMock = jest.fn()
const searchSeedCandidatesMock = jest.fn()

jest.mock('./spotifyRecommender', () => ({
    collectSpotifyRecommendationCandidates: (...args: unknown[]) =>
        collectSpotifyRecommendationCandidatesMock(...args),
    searchSeedCandidates: (...args: unknown[]) =>
        searchSeedCandidatesMock(...args),
}))

const isDuplicateCandidateMock = jest.fn()

jest.mock('./diversitySelector', () => ({
    isDuplicateCandidate: (...args: unknown[]) =>
        isDuplicateCandidateMock(...args),
}))

const calculateRecommendationScoreMock = jest.fn(() => ({
    score: 0.5,
    signals: [],
}))
const normalizeTrackKeyMock = jest.fn((title?: string, author?: string) =>
    `${author}|${title}`.toLowerCase(),
)

jest.mock('./candidateScorer', () => ({
    calculateRecommendationScore: (...args: unknown[]) =>
        calculateRecommendationScoreMock(...args),
}))

jest.mock('./scoringUtils', () => ({
    normalizeTrackKey: (...args: unknown[]) => normalizeTrackKeyMock(...args),
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

function createGuildQueue(overrides: Partial<GuildQueue> = {}): GuildQueue {
    return {
        guild: { id: 'guildid' },
        tracks: new Map(),
        currentTrack: createTrack(),
        metadata: {},
        ...overrides,
    } as GuildQueue
}

function createAutoplayContext(
    overrides: Partial<AutoplayContext> = {},
): AutoplayContext {
    const queue = createGuildQueue()
    const currentTrack = createTrack()
    return {
        queue,
        excludedUrls: new Set(),
        excludedKeys: new Set(),
        dislikedWeights: new Map(),
        likedWeights: new Map(),
        preferredArtistKeys: new Set(),
        blockedArtistKeys: new Set(),
        currentTrack,
        recentArtists: new Set(),
        autoplayMode: 'similar',
        artistFrequency: new Map(),
        implicitDislikeKeys: new Set(),
        implicitLikeKeys: new Set(),
        sessionMood: null,
        genreContext: {},
        ...overrides,
    }
}

describe('candidateCollector', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('shouldIncludeCandidate', () => {
        it('should return true when track is not in excluded sets', () => {
            isDuplicateCandidateMock.mockReturnValue(false)

            const track = createTrack()
            const excludedUrls = new Set<string>()
            const excludedKeys = new Set<string>()

            const result = shouldIncludeCandidate(
                track,
                excludedUrls,
                excludedKeys,
            )

            expect(result).toBe(true)
        })

        it('should return false when track is a duplicate', () => {
            isDuplicateCandidateMock.mockReturnValue(true)

            const track = createTrack({
                url: 'https://open.spotify.com/track/excluded',
            })
            const excludedUrls = new Set([
                'https://open.spotify.com/track/excluded',
            ])
            const excludedKeys = new Set<string>()

            const result = shouldIncludeCandidate(
                track,
                excludedUrls,
                excludedKeys,
            )

            expect(result).toBe(false)
        })
    })

    describe('upsertScoredCandidate', () => {
        it('should add new candidate to pool', () => {
            const candidates = new Map<string, ScoredTrack>()
            const track = createTrack({ title: 'Song 1', author: 'Artist 1' })
            const recommendation = {
                score: 0.8,
                source: 'spotify-rec' as const,
                signals: [],
            }

            upsertScoredCandidate(candidates, track, recommendation)

            expect(candidates.size).toBe(1)
            const entry = Array.from(candidates.values())[0]
            expect(entry.track).toBe(track)
            expect(entry.score).toBe(0.8)
            expect(entry.basis.source).toBe('spotify-rec')
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
                source: 'spotify-rec',
                signals: [],
            })
            upsertScoredCandidate(candidates, track2, {
                score: 0.8,
                source: 'spotify-rec',
                signals: [],
            })

            expect(candidates.size).toBe(1)
            const entry = Array.from(candidates.values())[0]
            expect(entry.score).toBe(0.8)
            expect(entry.basis.source).toBe('spotify-rec')
        })

        it('should keep higher score when duplicate key inserted', () => {
            const candidates = new Map<string, ScoredTrack>()
            const track = createTrack()

            upsertScoredCandidate(candidates, track, {
                score: 0.9,
                source: 'spotify-rec',
                signals: [],
            })
            upsertScoredCandidate(candidates, track, {
                score: 0.3,
                source: 'spotify-rec',
                signals: [],
            })

            const entry = Array.from(candidates.values())[0]
            expect(entry.score).toBe(0.9)
            expect(entry.basis.source).toBe('spotify-rec')
        })

        it('drops -Infinity recommendations without inserting', () => {
            const candidates = new Map<string, ScoredTrack>()
            const track = createTrack({
                title: 'Hard Reject',
                author: 'Artist',
            })

            upsertScoredCandidate(candidates, track, {
                score: -Infinity,
                source: 'spotify-rec',
                signals: [],
            })

            expect(candidates.size).toBe(0)
        })

        it('drops NaN recommendations defensively', () => {
            const candidates = new Map<string, ScoredTrack>()
            const track = createTrack()

            upsertScoredCandidate(candidates, track, {
                score: NaN,
                source: 'spotify-rec',
                signals: [],
            })

            expect(candidates.size).toBe(0)
        })
    })

    describe('collectRecommendationCandidates', () => {
        beforeEach(() => {
            jest.clearAllMocks()
            isDuplicateCandidateMock.mockReturnValue(false)
            calculateRecommendationScoreMock.mockReturnValue({
                score: 0.5,
                signals: [],
            })
            normalizeTrackKeyMock.mockImplementation(
                (title?: string, author?: string) =>
                    `${author}|${title}`.toLowerCase(),
            )
        })

        it('should collect candidates from Spotify API', async () => {
            collectSpotifyRecommendationCandidatesMock.mockResolvedValue(
                undefined,
            )
            const seedResult = createTrack({
                title: 'Spotify Result',
                author: 'Spotify Artist',
            })
            searchSeedCandidatesMock.mockResolvedValue([seedResult])

            const queue = createGuildQueue()
            const seedTracks = [createTrack()]

            const ctx = createAutoplayContext({
                queue,
                currentTrack: createTrack(),
            })
            const result = await collectRecommendationCandidates(
                ctx,
                seedTracks,
                null,
            )

            expect(result.size).toBe(1)
            expect(
                collectSpotifyRecommendationCandidatesMock,
            ).toHaveBeenCalled()
        })

        it('should collect seed-based search candidates', async () => {
            collectSpotifyRecommendationCandidatesMock.mockResolvedValue(
                undefined,
            )
            const seedResult = createTrack({
                title: 'Seed Result',
                author: 'Seed Artist',
            })
            searchSeedCandidatesMock.mockResolvedValue([seedResult])

            const queue = createGuildQueue()
            const seedTracks = [createTrack()]

            const ctx = createAutoplayContext({
                queue,
                currentTrack: createTrack(),
            })
            const result = await collectRecommendationCandidates(
                ctx,
                seedTracks,
                null,
            )

            expect(result.size).toBeGreaterThan(0)
            expect(searchSeedCandidatesMock).toHaveBeenCalled()
        })

        it('should exclude disliked candidates', async () => {
            collectSpotifyRecommendationCandidatesMock.mockResolvedValue(
                undefined,
            )
            const dislikedTrack = createTrack({
                title: 'Bad Track',
                author: 'Bad Artist',
            })
            searchSeedCandidatesMock.mockResolvedValue([dislikedTrack])

            // Set high dislike weight (> 0.5)
            const dislikedWeights = new Map<string, number>()
            dislikedWeights.set(
                normalizeTrackKeyMock(
                    dislikedTrack.title,
                    dislikedTrack.author,
                ),
                0.8,
            )

            const queue = createGuildQueue()
            const seedTracks = [createTrack()]

            const ctx = createAutoplayContext({
                queue,
                dislikedWeights,
            })
            const result = await collectRecommendationCandidates(
                ctx,
                seedTracks,
                null,
            )

            expect(result.size).toBe(0)
        })

        it('should exclude duplicate candidates', async () => {
            collectSpotifyRecommendationCandidatesMock.mockResolvedValue(
                undefined,
            )
            const duplicateTrack = createTrack({
                title: 'Duplicate',
                author: 'Duplicate Artist',
            })
            searchSeedCandidatesMock.mockResolvedValue([duplicateTrack])
            isDuplicateCandidateMock.mockReturnValue(true)

            const queue = createGuildQueue()
            const seedTracks = [createTrack()]

            const ctx = createAutoplayContext({
                queue,
                currentTrack: createTrack(),
            })
            const result = await collectRecommendationCandidates(
                ctx,
                seedTracks,
                null,
            )

            expect(result.size).toBe(0)
        })

        it('should skip candidates with -Infinity score', async () => {
            collectSpotifyRecommendationCandidatesMock.mockResolvedValue(
                undefined,
            )
            const track = createTrack({
                title: 'Low Score',
                author: 'Low Score Artist',
            })
            searchSeedCandidatesMock.mockResolvedValue([track])

            // Mock score calculation to return -Infinity
            calculateRecommendationScoreMock.mockReturnValue({
                score: -Infinity,
                source: 'spotify-rec',
                signals: [],
            })

            const queue = createGuildQueue()
            const seedTracks = [createTrack()]

            const ctx = createAutoplayContext({
                queue,
                currentTrack: createTrack(),
            })
            const result = await collectRecommendationCandidates(
                ctx,
                seedTracks,
                null,
            )

            expect(result.size).toBe(0)
        })

        it('should merge candidates from multiple seed tracks', async () => {
            collectSpotifyRecommendationCandidatesMock.mockResolvedValue(
                undefined,
            )
            const track1 = createTrack({
                title: 'Track 1',
                author: 'Artist 1',
            })
            const track2 = createTrack({
                title: 'Track 2',
                author: 'Artist 2',
            })

            // Return different results for different seeds
            let seedCount = 0
            searchSeedCandidatesMock.mockImplementation(async (queue, seed) => {
                seedCount++
                return seedCount === 1 ? [track1] : [track2]
            })

            const queue = createGuildQueue()
            const seedTracks = [createTrack(), createTrack()]

            const ctx = createAutoplayContext({
                queue,
                currentTrack: createTrack(),
            })
            const result = await collectRecommendationCandidates(
                ctx,
                seedTracks,
                null,
            )

            expect(result.size).toBe(2)
        })

        it('should log completion with candidate count', async () => {
            collectSpotifyRecommendationCandidatesMock.mockResolvedValue(
                undefined,
            )
            searchSeedCandidatesMock.mockResolvedValue([
                createTrack({
                    title: 'Logged Track',
                    author: 'Logged Artist',
                }),
            ])

            const queue = createGuildQueue()
            const seedTracks = [createTrack()]

            const ctx = createAutoplayContext({ queue })
            await collectRecommendationCandidates(ctx, seedTracks, null)

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Recommendation candidates collected',
                    data: expect.objectContaining({
                        candidateCount: expect.any(Number),
                    }),
                }),
            )
        })

        it('blocks sertanejo candidates when blockSertanejo=true and tags match', async () => {
            collectSpotifyRecommendationCandidatesMock.mockResolvedValue(
                undefined,
            )
            const serTanejoTrack = createTrack({
                title: 'Saudade do Nordeste',
                author: 'Jorge e Mateus',
            })
            searchSeedCandidatesMock.mockResolvedValue([serTanejoTrack])

            const getArtistTags = jest.fn().mockResolvedValue(['sertanejo'])

            const ctx = createAutoplayContext({
                genreContext: { getArtistTags },
            })
            const result = await collectRecommendationCandidates(
                ctx,
                [createTrack()],
                null,
                0,
                null,
                true, // blockSertanejo
            )

            expect(result.size).toBe(0)
        })

        it('allows sertanejo candidates when blockSertanejo=false', async () => {
            collectSpotifyRecommendationCandidatesMock.mockResolvedValue(
                undefined,
            )
            const serTanejoTrack = createTrack({
                title: 'Saudade do Nordeste',
                author: 'Jorge e Mateus',
            })
            searchSeedCandidatesMock.mockResolvedValue([serTanejoTrack])

            const getArtistTags = jest.fn().mockResolvedValue(['sertanejo'])

            const ctx = createAutoplayContext({
                genreContext: { getArtistTags },
            })
            const result = await collectRecommendationCandidates(
                ctx,
                [createTrack()],
                null,
                0,
                null,
                false, // blockSertanejo
            )

            expect(result.size).toBeGreaterThan(0)
        })

        it('does not block sertanejo when tags are empty (fail-open when Last.fm unavailable)', async () => {
            collectSpotifyRecommendationCandidatesMock.mockResolvedValue(
                undefined,
            )
            const serTanejoTrack = createTrack({
                title: 'Saudade do Nordeste',
                author: 'Jorge e Mateus',
            })
            searchSeedCandidatesMock.mockResolvedValue([serTanejoTrack])

            const getArtistTags = jest.fn().mockResolvedValue([]) // no tags returned

            const ctx = createAutoplayContext({
                genreContext: { getArtistTags },
            })
            const result = await collectRecommendationCandidates(
                ctx,
                [createTrack()],
                null,
                0,
                null,
                true, // blockSertanejo is true but tags are empty — must not block
            )

            expect(result.size).toBeGreaterThan(0)
        })

        it('falls back to empty tags when getArtistTags rejects', async () => {
            collectSpotifyRecommendationCandidatesMock.mockResolvedValue(
                undefined,
            )
            const track = createTrack({
                title: 'Some Song',
                author: 'Some Artist',
            })
            searchSeedCandidatesMock.mockResolvedValue([track])

            const getArtistTags = jest
                .fn()
                .mockRejectedValue(new Error('Last.fm down'))

            const ctx = createAutoplayContext({
                genreContext: { getArtistTags },
            })
            const result = await collectRecommendationCandidates(
                ctx,
                [createTrack()],
                null,
                0,
                null,
                true,
            )

            // fail-open: track should not be blocked when tag fetch errors
            expect(result.size).toBeGreaterThan(0)
        })
    })
})
