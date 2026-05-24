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
        describe('hard rejections', () => {
            it('rejects blocked artists, long tracks, and filtered content', () => {
                // Blocked artist
                const blocked = calculateRecommendationScore({
                    candidate: createTrack({ author: 'Blocked Artist' }),
                    currentTrack: createTrack(),
                    blockedArtistKeys: new Set(['blockedartist']),
                    recentArtists: new Set(),
                    likedWeights: new Map(),
                    preferredArtistKeys: new Set(),
                    dislikedWeights: new Map(),
                })
                expect(blocked.score).toBe(-Infinity)
                expect(blocked.signals).toEqual([])

                // Long track (>15 min)
                const long = calculateRecommendationScore({
                    candidate: createTrack({ durationMS: 16 * 60 * 1000 }),
                    currentTrack: createTrack(),
                    recentArtists: new Set(),
                    likedWeights: new Map(),
                    preferredArtistKeys: new Set(),
                })
                expect(long.score).toBe(-Infinity)

                // Ambient content
                const ambient = calculateRecommendationScore({
                    candidate: createTrack({
                        title: 'Relaxing Rain Sounds for Sleep',
                    }),
                    currentTrack: createTrack(),
                    recentArtists: new Set(),
                    likedWeights: new Map(),
                    preferredArtistKeys: new Set(),
                })
                expect(ambient.score).toBe(-Infinity)

                // EDM mix
                const edm = calculateRecommendationScore({
                    candidate: createTrack({ title: 'DJ Set 3 Hour Mix' }),
                    currentTrack: createTrack(),
                    recentArtists: new Set(),
                    likedWeights: new Map(),
                    preferredArtistKeys: new Set(),
                })
                expect(edm.score).toBe(-Infinity)
            })

            it('rejects Spanish candidates without session history', () => {
                const mood: SessionMood = {
                    dominantLocale: null,
                    deepDiveArtist: null,
                    preferLong: false,
                    preferShort: false,
                    restless: false,
                }
                const result = calculateRecommendationScore({
                    candidate: createTrack({ title: 'Reggaeton Song' }),
                    currentTrack: createTrack(),
                    recentArtists: new Set(),
                    likedWeights: new Map(),
                    preferredArtistKeys: new Set(),
                    sessionMood: mood,
                })
                expect(result.score).toBe(-Infinity)
                expect(result.signals).toEqual([])
            })

            it('rejects Spanish gospel via Last.fm artist tags', () => {
                const result = calculateRecommendationScore({
                    candidate: createTrack({
                        title: 'Derrama Tu Gloria',
                        author: 'ALISON',
                    }),
                    currentTrack: createTrack({
                        title: 'Só Rock 3',
                        author: 'Major RD',
                    }),
                    recentArtists: new Set(),
                    likedWeights: new Map(),
                    preferredArtistKeys: new Set(),
                    blockedArtistKeys: new Set(),
                    autoplayMode: 'similar',
                    artistFrequency: new Map(),
                    implicitDislikeKeys: new Set(),
                    implicitLikeKeys: new Set(),
                    dislikedWeights: new Map(),
                    sessionMood: {
                        dominantLocale: null,
                        deepDiveArtist: null,
                        preferLong: false,
                        preferShort: false,
                        restless: false,
                    } as SessionMood,
                    skipNoveltyBoost: false,
                    genreContext: {
                        candidateTags: [
                            'latin christian',
                            'spanish',
                            'worship',
                        ],
                    },
                })
                expect(result.score).toBe(-Infinity)
                expect(result.signals).toEqual([])
            })

            it('hard-rejects genre family drift when session has dominant family', () => {
                const result = calculateRecommendationScore({
                    candidate: createTrack({
                        title: 'Master of Puppets',
                        author: 'Metallica',
                    }),
                    currentTrack: createTrack({
                        title: 'Liderança',
                        author: 'Major RD',
                    }),
                    recentArtists: new Set(),
                    likedWeights: new Map(),
                    preferredArtistKeys: new Set(),
                    blockedArtistKeys: new Set(),
                    autoplayMode: 'similar',
                    artistFrequency: new Map(),
                    implicitDislikeKeys: new Set(),
                    implicitLikeKeys: new Set(),
                    dislikedWeights: new Map(),
                    skipNoveltyBoost: false,
                    genreContext: {
                        candidateTags: ['thrash metal', 'metal', 'rock'],
                        currentTrackTags: ['rap', 'hip hop', 'trap'],
                        sessionGenreFamilies: new Set(['rap_hiphop']),
                    },
                })
                expect(result.score).toBe(-Infinity)
                expect(result.signals).toEqual([])
            })
        })

        describe('boosts and scoring', () => {
            it('boosts preferred and frequent artists', () => {
                const preferredResult = calculateRecommendationScore({
                    candidate: createTrack({ author: 'Favorite Artist' }),
                    currentTrack: createTrack(),
                    recentArtists: new Set(),
                    likedWeights: new Map(),
                    preferredArtistKeys: new Set(['favoriteartist']),
                })
                expect(preferredResult.score).toBeGreaterThan(1)
                expect(preferredResult.signals).toContain('preferred artist')

                const frequentResult = calculateRecommendationScore({
                    candidate: createTrack({ author: 'Favorite Band' }),
                    currentTrack: createTrack(),
                    recentArtists: new Set(),
                    likedWeights: new Map(),
                    preferredArtistKeys: new Set(),
                    blockedArtistKeys: new Set(),
                    autoplayMode: 'similar',
                    artistFrequency: new Map([['favoriteband', 5]]),
                })
                expect(frequentResult.score).toBeGreaterThan(1)
                expect(frequentResult.signals).toContain('favourite artist')
            })

            it('applies dislikes with weight-based thresholds', () => {
                const highWeight = calculateRecommendationScore({
                    candidate: createTrack({
                        title: 'Disliked Song',
                        author: 'Test Artist',
                    }),
                    currentTrack: createTrack(),
                    recentArtists: new Set(),
                    likedWeights: new Map(),
                    preferredArtistKeys: new Set(),
                    blockedArtistKeys: new Set(),
                    autoplayMode: 'similar',
                    artistFrequency: new Map(),
                    implicitDislikeKeys: new Set(),
                    implicitLikeKeys: new Set(),
                    dislikedWeights: new Map([
                        ['dislikedsong::testartist', 0.7],
                    ]),
                })
                expect(highWeight.score).toBe(-Infinity)

                const lowWeight = calculateRecommendationScore({
                    candidate: createTrack({
                        title: 'Xyz Abc',
                        author: 'Different Artist',
                        source: 'youtube',
                    }),
                    currentTrack: createTrack(),
                    recentArtists: new Set(['existing artist']),
                    likedWeights: new Map(),
                    preferredArtistKeys: new Set(),
                    blockedArtistKeys: new Set(),
                    autoplayMode: 'similar',
                    artistFrequency: new Map(),
                    implicitDislikeKeys: new Set(),
                    implicitLikeKeys: new Set(),
                    dislikedWeights: new Map([
                        ['xyzabc::differentartist', 0.3],
                    ]),
                })
                expect(lowWeight.signals).toContain('old dislike')
                expect(lowWeight.score).toBeLessThan(1.3)
            })

            it('applies same-artist novelty penalty', () => {
                const result = calculateRecommendationScore({
                    candidate: createTrack({
                        title: 'Xyz Abc',
                        author: 'Test Artist',
                        source: 'youtube',
                    }),
                    currentTrack: createTrack({ author: 'Test Artist' }),
                    recentArtists: new Set(),
                })
                expect(result.score).toBeLessThan(1)
            })
        })

        describe('Spanish handling', () => {
            it('allows Spanish when session has Spanish history', () => {
                const result = calculateRecommendationScore({
                    candidate: createTrack({ title: 'Reggaeton Song' }),
                    currentTrack: createTrack({
                        title: 'Despacito',
                        author: 'Luis Fonsi',
                    }),
                    recentArtists: new Set(),
                    likedWeights: new Map(),
                    preferredArtistKeys: new Set(),
                    blockedArtistKeys: new Set(),
                    autoplayMode: 'similar',
                    artistFrequency: new Map(),
                    implicitDislikeKeys: new Set(),
                    implicitLikeKeys: new Set(),
                    dislikedWeights: new Map(),
                    sessionMood: {
                        dominantLocale: 'spanish',
                        deepDiveArtist: null,
                        preferLong: false,
                        preferShort: false,
                        restless: false,
                    } as SessionMood,
                })
                expect(result.score).toBeGreaterThan(0)
                expect(result.signals).not.toContain('cross-locale')
            })
        })

        describe('genre family handling', () => {
            it('applies soft penalty when no dominant family yet', () => {
                const result = calculateRecommendationScore({
                    candidate: createTrack({
                        title: 'Master of Puppets',
                        author: 'Metallica',
                    }),
                    currentTrack: createTrack({ author: 'Some Artist' }),
                    recentArtists: new Set(),
                    likedWeights: new Map(),
                    preferredArtistKeys: new Set(),
                    blockedArtistKeys: new Set(),
                    autoplayMode: 'similar',
                    artistFrequency: new Map(),
                    implicitDislikeKeys: new Set(),
                    implicitLikeKeys: new Set(),
                    dislikedWeights: new Map(),
                    sessionMood: null,
                    skipNoveltyBoost: false,
                    genreContext: {
                        candidateTags: ['thrash metal', 'metal', 'rock'],
                        currentTrackTags: ['rap', 'hip hop'],
                        sessionGenreFamilies: new Set(),
                    },
                })
                expect(result.score).not.toBe(-Infinity)
                expect(result.signals).toContain('genre family drift')
            })

            it('keeps candidates within dominant session genre family', () => {
                const result = calculateRecommendationScore({
                    candidate: createTrack({
                        title: 'Outro Funk',
                        author: 'MC Cabelinho',
                    }),
                    currentTrack: createTrack({
                        title: 'Liderança',
                        author: 'Major RD',
                    }),
                    recentArtists: new Set(),
                    likedWeights: new Map(),
                    preferredArtistKeys: new Set(),
                    blockedArtistKeys: new Set(),
                    autoplayMode: 'similar',
                    artistFrequency: new Map(),
                    implicitDislikeKeys: new Set(),
                    implicitLikeKeys: new Set(),
                    dislikedWeights: new Map(),
                    sessionMood: null,
                    skipNoveltyBoost: false,
                    genreContext: {
                        candidateTags: ['rap', 'trap', 'funk carioca'],
                        currentTrackTags: ['rap', 'hip hop', 'trap'],
                        sessionGenreFamilies: new Set(['rap_hiphop']),
                    },
                })
                expect(result.score).toBeGreaterThan(0)
                expect(result.signals).not.toContain('cross-genre')
                expect(result.signals).not.toContain('genre family drift')
            })
        })

        describe('mood-driven boosts', () => {
            it('boosts deep dive artist tracks', () => {
                const result = calculateRecommendationScore({
                    candidate: createTrack({ author: 'Deep Dive Artist' }),
                    currentTrack: createTrack({ author: 'Deep Dive Artist' }),
                    recentArtists: new Set(),
                    likedWeights: new Map(),
                    preferredArtistKeys: new Set(),
                    blockedArtistKeys: new Set(),
                    autoplayMode: 'similar',
                    artistFrequency: new Map(),
                    implicitDislikeKeys: new Set(),
                    implicitLikeKeys: new Set(),
                    dislikedWeights: new Map(),
                    sessionMood: {
                        dominantLocale: null,
                        deepDiveArtist: 'deep dive artist',
                        preferLong: false,
                        preferShort: false,
                        restless: false,
                    } as SessionMood,
                })
                expect(result.signals).toContain('deep dive')
            })

            it('boosts long and short track preferences', () => {
                const longResult = calculateRecommendationScore({
                    candidate: createTrack({ durationMS: 7 * 60 * 1000 }),
                    currentTrack: createTrack({ durationMS: 5 * 60 * 1000 }),
                    recentArtists: new Set(),
                    likedWeights: new Map(),
                    preferredArtistKeys: new Set(),
                    blockedArtistKeys: new Set(),
                    autoplayMode: 'similar',
                    artistFrequency: new Map(),
                    implicitDislikeKeys: new Set(),
                    implicitLikeKeys: new Set(),
                    dislikedWeights: new Map(),
                    sessionMood: {
                        dominantLocale: null,
                        deepDiveArtist: null,
                        preferLong: true,
                        preferShort: false,
                        restless: false,
                    } as SessionMood,
                })
                expect(longResult.signals).toContain('long track match')

                const shortResult = calculateRecommendationScore({
                    candidate: createTrack({ durationMS: 2 * 60 * 1000 }),
                    currentTrack: createTrack(),
                    recentArtists: new Set(),
                    likedWeights: new Map(),
                    preferredArtistKeys: new Set(),
                    blockedArtistKeys: new Set(),
                    autoplayMode: 'similar',
                    artistFrequency: new Map(),
                    implicitDislikeKeys: new Set(),
                    implicitLikeKeys: new Set(),
                    dislikedWeights: new Map(),
                    sessionMood: {
                        dominantLocale: null,
                        deepDiveArtist: null,
                        preferLong: false,
                        preferShort: true,
                        restless: false,
                    } as SessionMood,
                })
                expect(shortResult.signals).toContain('quick hit match')
            })

            it('boosts restless discovery with novel artists', () => {
                const result = calculateRecommendationScore({
                    candidate: createTrack({ author: 'Novel Artist' }),
                    currentTrack: createTrack(),
                    recentArtists: new Set(['other artist']),
                    likedWeights: new Map(),
                    preferredArtistKeys: new Set(),
                    blockedArtistKeys: new Set(),
                    autoplayMode: 'similar',
                    artistFrequency: new Map(),
                    implicitDislikeKeys: new Set(),
                    implicitLikeKeys: new Set(),
                    dislikedWeights: new Map(),
                    sessionMood: {
                        dominantLocale: null,
                        deepDiveArtist: null,
                        preferLong: false,
                        preferShort: false,
                        restless: true,
                    } as SessionMood,
                })
                expect(result.signals).toContain('restless discovery')
            })
        })

        it('relaxes genre penalty during skip storms', () => {
            const recentArtists = new Set(['other'])
            const genreContext = {
                candidateTags: ['pop'],
                currentTrackTags: ['hip hop', 'rap'],
            }

            const withSkips = calculateRecommendationScore({
                candidate: createTrack({
                    author: 'Pop Artist',
                    source: 'youtube',
                }),
                currentTrack: createTrack({ author: 'Rap Artist' }),
                recentArtists: recentArtists,
                likedWeights: new Map(),
                preferredArtistKeys: new Set(),
                blockedArtistKeys: new Set(),
                autoplayMode: 'similar',
                artistFrequency: new Map(),
                implicitDislikeKeys: new Set(),
                implicitLikeKeys: new Set(),
                dislikedWeights: new Map(),
                sessionMood: {
                    dominantLocale: null,
                    deepDiveArtist: null,
                    preferLong: false,
                    preferShort: false,
                    restless: false,
                    recentSkipCount: 3,
                } as SessionMood,
                skipNoveltyBoost: false,
                genreContext,
            })

            const withoutSkips = calculateRecommendationScore({
                candidate: createTrack({
                    author: 'Pop Artist',
                    source: 'youtube',
                }),
                currentTrack: createTrack({ author: 'Rap Artist' }),
                recentArtists: recentArtists,
                likedWeights: new Map(),
                preferredArtistKeys: new Set(),
                blockedArtistKeys: new Set(),
                autoplayMode: 'similar',
                artistFrequency: new Map(),
                implicitDislikeKeys: new Set(),
                implicitLikeKeys: new Set(),
                dislikedWeights: new Map(),
                sessionMood: null,
                skipNoveltyBoost: false,
                genreContext,
            })

            expect(withSkips.score).toBeGreaterThan(withoutSkips.score)
        })

        it('boosts in popular mode based on liked weight', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({
                    title: 'Hit Song',
                    author: 'Test Artist',
                    source: 'youtube',
                }),
                currentTrack: createTrack(),
                recentArtists: new Set(['other']),
                likedWeights: new Map([['hitsong::testartist', 0.8]]),
                preferredArtistKeys: new Set(),
                blockedArtistKeys: new Set(),
                autoplayMode: 'popular',
            })
            expect(result.score).toBeGreaterThan(1)
        })
    })

    describe('calculateGenreFamilyPenalty', () => {
        it('handles missing genres and family matches', () => {
            expect(calculateGenreFamilyPenalty(['rock'], [])).toBe(-0.1)
            expect(calculateGenreFamilyPenalty([], ['rock'])).toBe(-0.1)
            expect(
                calculateGenreFamilyPenalty(
                    ['rock music'],
                    ['alternative rock'],
                ),
            ).toBe(0)
        })

        it('applies penalties for genre family mismatches', () => {
            expect(
                calculateGenreFamilyPenalty(['hip hop'], ['pop music']),
            ).toBe(-0.6)
            expect(
                calculateGenreFamilyPenalty(['pop music'], ['ambient lofi']),
            ).toBe(-0.3)
        })
    })

    describe('getGenreFamilies', () => {
        it('identifies genre families from tags', () => {
            const rapHipHop = getGenreFamilies(['hip hop', 'rap music'])
            expect(rapHipHop.has('rap_hiphop')).toBe(true)

            const rockMetal = getGenreFamilies(['metal', 'punk rock'])
            expect(rockMetal.has('rock_metal')).toBe(true)

            const multiple = getGenreFamilies(['rock', 'jazz', 'reggaeton'])
            expect(multiple.size).toBeGreaterThanOrEqual(3)
        })

        it('returns empty set for unknown genres', () => {
            const families = getGenreFamilies(['unknown', 'fictional'])
            expect(families.size).toBe(0)
        })
    })

    describe('enrichWithAudioFeatures', () => {
        describe('error handling', () => {
            it('returns tracks unchanged on token or API errors', async () => {
                const tracks = [{ track: createTrack(), score: 1, signals: [] }]

                spotifyLinkServiceMock.mockResolvedValue(null)
                const noToken = await enrichWithAudioFeatures(
                    tracks,
                    'user-123',
                    null,
                )
                expect(noToken).toEqual(tracks)

                spotifyLinkServiceMock.mockRejectedValue(
                    new Error('Token error'),
                )
                const tokenError = await enrichWithAudioFeatures(
                    tracks,
                    'user-123',
                    null,
                )
                expect(tokenError).toEqual(tracks)

                spotifyLinkServiceMock.mockResolvedValue('valid-token')
                getBatchAudioFeaturesMock.mockRejectedValue(
                    new Error('API error'),
                )
                const apiError = await enrichWithAudioFeatures(
                    tracks,
                    'user-123',
                    { energy: 0.5, valence: 0.5 } as SpotifyAudioFeatures,
                )
                expect(apiError).toEqual(tracks)
            })

            it('returns tracks unchanged when no Spotify tracks found', async () => {
                const youtubeTrack = [
                    {
                        track: createTrack({
                            url: 'https://youtube.com/watch?v=123',
                        }),
                        score: 1,
                        signals: [],
                    },
                ]
                spotifyLinkServiceMock.mockResolvedValue('valid-token')

                const result = await enrichWithAudioFeatures(
                    youtubeTrack,
                    'user-123',
                    { energy: 0.5, valence: 0.5 } as SpotifyAudioFeatures,
                )

                expect(result).toEqual(youtubeTrack)
            })
        })

        describe('audio feature scoring', () => {
            it('boosts for close energy/valence match', async () => {
                const tracks = [
                    {
                        track: createTrack(),
                        score: 1,
                        signals: [],
                    },
                ]
                spotifyLinkServiceMock.mockResolvedValue('valid-token')
                getBatchAudioFeaturesMock.mockResolvedValue(
                    new Map([
                        [
                            'testid',
                            {
                                energy: 0.52,
                                valence: 0.52,
                            } as SpotifyAudioFeatures,
                        ],
                    ]),
                )

                const result = await enrichWithAudioFeatures(
                    tracks,
                    'user-123',
                    {
                        energy: 0.5,
                        valence: 0.5,
                    } as SpotifyAudioFeatures,
                )

                expect(result[0].score).toBeGreaterThan(1)
            })

            it('partially boosts for moderate energy/valence delta', async () => {
                const tracks = [
                    {
                        track: createTrack(),
                        score: 1,
                        signals: [],
                    },
                ]
                spotifyLinkServiceMock.mockResolvedValue('valid-token')
                getBatchAudioFeaturesMock.mockResolvedValue(
                    new Map([
                        [
                            'testid',
                            {
                                energy: 0.65,
                                valence: 0.75,
                            } as SpotifyAudioFeatures,
                        ],
                    ]),
                )

                const result = await enrichWithAudioFeatures(
                    tracks,
                    'user-123',
                    {
                        energy: 0.5,
                        valence: 0.5,
                    } as SpotifyAudioFeatures,
                )

                expect(result[0].score).toBeGreaterThan(1)
            })

            it('penalizes high energy/valence delta', async () => {
                const tracks = [
                    {
                        track: createTrack(),
                        score: 1,
                        signals: [],
                    },
                ]
                spotifyLinkServiceMock.mockResolvedValue('valid-token')
                getBatchAudioFeaturesMock.mockResolvedValue(
                    new Map([
                        [
                            'testid',
                            {
                                energy: 0.95,
                                valence: 0.95,
                            } as SpotifyAudioFeatures,
                        ],
                    ]),
                )

                const result = await enrichWithAudioFeatures(
                    tracks,
                    'user-123',
                    {
                        energy: 0.1,
                        valence: 0.1,
                    } as SpotifyAudioFeatures,
                )

                expect(result[0].score).toBeLessThan(1)
            })

            it('penalizes tempo drastic change (delta > 40 BPM)', async () => {
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

                const result = await enrichWithAudioFeatures(
                    tracks,
                    'user-123',
                    {
                        energy: 0.5,
                        valence: 0.5,
                        tempo: 100,
                        acousticness: 0.3,
                    } as SpotifyAudioFeatures,
                )

                expect(result[0].score).toBeLessThan(1)
            })

            it('boosts high acousticness and continuity', async () => {
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

                const result = await enrichWithAudioFeatures(
                    tracks,
                    'user-123',
                    {
                        energy: 0.5,
                        valence: 0.5,
                        tempo: 120,
                        acousticness: 0.5,
                    } as SpotifyAudioFeatures,
                )

                expect(result[0].score).toBeGreaterThan(1)
            })

            it('penalizes extreme acousticness swing', async () => {
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

                const result = await enrichWithAudioFeatures(
                    tracks,
                    'user-123',
                    {
                        energy: 0.1,
                        valence: 0.1,
                        tempo: 120,
                        acousticness: 0.8,
                    } as SpotifyAudioFeatures,
                )

                expect(result[0].score).toBeLessThan(1)
            })

            it('applies continuity bonus when both tracks are acoustic', async () => {
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

                const result = await enrichWithAudioFeatures(
                    tracks,
                    'user-123',
                    {
                        energy: 0.4,
                        valence: 0.4,
                        tempo: 90,
                        acousticness: 0.7,
                    } as SpotifyAudioFeatures,
                )

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

                const result = await enrichWithAudioFeatures(
                    tracks,
                    'user-123',
                    {
                        energy: 0.1,
                        valence: 0.1,
                        tempo: 120,
                        acousticness: 0.1,
                    } as SpotifyAudioFeatures,
                )

                expect(result[0].score).toBeLessThan(1)
            })
        })

        it('sorts results by score descending', async () => {
            const tracks = [
                {
                    track: createTrack({
                        title: 'Low Score',
                        url: 'https://open.spotify.com/track/lowid',
                    }),
                    score: 0.5,
                    signals: [],
                },
                {
                    track: createTrack({
                        title: 'High Score',
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
