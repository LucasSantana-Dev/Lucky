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
                preferredArtistKeys: new Set(['favoriteartist']),
                likedWeights: new Map(),
            })
            expect(result.score).toBeGreaterThan(1)
            expect(result.signals).toContain('preferred artist')
        })

        it('rejects high-weight dislikes', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({
                    title: 'Disliked Song',
                    author: 'Test Artist',
                }),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                autoplayMode: 'similar',
                dislikedWeights: new Map([['dislikedsong::testartist', 0.7]]),
            })
            expect(result.score).toBe(-Infinity)
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

        it('rejects Spanish candidates with no dominant locale', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({ title: 'Reggaeton Song' }),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                autoplayMode: 'similar',
                sessionMood: {
                    dominantLocale: null,
                    deepDiveArtist: null,
                    preferLong: false,
                    preferShort: false,
                    restless: false,
                },
            })
            expect(result.score).toBe(-Infinity)
        })

        it('rejects cross-genre with dominant family', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack(),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                autoplayMode: 'similar',
                sessionMood: null,
                genreContext: {
                    candidateTags: ['thrash metal', 'metal', 'rock'],
                    currentTrackTags: ['rap', 'hip hop', 'trap'],
                    sessionGenreFamilies: new Set(['rap_hiphop']),
                },
            })
            expect(result.score).toBe(-Infinity)
        })

        it.each([
            [
                'long tracks',
                { author: 'Test Artist', durationMS: 7 * 60 * 1000 },
                { preferLong: true },
                'long track match',
            ],
            [
                'short tracks',
                { author: 'Test Artist', durationMS: 2 * 60 * 1000 },
                { preferShort: true },
                'quick hit match',
            ],
        ])('boosts %s', (_, trackOverrides, moodOverride, signal) => {
            const baseMood = {
                dominantLocale: null,
                deepDiveArtist: null,
                preferLong: moodOverride.preferLong ?? false,
                preferShort: moodOverride.preferShort ?? false,
                restless: false,
            }
            const result = calculateRecommendationScore({
                candidate: createTrack(trackOverrides),
                currentTrack: createTrack({ durationMS: 5 * 60 * 1000 }),
                recentArtists: new Set(),
                autoplayMode: 'similar',
                sessionMood: baseMood,
            })
            expect(result.signals).toContain(signal)
        })

        it('does not reward cross-artist title-word overlap (name similarity removed)', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({
                    title: 'Purple Rain Forever',
                    author: 'Different Artist',
                    source: 'youtube',
                }),
                currentTrack: createTrack({
                    title: 'Purple Rain',
                    author: 'Prince',
                }),
                recentArtists: new Set(),
            })
            expect(result.signals).not.toContain('similar title mood')
        })

        it('boosts popular mode based on liked weight', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({
                    title: 'Hit Song',
                    author: 'Test Artist',
                }),
                currentTrack: createTrack(),
                recentArtists: new Set(['other artist']),
                autoplayMode: 'popular',
                likedWeights: new Map([['hitsong::testartist', 0.8]]),
            })
            expect(result.score).toBeGreaterThan(1)
        })

        describe('genre-conditional spotify-preferred boost (approach B)', () => {
            const session = new Set(['rnb_soul', 'rock_metal'])

            it('gives the full boost when the candidate overlaps the session family', () => {
                const result = calculateRecommendationScore({
                    candidate: createTrack({
                        author: 'In Genre',
                        source: 'spotify',
                    }),
                    currentTrack: createTrack({ author: 'Seed' }),
                    recentArtists: new Set(),
                    genreContext: {
                        candidateTags: ['soul'],
                        currentTrackTags: ['rock'],
                        sessionGenreFamilies: session,
                    },
                })
                expect(result.signals).toContain('spotify preferred')
            })

            it('drops the boost entirely for a known cross-family candidate (Drake on a Prince session)', () => {
                const withBoost = calculateRecommendationScore({
                    candidate: createTrack({
                        author: 'Drake',
                        source: 'spotify',
                    }),
                    currentTrack: createTrack({ author: 'Prince' }),
                    recentArtists: new Set(),
                    genreContext: {
                        candidateTags: ['hip hop'],
                        currentTrackTags: ['soul'],
                        sessionGenreFamilies: session,
                    },
                })
                expect(withBoost.signals).not.toContain('spotify preferred')
            })

            it('halves (not drops) the boost when the candidate genre is unknown', () => {
                // Non-strong session so the untagged candidate isn't also hit
                // by the strong-family fail-closed guard — isolates the boost.
                const softSession = new Set(['rnb_soul', 'pop'])
                const onGenre = calculateRecommendationScore({
                    candidate: createTrack({
                        author: 'In Genre',
                        source: 'spotify',
                    }),
                    currentTrack: createTrack({ author: 'Seed' }),
                    recentArtists: new Set(),
                    genreContext: {
                        candidateTags: ['soul'],
                        currentTrackTags: ['soul'],
                        sessionGenreFamilies: softSession,
                    },
                })
                const unknown = calculateRecommendationScore({
                    candidate: createTrack({
                        author: 'Unknown Genre',
                        source: 'spotify',
                    }),
                    currentTrack: createTrack({ author: 'Seed' }),
                    recentArtists: new Set(),
                    genreContext: {
                        candidateTags: [],
                        currentTrackTags: ['soul'],
                        sessionGenreFamilies: softSession,
                    },
                })
                // Same author/title, so only the spotify-boost term differs:
                // full (0.4) vs half (0.2) → a 0.2 gap, and the signal stays.
                expect(unknown.signals).toContain('spotify preferred')
                expect(onGenre.score - unknown.score).toBeCloseTo(0.2, 5)
            })
        })

        it('fails closed on an untagged candidate in a strong-family session (approach B)', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({
                    author: 'Untagged Mainstream',
                    source: 'youtube',
                }),
                currentTrack: createTrack({ author: 'Rapper' }),
                recentArtists: new Set(),
                genreContext: {
                    candidateTags: [],
                    currentTrackTags: ['hip hop'],
                    sessionGenreFamilies: new Set(['rap_hiphop']),
                },
            })
            expect(result.signals).toContain('genre family drift')
        })

        it('does not fail closed for untagged candidates on a non-strong session', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({
                    author: 'Untagged',
                    source: 'youtube',
                }),
                currentTrack: createTrack({ author: 'Popstar' }),
                recentArtists: new Set(),
                genreContext: {
                    candidateTags: [],
                    currentTrackTags: ['pop'],
                    sessionGenreFamilies: new Set(['pop']),
                },
            })
            expect(result.signals).not.toContain('genre family drift')
        })

        describe('safe radius — seedDerived relaxation (2026-06-08 addendum)', () => {
            it('demotes (not rejects) a seed-derived cross-family candidate', () => {
                const result = calculateRecommendationScore({
                    candidate: createTrack({
                        author: 'Adjacent Genre',
                        source: 'youtube',
                    }),
                    currentTrack: createTrack({ author: 'Rapper' }),
                    recentArtists: new Set(),
                    seedDerived: true,
                    genreContext: {
                        candidateTags: ['soul'],
                        currentTrackTags: ['hip hop'],
                        sessionGenreFamilies: new Set(['rap_hiphop']),
                    },
                })
                // vetted-related → allowed into the radius, demoted not vetoed
                expect(result.score).toBeGreaterThan(-Infinity)
                expect(result.signals).toContain('genre family drift')
            })

            it('still hard-rejects an UN-vetted cross-family candidate (drift guard intact)', () => {
                const result = calculateRecommendationScore({
                    candidate: createTrack({
                        author: 'Mainstream',
                        source: 'youtube',
                    }),
                    currentTrack: createTrack({ author: 'Rapper' }),
                    recentArtists: new Set(),
                    // seedDerived omitted → un-vetted
                    genreContext: {
                        candidateTags: ['soul'],
                        currentTrackTags: ['hip hop'],
                        sessionGenreFamilies: new Set(['rap_hiphop']),
                    },
                })
                expect(result.score).toBe(-Infinity)
            })

            it('applies only a mild penalty to a seed-derived UNTAGGED candidate in a strong session', () => {
                const seed = calculateRecommendationScore({
                    candidate: createTrack({
                        author: 'Untagged Related',
                        source: 'youtube',
                    }),
                    currentTrack: createTrack({ author: 'Rapper' }),
                    recentArtists: new Set(),
                    seedDerived: true,
                    genreContext: {
                        candidateTags: [],
                        currentTrackTags: ['hip hop'],
                        sessionGenreFamilies: new Set(['rap_hiphop']),
                    },
                })
                const unvetted = calculateRecommendationScore({
                    candidate: createTrack({
                        author: 'Untagged Mainstream',
                        source: 'youtube',
                    }),
                    currentTrack: createTrack({ author: 'Rapper' }),
                    recentArtists: new Set(),
                    genreContext: {
                        candidateTags: [],
                        currentTrackTags: ['hip hop'],
                        sessionGenreFamilies: new Set(['rap_hiphop']),
                    },
                })
                // seed-derived: -0.1 (GENRE_PENALTY_UNKNOWN); un-vetted: -0.6 → 0.5 gap
                expect(seed.score - unvetted.score).toBeCloseTo(0.5, 5)
            })
        })
    })

    describe('calculateGenreFamilyPenalty', () => {
        it.each([
            [['rock'], [], -0.1],
            [['hip hop'], ['pop music'], -0.6],
        ])('returns correct penalty', (current, candidate, expected) => {
            expect(calculateGenreFamilyPenalty(current, candidate)).toBe(
                expected,
            )
        })
    })

    describe('getGenreFamilies', () => {
        it.each([
            [['hip hop', 'rap music'], 'rap_hiphop', true],
            [['unknown', 'fictional'], null, false],
        ])('identifies family in genres', (genres, family, shouldExist) => {
            const result = getGenreFamilies(genres)
            if (shouldExist) {
                expect(result.has(family)).toBe(true)
            } else {
                expect(result.size).toBe(0)
            }
        })
    })

    describe('enrichWithAudioFeatures', () => {
        it('returns tracks unchanged on token error', async () => {
            const tracks = [{ track: createTrack(), score: 1, signals: [] }]
            spotifyLinkServiceMock.mockRejectedValue(new Error('Token error'))
            const result = await enrichWithAudioFeatures(
                tracks,
                'user-123',
                null,
            )
            expect(result).toEqual(tracks)
        })

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

        it.each([
            ['close energy/valence match', 0.52, 0.52, 0.5, 0.5, 120, true],
            ['high energy/valence delta', 0.95, 0.95, 0.1, 0.1, 120, false],
            ['high acousticness value', 0.5, 0.5, 0.8, 0.5, 120, true],
            ['extreme acousticness swing', 0.95, 0.95, 0.05, 0.8, 120, false],
        ])(
            '%s',
            async (
                _,
                candEnergy,
                candValence,
                candAc,
                sessAc,
                candTempo,
                shouldBoost,
            ) => {
                const tracks = [{ track: createTrack(), score: 1, signals: [] }]
                spotifyLinkServiceMock.mockResolvedValue('valid-token')
                getBatchAudioFeaturesMock.mockResolvedValue(
                    new Map([
                        [
                            'testid',
                            {
                                energy: candEnergy,
                                valence: candValence,
                                tempo: candTempo,
                                acousticness: candAc,
                            } as SpotifyAudioFeatures,
                        ],
                    ]),
                )
                const result = await enrichWithAudioFeatures(
                    tracks,
                    'user-123',
                    {
                        energy: candEnergy < 0.7 && shouldBoost ? 0.5 : 0.1,
                        valence: candValence < 0.7 && shouldBoost ? 0.5 : 0.1,
                        tempo: candTempo > 160 ? 100 : 120,
                        acousticness: sessAc,
                    } as SpotifyAudioFeatures,
                )
                if (shouldBoost) {
                    expect(result[0].score).toBeGreaterThan(1)
                } else {
                    expect(result[0].score).toBeLessThan(1)
                }
            },
        )

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
