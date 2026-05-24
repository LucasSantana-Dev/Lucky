import { jest } from '@jest/globals'
import type { Track } from 'discord-player'
import type { SpotifyAudioFeatures } from '../../../spotify/spotifyApi'
import {
    calculateRecommendationScore,
    enrichWithAudioFeatures,
    calculateGenreFamilyPenalty,
    getGenreFamilies,
} from './candidateScorer'
import type { SessionMood } from './sessionMood'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

const spotifyLinkServiceMock = jest.fn()
const getBatchAudioFeaturesMock = jest.fn()
const getArtistGenresMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    spotifyLinkService: {
        getValidAccessToken: (...args: unknown[]) =>
            spotifyLinkServiceMock(...args),
    },
}))

jest.mock('../../../spotify/spotifyApi', () => ({
    getBatchAudioFeatures: (...args: unknown[]) =>
        getBatchAudioFeaturesMock(...args),
    getArtistGenres: (...args: unknown[]) => getArtistGenresMock(...args),
}))

function createTrack(overrides: Partial<Track> = {}): Track {
    return {
        title: 'Test Song',
        author: 'Test Artist',
        durationMS: 3 * 60 * 1000,
        url: 'https://open.spotify.com/track/testid',
        source: 'spotify',
        ...overrides,
    } as Track
}

