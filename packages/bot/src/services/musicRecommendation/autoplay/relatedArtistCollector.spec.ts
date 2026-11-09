import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'
import type { AutoplayContext } from './autoplayContext'

const getArtistTopTracksMock = jest.fn()
const getSimilarArtistsMock = jest.fn()
const calculateRecommendationScoreMock = jest.fn()
const shouldIncludeCandidateMock = jest.fn()
const upsertScoredCandidateMock = jest.fn()
const searchLastFmQueryMock = jest.fn()

const warnLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

jest.mock('../../../lastfm', () => ({
    getArtistTopTracks: (...args: unknown[]) => getArtistTopTracksMock(...args),
    getSimilarArtists: (...args: unknown[]) => getSimilarArtistsMock(...args),
}))

jest.mock('./artistTagCache', () => ({
    createArtistTagFetcher: () => async () => [],
}))

jest.mock('./candidateScorer', () => ({
    calculateRecommendationScore: (...args: unknown[]) =>
        calculateRecommendationScoreMock(...args),
}))

jest.mock('./candidateCollector', () => ({
    shouldIncludeCandidate: (...args: unknown[]) =>
        shouldIncludeCandidateMock(...args),
    upsertScoredCandidate: (...args: unknown[]) =>
        upsertScoredCandidateMock(...args),
}))

jest.mock('../../../utils/music/searchQueryCleaner', () => ({
    ...jest.requireActual<object>('../../../utils/music/searchQueryCleaner'),
    cleanSearchQuery: (title: string, artist: string) => `${title} | ${artist}`,
}))

jest.mock('./lastFmSeeder', () => ({
    searchLastFmQuery: (...args: unknown[]) => searchLastFmQueryMock(...args),
}))

import {
    collectRelatedArtistCandidates,
    __resetRelatedArtistCacheForTests,
} from './relatedArtistCollector'
import { normalizeTrackKey } from './scoringUtils'

function createTrack(title: string, author: string): Track {
    return {
        title,
        author,
        url: `https://example.com/${encodeURIComponent(title)}`,
        durationMS: 200_000,
        requestedBy: null,
    } as unknown as Track
}

function createContext(
    overrides: Partial<AutoplayContext> = {},
): AutoplayContext {
    return {
        queue: { guild: { id: 'guild-1' } } as unknown as GuildQueue,
        excludedUrls: new Set(),
        excludedKeys: new Set(),
        dislikedWeights: new Map(),
        likedWeights: new Map(),
        preferredArtistKeys: new Set(),
        blockedArtistKeys: new Set(),
        currentTrack: createTrack('Seed Song', 'Seed Artist'),
        recentArtists: new Set(),
        autoplayMode: 'similar',
        artistFrequency: new Map(),
        implicitDislikeKeys: new Set(),
        implicitLikeKeys: new Set(),
        sessionMood: null,
        genreContext: {},
        seedArtistStreak: 1,
        ...overrides,
    }
}

const user = { id: 'user-1' } as never

type Upsert = [unknown, Track, { score: number; source: string }]

function upserts(): { title: string; score: number; source: string }[] {
    return (upsertScoredCandidateMock.mock.calls as Upsert[]).map(
        ([, track, scored]) => ({
            title: track.title,
            score: scored.score,
            source: scored.source,
        }),
    )
}

