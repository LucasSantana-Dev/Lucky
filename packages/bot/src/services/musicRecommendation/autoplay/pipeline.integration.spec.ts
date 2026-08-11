/**
 * Integration tests for the autoplay candidate-collection pipeline.
 *
 * Tests collectRecommendationCandidates end-to-end with real:
 *   - candidateScorer (calculateRecommendationScore, cross-locale veto)
 *   - candidateCollector helpers (shouldIncludeCandidate, upsertScoredCandidate)
 *   - diversitySelector helpers (isDuplicateCandidate)
 *   - languageHeuristics (detectSpanishMarkers)
 *   - searchQueryCleaner, trackNormalization
 *
 * Mocks only external I/O:
 *   - queue.player.search
 *   - Last.fm API
 *   - Spotify API
 *   - @lucky/shared/services
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    spotifyLinkService: {
        getValidAccessToken: jest.fn().mockResolvedValue(null),
    },
    trackHistoryService: {
        addTrackToHistory: jest.fn().mockResolvedValue(true),
    },
    lastFmLinkService: { getLastFmLink: jest.fn().mockResolvedValue(null) },
}))

jest.mock('../../../lastfm', () => ({
    getArtistTopTags: jest.fn().mockResolvedValue([]),
    getSimilarTracks: jest.fn().mockResolvedValue([]),
    getTagTopTracks: jest.fn().mockResolvedValue([]),
    getArtistTopTracks: jest.fn().mockResolvedValue([]),
}))

jest.mock('../../../spotify/spotifyApi', () => ({
    getBatchAudioFeatures: jest.fn().mockResolvedValue(new Map()),
    getArtistGenres: jest.fn().mockResolvedValue([]),
    getArtistPopularity: jest.fn().mockResolvedValue(null),
    searchSpotifyTrack: jest.fn().mockResolvedValue(null),
}))

jest.mock('../../../spotify/spotifyUserSeeds', () => ({
    getUserSpotifySeeds: jest.fn().mockResolvedValue(null),
}))

import {
    collectRecommendationCandidates,
    shouldIncludeCandidate,
    upsertScoredCandidate,
} from './candidateCollector'
import type { SessionMood } from './sessionMood'
import type { AutoplayContext } from './autoplayContext'
import {
    getArtistTopTags,
    getSimilarTracks,
    getTagTopTracks,
    getArtistTopTracks,
} from '../../../lastfm'
import {
    getBatchAudioFeatures,
    getArtistGenres,
    getArtistPopularity,
    searchSpotifyTrack,
} from '../../../spotify/spotifyApi'
import { getUserSpotifySeeds } from '../../../spotify/spotifyUserSeeds'

function makeTrack(overrides: Partial<Track> = {}): Track {
    return {
        title: 'Test Track',
        author: 'Test Artist',
        durationMS: 3 * 60 * 1000,
        url: 'https://open.spotify.com/track/abc123',
        id: 'abc123',
        source: 'spotify',
        thumbnail: null,
        description: '',
        views: 0,
        requestedBy: null,
        raw: {},
        metadata: null,
        ...overrides,
    } as unknown as Track
}

function makeQueue(currentTrack?: Track): GuildQueue {
    const searchMock = jest.fn()
    return {
        guild: { id: 'guild-integration' },
        tracks: { toArray: () => [], size: 0, values: () => [].values() },
        currentTrack: currentTrack ?? makeTrack(),
        history: { tracks: { toArray: () => [] } },
        metadata: {},
        player: { search: searchMock },
    } as unknown as GuildQueue
}

function makeAutoplayContext(
    overrides: Partial<AutoplayContext> = {},
): AutoplayContext {
    const currentTrack = makeTrack()
    return {
        queue: makeQueue(currentTrack),
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

describe('autoplay pipeline integration', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        // resetMocks: true wipes mockResolvedValue — re-set each test
        ;(getArtistTopTags as jest.Mock).mockResolvedValue([])
        ;(getSimilarTracks as jest.Mock).mockResolvedValue([])
        ;(getTagTopTracks as jest.Mock).mockResolvedValue([])
        ;(getArtistTopTracks as jest.Mock).mockResolvedValue([])
        ;(getBatchAudioFeatures as jest.Mock).mockResolvedValue(new Map())
        ;(getArtistGenres as jest.Mock).mockResolvedValue([])
        ;(getArtistPopularity as jest.Mock).mockResolvedValue(null)
        ;(searchSpotifyTrack as jest.Mock).mockResolvedValue(null)
        ;(getUserSpotifySeeds as jest.Mock).mockResolvedValue(null)
    })

    describe('cross-locale veto via real candidateScorer', () => {
        it('drops Spanish gospel tracks when session has no Spanish history', async () => {
            const spanishGospelTracks: Track[] = [
                makeTrack({
                    title: 'Aleluya a Tu Gloria',
                    author: 'Marco Barrientos',
                    url: 'https://open.spotify.com/track/sg1',
                    id: 'sg1',
                }),
                makeTrack({
                    title: 'Dios de lo Imposible',
                    author: 'Elevation Worship Español',
                    url: 'https://open.spotify.com/track/sg2',
                    id: 'sg2',
                }),
                makeTrack({
                    title: 'Bendición',
                    author: 'Redimi2',
                    url: 'https://open.spotify.com/track/sg3',
                    id: 'sg3',
                }),
            ]

            const currentTrack = makeTrack({
                title: 'Creep',
                author: 'Radiohead',
                url: 'https://open.spotify.com/track/rh1',
                id: 'rh1',
            })
            const queue = makeQueue(currentTrack)

            // All search calls return Spanish gospel tracks
            ;(queue.player.search as jest.Mock).mockResolvedValue({
                tracks: spanishGospelTracks,
                playlist: null,
            })

            // dominantLocale: null → English session → veto fires on Spanish content
            const englishSession: SessionMood = {
                deepDiveArtist: null,
                preferLong: false,
                preferShort: false,
                restless: false,
                dominantLocale: null,
            }

            const ctx = makeAutoplayContext({
                queue,
                currentTrack,
                recentArtists: new Set(['radiohead']),
                sessionMood: englishSession,
            })
            const candidates = await collectRecommendationCandidates(
                ctx,
                [currentTrack],
                null,
            )

            // candidateScorer returns -Infinity for Spanish gospel when no Spanish session history.
            // upsertScoredCandidate drops non-finite scores, so the map must stay empty.
            expect(candidates.size).toBe(0)
        })

        it('accepts clearly non-Spanish tracks when search returns them', async () => {
            const englishTracks: Track[] = [
                makeTrack({
                    title: 'Karma Police',
                    author: 'Radiohead',
                    url: 'https://open.spotify.com/track/rh2',
                    id: 'rh2',
                }),
                makeTrack({
                    title: 'No Surprises',
                    author: 'Radiohead',
                    url: 'https://open.spotify.com/track/rh3',
                    id: 'rh3',
                }),
            ]

            const currentTrack = makeTrack({
                title: 'Creep',
                author: 'Radiohead',
                url: 'https://open.spotify.com/track/rh1',
                id: 'rh1',
            })
            const queue = makeQueue(currentTrack)

            ;(queue.player.search as jest.Mock).mockResolvedValue({
                tracks: englishTracks,
                playlist: null,
            })

            const englishSession: SessionMood = {
                deepDiveArtist: null,
                preferLong: false,
                preferShort: false,
                restless: false,
                dominantLocale: null,
            }

            const ctx = makeAutoplayContext({
                queue,
                currentTrack,
                recentArtists: new Set(['radiohead']),
                sessionMood: englishSession,
            })

            const candidates = await collectRecommendationCandidates(
                ctx,
                [currentTrack],
                null,
            )

            // English tracks pass the locale veto — at least one should be accepted
            expect(candidates.size).toBeGreaterThan(0)
        })
    })

    describe('shouldIncludeCandidate (pure unit integration with real diversitySelector)', () => {
        it('includes tracks not in either excluded set', () => {
            const track = makeTrack({
                url: 'https://open.spotify.com/track/new1',
                title: 'New Song',
                author: 'Artist A',
            })
            expect(shouldIncludeCandidate(track, new Set(), new Set())).toBe(
                true,
            )
        })

        it('excludes tracks whose URL is in excludedUrls', () => {
            const url = 'https://open.spotify.com/track/played1'
            const track = makeTrack({ url })
            expect(
                shouldIncludeCandidate(track, new Set([url]), new Set()),
            ).toBe(false)
        })
    })

    describe('upsertScoredCandidate (pure unit integration with real logic)', () => {
        it('drops -Infinity scores — the cross-locale veto gate', () => {
            const candidates = new Map()
            const track = makeTrack({
                title: 'Aleluya',
                author: 'Marco Barrientos',
            })
            upsertScoredCandidate(candidates, track, {
                score: -Infinity,
                source: 'spotify-rec',
                signals: [],
            })
            expect(candidates.size).toBe(0)
        })

        it('drops NaN scores defensively', () => {
            const candidates = new Map()
            const track = makeTrack()
            upsertScoredCandidate(candidates, track, {
                score: NaN,
                source: 'spotify-rec',
                signals: [],
            })
            expect(candidates.size).toBe(0)
        })

        it('keeps higher score when same-key track inserted twice', () => {
            const candidates = new Map()
            const track = makeTrack({
                title: 'Rock Song',
                author: 'Radiohead',
                url: 'https://open.spotify.com/track/rh1',
            })
            upsertScoredCandidate(candidates, track, {
                score: 0.5,
                source: 'spotify-rec',
                signals: [],
            })
            upsertScoredCandidate(candidates, track, {
                score: 0.8,
                source: 'spotify-rec',
                signals: ['preferred artist'],
            })
            expect(candidates.size).toBe(1)
            expect([...candidates.values()][0]!.score).toBe(0.8)
        })

        it('retains first score when second insert is lower', () => {
            const candidates = new Map()
            const track = makeTrack({
                title: 'Rock Song',
                author: 'Radiohead',
                url: 'https://open.spotify.com/track/rh2',
            })
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
            expect([...candidates.values()][0]!.score).toBe(0.9)
        })
    })
})