describe('candidateScorer', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        spotifyLinkServiceMock.mockResolvedValue(null)
        getBatchAudioFeaturesMock.mockResolvedValue(new Map())
        getArtistGenresMock.mockResolvedValue([])
    })

    describe('calculateRecommendationScore', () => {
        it.each([
            [
                'blocked artists',
                { author: 'Blocked Artist' },
                new Set(['blockedartist']),
            ],
            ['tracks > 15 minutes', { durationMS: 16 * 60 * 1000 }, new Set()],
            [
                'ambient/noise content',
                { title: 'Relaxing Rain Sounds for Sleep' },
                new Set(),
            ],
            ['EDM mixes', { title: 'DJ Set 3 Hour Mix' }, new Set()],
        ])('rejects %s with -Infinity score', (_, overrides, blockedKeys) => {
            const result = calculateRecommendationScore({
                candidate: createTrack(overrides),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                blockedArtistKeys: blockedKeys,
            })
            expect(result.score).toBe(-Infinity)
            expect(result.signals).toEqual([])
        })

        it('boosts preferred artists', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({ author: 'Favorite Artist' }),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                likedWeights: new Map(),
                preferredArtistKeys: new Set(['favoriteartist']),
            })
            expect(result.score).toBeGreaterThan(1)
            expect(result.signals).toContain('preferred artist')
        })

        it('boosts frequent artists (5+ plays)', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({ author: 'Favorite Band' }),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                autoplayMode: 'similar',
                artistFrequency: new Map([['favoriteband', 5]]),
            })
            expect(result.score).toBeGreaterThan(1)
            expect(result.signals).toContain('favourite artist')
        })

        it.each([
            ['high-weight dislikes (≥0.5)', 0.7, true],
            ['low-weight dislikes (<0.5)', 0.3, false],
        ])('handles %s', (_, weight, shouldReject) => {
            const result = calculateRecommendationScore({
                candidate: createTrack({
                    title: 'Disliked Song',
                    author: 'Test Artist',
                }),
                currentTrack: createTrack(),
                recentArtists:
                    weight === 0.3 ? new Set(['existing artist']) : new Set(),
                autoplayMode: 'similar',
                dislikedWeights: new Map([
                    ['dislikedsong::testartist', weight],
                ]),
            })
            if (shouldReject) {
                expect(result.score).toBe(-Infinity)
            } else {
                expect(result.signals).toContain('old dislike')
                expect(result.score).toBeLessThan(1.3)
            }
        })

        it('applies same-artist novelty penalty', () => {
            const current = createTrack({ author: 'Test Artist' })
            const candidate = createTrack({
                title: 'Xyz Abc',
                author: 'Test Artist',
                source: 'youtube',
            })

            const result = calculateRecommendationScore({
                candidate: candidate,
                currentTrack: current,
                recentArtists: new Set(),
            })

            expect(result.score).toBeLessThan(1)
        })

        it.each([
            [null, -Infinity],
            ['spanish', 'greater'],
        ])(
            'Spanish candidates with dominantLocale=%s',
            (locale, expectedComparison) => {
                const result = calculateRecommendationScore({
                    candidate: createTrack({ title: 'Reggaeton Song' }),
                    currentTrack: createTrack(),
                    recentArtists: new Set(),
                    autoplayMode: 'similar',
                    sessionMood: {
                        dominantLocale: locale,
                        deepDiveArtist: null,
                        preferLong: false,
                        preferShort: false,
                        restless: false,
                    },
                })
                if (expectedComparison === -Infinity) {
                    expect(result.score).toBe(-Infinity)
                } else {
                    expect(result.score).toBeGreaterThan(0)
                }
            },
        )

        it('rejects Spanish gospel via Last.fm tags even with ambiguous title', () => {
            // Repro for the 2026-04-24 bug: Brazilian rap session pulled in
            // "Derrama Tu Gloria" by ALISON because no signal in the title
            // alone identified it as Spanish. Last.fm artist tags carry the
            // decisive `latin christian` / `spanish` markers.
            const current = createTrack({
                title: 'Só Rock 3',
                author: 'Major RD',
            })
            const candidate = createTrack({
                title: 'Derrama Tu Gloria',
                author: 'ALISON',
            })
            const mood: SessionMood = {
                dominantLocale: null,
                deepDiveArtist: null,
                preferLong: false,
                preferShort: false,
                restless: false,
            }

            const result = calculateRecommendationScore({
                candidate: candidate,
                currentTrack: current,
                recentArtists: new Set(),
                likedWeights: new Map(),
                preferredArtistKeys: new Set(),
                blockedArtistKeys: new Set(),
                autoplayMode: 'similar',
                artistFrequency: new Map(),
                implicitDislikeKeys: new Set(),
                implicitLikeKeys: new Set(),
                dislikedWeights: new Map(),
                sessionMood: mood,
                skipNoveltyBoost: false,
                genreContext: {
                    candidateTags: ['latin christian', 'spanish', 'worship'],
                },
            })

            expect(result.score).toBe(-Infinity)
            expect(result.signals).toEqual([])
        })

        it.each([
            ['within dominant family', 'trap', false],
            ['cross-genre with dominant family', 'metal', true],
        ])('genre matching: %s', (_, candidateGenre, shouldReject) => {
            const result = calculateRecommendationScore({
                candidate: createTrack(),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                autoplayMode: 'similar',
                sessionMood: null,
                genreContext: {
                    candidateTags:
                        candidateGenre === 'trap'
                            ? ['rap', 'trap', 'funk carioca']
                            : ['thrash metal', 'metal', 'rock'],
                    currentTrackTags: ['rap', 'hip hop', 'trap'],
                    sessionGenreFamilies: new Set(['rap_hiphop']),
                },
            })
            if (shouldReject) {
                expect(result.score).toBe(-Infinity)
            } else {
                expect(result.score).toBeGreaterThan(0)
            }
        })

        it('soft-penalizes cross-genre when no dominant family yet', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({
                    title: 'Master of Puppets',
                    author: 'Metallica',
                }),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                autoplayMode: 'similar',
                genreContext: {
                    candidateTags: ['thrash metal', 'metal', 'rock'],
                    currentTrackTags: ['rap', 'hip hop'],
                    sessionGenreFamilies: new Set(),
                },
            })
            expect(result.score).not.toBe(-Infinity)
            expect(result.signals).toContain('genre family drift')
        })

        it('boosts deep dive artist tracks', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({ author: 'Deep Dive Artist' }),
                currentTrack: createTrack({ author: 'Deep Dive Artist' }),
                recentArtists: new Set(),
                sessionMood: {
                    dominantLocale: null,
                    deepDiveArtist: 'deep dive artist',
                    preferLong: false,
                    preferShort: false,
                    restless: false,
                },
            })
            expect(result.signals).toContain('deep dive')
        })

        it.each([
            [
                'long',
                5 * 60 * 1000,
                7 * 60 * 1000,
                { preferLong: true },
                'long track match',
            ],
            [
                'short',
                3 * 60 * 1000,
                2 * 60 * 1000,
                { preferShort: true },
                'quick hit match',
            ],
        ])(
            'boosts %s tracks',
            (_, currentDur, candidateDur, moodOverride, signal) => {
                const result = calculateRecommendationScore({
                    candidate: createTrack({ durationMS: candidateDur }),
                    currentTrack: createTrack({ durationMS: currentDur }),
                    recentArtists: new Set(),
                    autoplayMode: 'similar',
                    sessionMood: {
                        dominantLocale: null,
                        deepDiveArtist: null,
                        preferLong: moodOverride.preferLong ?? false,
                        preferShort: moodOverride.preferShort ?? false,
                        restless: false,
                    },
                })
                expect(result.signals).toContain(signal)
            },
        )

        it('relaxes genre penalty during skip storms', () => {
            const withSkips = calculateRecommendationScore({
                candidate: createTrack({ author: 'Pop Artist' }),
                currentTrack: createTrack({ author: 'Rap Artist' }),
                recentArtists: new Set(['other']),
                autoplayMode: 'similar',
                sessionMood: {
                    dominantLocale: null,
                    deepDiveArtist: null,
                    preferLong: false,
                    preferShort: false,
                    restless: false,
                    recentSkipCount: 3,
                },
                genreContext: {
                    candidateTags: ['pop'],
                    currentTrackTags: ['hip hop', 'rap'],
                },
            })
            const withoutSkips = calculateRecommendationScore({
                candidate: createTrack({ author: 'Pop Artist' }),
                currentTrack: createTrack({ author: 'Rap Artist' }),
                recentArtists: new Set(['other']),
                autoplayMode: 'similar',
                genreContext: {
                    candidateTags: ['pop'],
                    currentTrackTags: ['hip hop', 'rap'],
                },
            })
            expect(withSkips.score).toBeGreaterThan(withoutSkips.score)
        })

        it('boosts popular mode based on liked weight', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({
                    title: 'Hit Song',
                    author: 'Test Artist',
                }),
                currentTrack: createTrack(),
                recentArtists: new Set(['other']),
                autoplayMode: 'popular',
                likedWeights: new Map([['hitsong::testartist', 0.8]]),
            })
            expect(result.score).toBeGreaterThan(1)
        })

        it('boosts restless discovery', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({ author: 'Novel Artist' }),
                currentTrack: createTrack(),
                recentArtists: new Set(['other artist']),
                autoplayMode: 'similar',
                sessionMood: {
                    dominantLocale: null,
                    deepDiveArtist: null,
                    preferLong: false,
                    preferShort: false,
                    restless: true,
                },
            })
            expect(result.signals).toContain('restless discovery')
        })
    })

    describe('calculateGenreFamilyPenalty', () => {
        it.each([
            [['rock'], [], -0.1],
            [['rock music'], ['alternative rock'], 0],
            [['hip hop'], ['pop music'], -0.6],
            [['pop music'], ['ambient lofi'], -0.3],
        ])('returns correct penalty', (current, candidate, expected) => {
            expect(calculateGenreFamilyPenalty(current, candidate)).toBe(
                expected,
            )
        })
    })

    describe('getGenreFamilies', () => {
        it.each([
            [['hip hop', 'rap music'], 'rap_hiphop'],
            [['metal', 'punk rock'], 'rock_metal'],
        ])('identifies family in genres', (genres, family) => {
            expect(getGenreFamilies(genres).has(family)).toBe(true)
        })

        it('identifies multiple families', () => {
            const families = getGenreFamilies(['rock', 'jazz', 'reggaeton'])
            expect(families.size).toBeGreaterThanOrEqual(3)
        })

        it('returns empty set for unknown genres', () => {
            expect(getGenreFamilies(['unknown', 'fictional']).size).toBe(0)
        })
    })

    describe('enrichWithAudioFeatures', () => {
        it.each([[false], [true]])(
            'returns tracks unchanged with mockError=%s',
            async (mockError) => {
                const tracks = [{ track: createTrack(), score: 1, signals: [] }]
                if (mockError) {
                    spotifyLinkServiceMock.mockRejectedValue(
                        new Error('Token error'),
                    )
                }
                const result = await enrichWithAudioFeatures(
                    tracks,
                    'user-123',
                    null,
                )
                expect(result).toEqual(tracks)
            },
        )

        it('returns tracks unchanged when no Spotify tracks found', async () => {
            const tracks = [
                {
                    track: createTrack({
                        url: 'https://youtube.com/watch?v=123',
                    }),
                    score: 1,
                    signals: [],
                },
            ]
            spotifyLinkServiceMock.mockResolvedValue('valid-token')
            const result = await enrichWithAudioFeatures(tracks, 'user-123', {
                energy: 0.5,
                valence: 0.5,
            } as SpotifyAudioFeatures)
            expect(result).toEqual(tracks)
        })

        it.each([
            ['batch', 'batch'],
            ['genres', 'genres'],
        ])('handles %s error gracefully', async (_, errorType) => {
            const tracks = [{ track: createTrack(), score: 1, signals: [] }]
            spotifyLinkServiceMock.mockResolvedValue('valid-token')
            if (errorType === 'batch') {
                getBatchAudioFeaturesMock.mockRejectedValue(
                    new Error('API error'),
                )
            } else {
                getArtistGenresMock.mockRejectedValue(new Error('Genre error'))
            }
            const result = await enrichWithAudioFeatures(
                tracks,
                'user-123',
                { energy: 0.5, valence: 0.5 } as SpotifyAudioFeatures,
                errorType === 'genres' ? 'Current Artist' : undefined,
            )
            expect(result).toEqual(tracks)
        })

        it('boosts score for close energy/valence match', async () => {
            const tracks = [{ track: createTrack(), score: 1, signals: [] }]
            spotifyLinkServiceMock.mockResolvedValue('valid-token')
            getBatchAudioFeaturesMock.mockResolvedValue(
                new Map([
                    [
                        'testid',
                        { energy: 0.52, valence: 0.52 } as SpotifyAudioFeatures,
                    ],
                ]),
            )
            const result = await enrichWithAudioFeatures(tracks, 'user-123', {
                energy: 0.5,
                valence: 0.5,
            } as SpotifyAudioFeatures)
            expect(result[0].score).toBeGreaterThan(1)
        })

        it('boosts score for moderate energy/valence delta', async () => {
            const tracks = [{ track: createTrack(), score: 1, signals: [] }]
            spotifyLinkServiceMock.mockResolvedValue('valid-token')
            getBatchAudioFeaturesMock.mockResolvedValue(
                new Map([
                    [
                        'testid',
                        { energy: 0.65, valence: 0.75 } as SpotifyAudioFeatures,
                    ],
                ]),
            )
            const result = await enrichWithAudioFeatures(tracks, 'user-123', {
                energy: 0.5,
                valence: 0.5,
            } as SpotifyAudioFeatures)
            expect(result[0].score).toBeGreaterThan(1)
        })

        it('penalizes high energy/valence delta', async () => {
            const tracks = [{ track: createTrack(), score: 1, signals: [] }]
            spotifyLinkServiceMock.mockResolvedValue('valid-token')
            getBatchAudioFeaturesMock.mockResolvedValue(
                new Map([
                    [
                        'testid',
                        { energy: 0.95, valence: 0.95 } as SpotifyAudioFeatures,
                    ],
                ]),
            )
            const result = await enrichWithAudioFeatures(tracks, 'user-123', {
                energy: 0.1,
                valence: 0.1,
            } as SpotifyAudioFeatures)
            expect(result[0].score).toBeLessThan(1)
        })

        it('penalizes drastic tempo change (>40 BPM)', async () => {
            const tracks = [{ track: createTrack(), score: 1, signals: [] }]
            spotifyLinkServiceMock.mockResolvedValue('valid-token')
            getBatchAudioFeaturesMock.mockResolvedValue(
                new Map([
                    [
                        'testid',
                        {
                            energy: 0.5,
                            valence: 0.5,
                            tempo: 180,
                            acousticness: 0.3,
                        } as SpotifyAudioFeatures,
                    ],
                ]),
            )
            const result = await enrichWithAudioFeatures(tracks, 'user-123', {
                energy: 0.5,
                valence: 0.5,
                tempo: 100,
                acousticness: 0.3,
            } as SpotifyAudioFeatures)
            expect(result[0].score).toBeLessThan(1)
        })

        it('boosts track with high acousticness value', async () => {
            const tracks = [{ track: createTrack(), score: 1, signals: [] }]
            spotifyLinkServiceMock.mockResolvedValue('valid-token')
            getBatchAudioFeaturesMock.mockResolvedValue(
                new Map([
                    [
                        'testid',
                        {
                            energy: 0.5,
                            valence: 0.5,
                            tempo: 120,
                            acousticness: 0.8,
                        } as SpotifyAudioFeatures,
                    ],
                ]),
            )
            const result = await enrichWithAudioFeatures(tracks, 'user-123', {
                energy: 0.5,
                valence: 0.5,
                tempo: 120,
                acousticness: 0.5,
            } as SpotifyAudioFeatures)
            expect(result[0].score).toBeGreaterThan(1)
        })

        it('penalizes extreme acousticness swing when candidate is not acoustic', async () => {
            const tracks = [{ track: createTrack(), score: 1, signals: [] }]
            spotifyLinkServiceMock.mockResolvedValue('valid-token')
            getBatchAudioFeaturesMock.mockResolvedValue(
                new Map([
                    [
                        'testid',
                        {
                            energy: 0.95,
                            valence: 0.95,
                            tempo: 120,
                            acousticness: 0.05,
                        } as SpotifyAudioFeatures,
                    ],
                ]),
            )
            const result = await enrichWithAudioFeatures(tracks, 'user-123', {
                energy: 0.1,
                valence: 0.1,
                tempo: 120,
                acousticness: 0.8,
            } as SpotifyAudioFeatures)
            expect(result[0].score).toBeLessThan(1)
        })

        it('applies continuity bonus when both are acoustic', async () => {
            const tracks = [{ track: createTrack(), score: 1, signals: [] }]
            spotifyLinkServiceMock.mockResolvedValue('valid-token')
            getBatchAudioFeaturesMock.mockResolvedValue(
                new Map([
                    [
                        'testid',
                        {
                            energy: 0.4,
                            valence: 0.4,
                            tempo: 90,
                            acousticness: 0.75,
                        } as SpotifyAudioFeatures,
                    ],
                ]),
            )
            const result = await enrichWithAudioFeatures(tracks, 'user-123', {
                energy: 0.4,
                valence: 0.4,
                tempo: 90,
                acousticness: 0.7,
            } as SpotifyAudioFeatures)
            expect(result[0].score).toBeGreaterThan(1)
        })

        it('penalizes acoustic candidate in non-acoustic session', async () => {
            const tracks = [{ track: createTrack(), score: 1, signals: [] }]
            spotifyLinkServiceMock.mockResolvedValue('valid-token')
            getBatchAudioFeaturesMock.mockResolvedValue(
                new Map([
                    [
                        'testid',
                        {
                            energy: 0.95,
                            valence: 0.95,
                            tempo: 120,
                            acousticness: 0.8,
                        } as SpotifyAudioFeatures,
                    ],
                ]),
            )
            const result = await enrichWithAudioFeatures(tracks, 'user-123', {
                energy: 0.1,
                valence: 0.1,
                tempo: 120,
                acousticness: 0.1,
            } as SpotifyAudioFeatures)
            expect(result[0].score).toBeLessThan(1)
        })

        it('sorts results by score descending', async () => {
            const tracks = [
                {
                    track: createTrack({
                        title: 'Low',
                        url: 'https://open.spotify.com/track/lowid',
                    }),
                    score: 0.5,
                    signals: [],
                },
                {
                    track: createTrack({
                        title: 'High',
                        url: 'https://open.spotify.com/track/highid',
                    }),
                    score: 2,
                    signals: [],
                },
            ]
            spotifyLinkServiceMock.mockResolvedValue('valid-token')
            getBatchAudioFeaturesMock.mockResolvedValue(new Map())
            const result = await enrichWithAudioFeatures(tracks, 'user-123', {
                energy: 0.5,
                valence: 0.5,
            } as SpotifyAudioFeatures)
            expect(result[0].score).toBeGreaterThan(result[1].score)
        })
    })
})