describe('collectRelatedArtistCandidates (#2961)', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        __resetRelatedArtistCacheForTests()
        shouldIncludeCandidateMock.mockReturnValue(true)
        calculateRecommendationScoreMock.mockReturnValue({
            score: 0.5,
            signals: [],
        })
        // The search finds the song it was asked for.
        searchLastFmQueryMock.mockImplementation(
            async (_queue: unknown, query: unknown) => {
                const [title, author] = String(query).split(' | ')
                return [createTrack(title, author)]
            },
        )
        getArtistTopTracksMock.mockImplementation(async (artist: unknown) => {
            if (artist === 'Seed Artist')
                return ['Hit A', 'Hit B', 'Hit C'].map((title) => ({
                    artist: 'Seed Artist',
                    title,
                }))
            return [{ artist: String(artist), title: `${artist} Hit` }]
        })
        getSimilarArtistsMock.mockResolvedValue([
            { name: 'Close Band', match: 1 },
            { name: 'Far Band', match: 0 },
        ])
    })

    const run = (ctx = createContext()) =>
        collectRelatedArtistCandidates(ctx, user, new Map())

    it('adds seed artist top tracks and related artist tracks as seed-similar', async () => {
        await run()

        expect(upserts()).toEqual([
            { title: 'Hit A', score: 0.75, source: 'seed-similar' },
            { title: 'Hit B', score: 0.75, source: 'seed-similar' },
            { title: 'Close Band Hit', score: 0.75, source: 'seed-similar' },
            { title: 'Far Band Hit', score: 0.375, source: 'seed-similar' },
        ])
    })

    it('scores the picks as seed-derived with the seed artist streak', async () => {
        await run(createContext({ seedArtistStreak: 3 }))

        expect(calculateRecommendationScoreMock).toHaveBeenCalledWith(
            expect.objectContaining({
                seedDerived: true,
                skipNoveltyBoost: true,
                seedArtistStreak: 3,
            }),
        )
    })

    it('does not search for top tracks that were already played', async () => {
        await run(
            createContext({
                excludedKeys: new Set([
                    normalizeTrackKey('Hit A', 'Seed Artist'),
                ]),
            }),
        )

        const searched = searchLastFmQueryMock.mock.calls.map((c) => c[1])
        expect(searched).not.toContain('Hit A | Seed Artist')
        expect(upserts().map((u) => u.title)).toEqual([
            'Hit B',
            'Hit C',
            'Close Band Hit',
            'Far Band Hit',
        ])
    })

    it('adds nothing when Last.fm fails', async () => {
        getArtistTopTracksMock.mockRejectedValue(new Error('down'))
        getSimilarArtistsMock.mockRejectedValue(new Error('down'))

        await expect(run()).resolves.toBeUndefined()
        expect(upsertScoredCandidateMock).not.toHaveBeenCalled()
    })

    it('never throws when a Last.fm call throws synchronously', async () => {
        getArtistTopTracksMock.mockImplementation(() => {
            throw new TypeError('not a function')
        })
        getSimilarArtistsMock.mockImplementation(() => {
            throw new TypeError('not a function')
        })

        await expect(run()).resolves.toBeUndefined()
        expect(upsertScoredCandidateMock).not.toHaveBeenCalled()
    })

    it('never throws when the track search fails', async () => {
        searchLastFmQueryMock.mockRejectedValue(new Error('search down'))

        await expect(run()).resolves.toBeUndefined()
        expect(upsertScoredCandidateMock).not.toHaveBeenCalled()
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Autoplay: related-artist collector failed',
            }),
        )
    })

    it('reuses the Last.fm lookups for the same seed artist', async () => {
        await run()
        await run()

        expect(getSimilarArtistsMock).toHaveBeenCalledTimes(1)
        expect(
            getArtistTopTracksMock.mock.calls.filter(
                (c) => c[0] === 'Seed Artist',
            ),
        ).toHaveLength(1)
    })
    it.each(['Seed Artist feat. Guest', 'Seed Artist - Topic'])(
        'looks up the primary artist of %j',
        async (author) => {
            await run(
                createContext({
                    currentTrack: createTrack('Seed Song', author),
                }),
            )

            expect(getSimilarArtistsMock).toHaveBeenCalledWith(
                'Seed Artist',
                expect.any(Number),
            )
        },
    )

    it('skips a hit by another artist and takes the next one', async () => {
        searchLastFmQueryMock.mockImplementation(
            async (_queue: unknown, query: unknown) => {
                const [title, author] = String(query).split(' | ')
                return [
                    createTrack(title, 'Cover Band'),
                    createTrack(title, author),
                ]
            },
        )

        await run()

        const added = (upsertScoredCandidateMock.mock.calls as Upsert[]).map(
            ([, track]) => track.author,
        )
        expect(added).not.toContain('Cover Band')
        expect(added).toContain('Seed Artist')
    })

    it('skips a disliked hit', async () => {
        await run(
            createContext({
                dislikedWeights: new Map([
                    [normalizeTrackKey('Hit A', 'Seed Artist'), 1],
                ]),
            }),
        )

        expect(upserts().map((u) => u.title)).not.toContain('Hit A')
    })

    it('tries the next hit when the first one is vetoed', async () => {
        searchLastFmQueryMock.mockImplementation(
            async (_queue: unknown, query: unknown) => {
                const [title, author] = String(query).split(' | ')
                return [
                    createTrack(`${title} (Vetoed)`, author),
                    createTrack(title, author),
                ]
            },
        )
        calculateRecommendationScoreMock.mockImplementation((input: unknown) =>
            (input as { candidate: Track }).candidate.title.endsWith('(Vetoed)')
                ? { score: -Infinity, signals: [], veto: 'genre' }
                : { score: 0.5, signals: [] },
        )

        await run()

        expect(upserts().map((u) => u.title)).toContain('Hit A')
    })

    it('still adds the other picks when one lookup times out', async () => {
        jest.useFakeTimers()
        try {
            getArtistTopTracksMock.mockImplementation((artist: unknown) => {
                if (artist === 'Close Band') return new Promise(() => {})
                if (artist === 'Seed Artist')
                    return Promise.resolve([
                        { artist: 'Seed Artist', title: 'Hit A' },
                    ])
                return Promise.resolve([
                    { artist: String(artist), title: `${artist} Hit` },
                ])
            })

            const done = run()
            await jest.advanceTimersByTimeAsync(2000)
            await done

            expect(upserts().map((u) => u.title)).toEqual([
                'Hit A',
                'Far Band Hit',
            ])
        } finally {
            jest.useRealTimers()
        }
    })

    it('refetches the Last.fm lookups after the cache expires', async () => {
        const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
        try {
            await run()
            now.mockReturnValue(1_000_000 + 60 * 60 * 1000 + 1)
            await run()

            expect(getSimilarArtistsMock).toHaveBeenCalledTimes(2)
        } finally {
            now.mockRestore()
        }
    })
})
