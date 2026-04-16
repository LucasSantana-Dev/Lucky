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
        it('rejects blocked artists with -Infinity score', () => {
            const current = createTrack({ author: 'Artist A' })
            const candidate = createTrack({ author: 'Blocked Artist' })
            const blockedKeys = new Set(['blockedartist'])

            const result = calculateRecommendationScore(
                candidate,
                current,
                new Set(),
                new Map(),
                new Set(),
                blockedKeys,
            )

            expect(result.score).toBe(-Infinity)
            expect(result.reason).toBe('blocked artist')
        })

        it('rejects tracks longer than 15 minutes', () => {
            const current = createTrack()
            const candidate = createTrack({
                durationMS: 16 * 60 * 1000,
            })

            const result = calculateRecommendationScore(
                candidate,
                current,
                new Set(),
            )

            expect(result.score).toBe(-Infinity)
            expect(result.reason).toBe('track too long')
        })

        it('rejects ambient/noise content', () => {
            const current = createTrack()
            const candidate = createTrack({
                title: 'Relaxing Rain Sounds for Sleep',
            })

            const result = calculateRecommendationScore(
                candidate,
                current,
                new Set(),
            )

            expect(result.score).toBe(-Infinity)
            expect(result.reason).toBe('ambient/noise content')
        })

        it('rejects EDM mixes', () => {
            const current = createTrack()
            const candidate = createTrack({ title: 'DJ Set 3 Hour Mix' })

            const result = calculateRecommendationScore(
                candidate,
                current,
                new Set(),
            )

            expect(result.score).toBe(-Infinity)
            expect(result.reason).toBe('dj mix / edm set')
        })

        it('boosts preferred artists', () => {
            const current = createTrack()
            const candidate = createTrack({ author: 'Favorite Artist' })
            const preferredKeys = new Set(['favoriteartist'])

            const result = calculateRecommendationScore(
                candidate,
                current,
                new Set(),
                new Map(),
                preferredKeys,
            )

            expect(result.score).toBeGreaterThan(1)
            expect(result.reason).toContain('preferred artist')
        })

        it('boosts frequent artists (5+ plays)', () => {
            const current = createTrack()
            const candidate = createTrack({ author: 'Favorite Band' })
            const frequency = new Map([['favoriteband', 5]])

            const result = calculateRecommendationScore(
                candidate,
                current,
                new Set(),
                new Map(),
                new Set(),
                new Set(),
                'similar',
                frequency,
            )

            expect(result.score).toBeGreaterThan(1)
            expect(result.reason).toContain('favourite artist')
        })

        it('handles explicit dislike with high weight by rejecting', () => {
            const current = createTrack()
            const candidate = createTrack({
                title: 'Disliked Song',
                author: 'Test Artist',
            })
            const dislikedWeights = new Map([['dislikedsong::testartist', 0.7]])

            const result = calculateRecommendationScore(
                candidate,
                current,
                new Set(),
                new Map(),
                new Set(),
                new Set(),
                'similar',
                new Map(),
                new Set(),
                new Set(),
                dislikedWeights,
            )

            expect(result.score).toBe(-Infinity)
            expect(result.reason).toBe('disliked')
        })

        it('applies partial penalty for low-weight dislikes', () => {
            const current = createTrack()
            const candidate = createTrack({
                title: 'Xyz Abc',
                author: 'Different Artist',
                source: 'youtube',
            })
            const dislikedWeights = new Map([['xyzabc::differentartist', 0.3]])
            const recentArtists = new Set(['existing artist'])

            const result = calculateRecommendationScore(
                candidate,
                current,
                recentArtists,
                new Map(),
                new Set(),
                new Set(),
                'similar',
                new Map(),
                new Set(),
                new Set(),
                dislikedWeights,
            )

            expect(result.reason).toContain('old dislike')
            expect(result.score).toBeLessThan(1.3)
        })

        it('applies same-artist novelty penalty', () => {
            const current = createTrack({ author: 'Test Artist' })
            const candidate = createTrack({
                title: 'Xyz Abc',
                author: 'Test Artist',
                source: 'youtube',
            })

            const result = calculateRecommendationScore(
                candidate,
                current,
                new Set(),
            )

            expect(result.score).toBeLessThan(1)
        })

        it('applies Spanish locale penalty when dominantLocale is null', () => {
            const current = createTrack()
            const candidate = createTrack({ title: 'Reggaeton Song' })
            const mood: SessionMood = {
                dominantLocale: null,
                deepDiveArtist: null,
                preferLong: false,
                preferShort: false,
                restless: false,
            }

            const result = calculateRecommendationScore(
                candidate,
                current,
                new Set(),
                new Map(),
                new Set(),
                new Set(),
                'similar',
                new Map(),
                new Set(),
                new Set(),
                new Map(),
                mood,
            )

            expect(result.score).toBeLessThan(1)
            expect(result.reason).toContain('genre mismatch: latin/spanish')
        })

        it('boosts deep dive artist tracks', () => {
            const current = createTrack({ author: 'Deep Dive Artist' })
            const candidate = createTrack({ author: 'Deep Dive Artist' })
            const mood: SessionMood = {
                dominantLocale: null,
                deepDiveArtist: 'deep dive artist',
                preferLong: false,
                preferShort: false,
                restless: false,
            }

            const result = calculateRecommendationScore(
                candidate,
                current,
                new Set(),
                new Map(),
                new Set(),
                new Set(),
                'similar',
                new Map(),
                new Set(),
                new Set(),
                new Map(),
                mood,
            )

            expect(result.reason).toContain('deep dive')
        })

        it('boosts long tracks when preferLong is true', () => {
            const current = createTrack({ durationMS: 5 * 60 * 1000 })
            const candidate = createTrack({ durationMS: 7 * 60 * 1000 })
            const mood: SessionMood = {
                dominantLocale: null,
                deepDiveArtist: null,
                preferLong: true,
                preferShort: false,
                restless: false,
            }

            const result = calculateRecommendationScore(
                candidate,
                current,
                new Set(),
                new Map(),
                new Set(),
                new Set(),
                'similar',
                new Map(),
                new Set(),
                new Set(),
                new Map(),
                mood,
            )

            expect(result.reason).toContain('long track match')
        })

        it('boosts short tracks when preferShort is true', () => {
            const current = createTrack()
            const candidate = createTrack({ durationMS: 2 * 60 * 1000 })
            const mood: SessionMood = {
                dominantLocale: null,
                deepDiveArtist: null,
                preferLong: false,
                preferShort: true,
                restless: false,
            }

            const result = calculateRecommendationScore(
                candidate,
                current,
                new Set(),
                new Map(),
                new Set(),
                new Set(),
                'similar',
                new Map(),
                new Set(),
                new Set(),
                new Map(),
                mood,
            )

            expect(result.reason).toContain('quick hit match')
        })

        it('boosts restless discovery when artist is novel', () => {
            const current = createTrack()
            const candidate = createTrack({ author: 'Novel Artist' })
            const mood: SessionMood = {
                dominantLocale: null,
                deepDiveArtist: null,
                preferLong: false,
                preferShort: false,
                restless: true,
            }
            const recentArtists = new Set(['other artist'])

            const result = calculateRecommendationScore(
                candidate,
                current,
                recentArtists,
                new Map(),
                new Set(),
                new Set(),
                'similar',
                new Map(),
                new Set(),
                new Set(),
                new Map(),
                mood,
            )

            expect(result.reason).toContain('restless discovery')
        })
    })

    describe('calculateGenreFamilyPenalty', () => {
        it('returns -0.1 when current or candidate has no genres', () => {
            const penalty = calculateGenreFamilyPenalty(['rock'], [])
            expect(penalty).toBe(-0.1)
        })

        it('returns 0 when genres share a family', () => {
            const penalty = calculateGenreFamilyPenalty(
                ['rock music'],
                ['alternative rock'],
            )
            expect(penalty).toBe(0)
        })

        it('returns -0.6 for strong genre family mismatch', () => {
            const penalty = calculateGenreFamilyPenalty(
                ['hip hop'],
                ['pop music'],
            )
            expect(penalty).toBe(-0.6)
        })

        it('returns -0.3 for weak genre family mismatch', () => {
            const penalty = calculateGenreFamilyPenalty(
                ['pop music'],
                ['ambient lofi'],
            )
            expect(penalty).toBe(-0.3)
        })
    })

    describe('getGenreFamilies', () => {
        it('identifies genres in rap_hiphop family', () => {
            const families = getGenreFamilies(['hip hop', 'rap music'])
            expect(families.has('rap_hiphop')).toBe(true)
        })

        it('identifies genres in rock_metal family', () => {
            const families = getGenreFamilies(['metal', 'punk rock'])
            expect(families.has('rock_metal')).toBe(true)
        })

        it('identifies genres in multiple families', () => {
            const families = getGenreFamilies(
                ['rock', 'jazz', 'reggaeton'],
            )
            expect(families.size).toBeGreaterThanOrEqual(3)
        })

        it('returns empty set for unknown genres', () => {
            const families = getGenreFamilies(['unknown', 'fictional'])
            expect(families.size).toBe(0)
        })
    })

    describe('enrichWithAudioFeatures', () => {
        it('returns tracks unchanged when no token available', async () => {
            const tracks = [
                {
                    track: createTrack(),
                    score: 1,
                    reason: 'test',
                },
            ]
            spotifyLinkServiceMock.mockResolvedValue(null)

            const result = await enrichWithAudioFeatures(
                tracks,
                'user-123',
                null,
            )

            expect(result).toEqual(tracks)
        })

        it('returns tracks unchanged when token fetch fails', async () => {
            const tracks = [
                {
                    track: createTrack(),
                    score: 1,
                    reason: 'test',
                },
            ]
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
                    track: createTrack({ url: 'https://youtube.com/watch?v=123' }),
                    score: 1,
                    reason: 'test',
                },
            ]
            spotifyLinkServiceMock.mockResolvedValue('valid-token')

            const result = await enrichWithAudioFeatures(
                tracks,
                'user-123',
                { energy: 0.5, valence: 0.5 } as SpotifyAudioFeatures,
            )

            expect(result).toEqual(tracks)
        })

        it('handles getBatchAudioFeatures error gracefully', async () => {
            const tracks = [
                {
                    track: createTrack(),
                    score: 1,
                    reason: 'test',
                },
            ]
            spotifyLinkServiceMock.mockResolvedValue('valid-token')
            getBatchAudioFeaturesMock.mockRejectedValue(new Error('API error'))

            const result = await enrichWithAudioFeatures(
                tracks,
                'user-123',
                { energy: 0.5, valence: 0.5 } as SpotifyAudioFeatures,
            )

            expect(result).toEqual(tracks)
        })

        it('handles getArtistGenres error when fetching current artist genres', async () => {
            const tracks = [
                {
                    track: createTrack(),
                    score: 1,
                    reason: 'test',
                },
            ]
            spotifyLinkServiceMock.mockResolvedValue('valid-token')
            getArtistGenresMock.mockRejectedValue(new Error('Genre fetch failed'))

            const result = await enrichWithAudioFeatures(
                tracks,
                'user-123',
                { energy: 0.5, valence: 0.5 } as SpotifyAudioFeatures,
                'Current Artist',
            )

            expect(result).toEqual(tracks)
        })

        it('boosts score for close energy/valence match', async () => {
            const tracks = [
                {
                    track: createTrack(),
                    score: 1,
                    reason: 'test',
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
                { energy: 0.5, valence: 0.5 } as SpotifyAudioFeatures,
            )

            expect(result[0].score).toBeGreaterThan(1)
        })

        it('partially boosts for moderate energy/valence delta', async () => {
            const tracks = [
                {
                    track: createTrack(),
                    score: 1,
                    reason: 'test',
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
                { energy: 0.5, valence: 0.5 } as SpotifyAudioFeatures,
            )

            expect(result[0].score).toBeGreaterThan(1)
        })

        it('penalizes high energy/valence delta', async () => {
            const tracks = [
                {
                    track: createTrack(),
                    score: 1,
                    reason: 'test',
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
                { energy: 0.1, valence: 0.1 } as SpotifyAudioFeatures,
            )

            expect(result[0].score).toBeLessThan(1)
        })

        it('applies genre family penalty when fetching candidate genres', async () => {
            const tracks = [
                {
                    track: createTrack(),
                    score: 1,
                    reason: 'test',
                },
            ]
            spotifyLinkServiceMock.mockResolvedValue('valid-token')
            getBatchAudioFeaturesMock.mockResolvedValue(
                new Map([
                    [
                        'testid',
                        { energy: 0.5, valence: 0.5 } as SpotifyAudioFeatures,
                    ],
                ]),
            )

            let callCount = 0
            getArtistGenresMock.mockImplementation(async () => {
                callCount++
                if (callCount === 1) return ['rock', 'metal']
                return ['pop', 'dance']
            })

            const result = await enrichWithAudioFeatures(
                tracks,
                'user-123',
                { energy: 0.5, valence: 0.5 } as SpotifyAudioFeatures,
                'Current Artist',
            )

            expect(result[0].score).toBeLessThan(1)
            expect(result[0].reason).toContain('genre family drift')
        })

        it('sorts results by score descending', async () => {
            const tracks = [
                {
                    track: createTrack({
                        title: 'Low Score',
                        url: 'https://open.spotify.com/track/lowid',
                    }),
                    score: 0.5,
                    reason: 'test',
                },
                {
                    track: createTrack({
                        title: 'High Score',
                        url: 'https://open.spotify.com/track/highid',
                    }),
                    score: 2,
                    reason: 'test',
                },
            ]
            spotifyLinkServiceMock.mockResolvedValue('valid-token')
            getBatchAudioFeaturesMock.mockResolvedValue(new Map())

            const result = await enrichWithAudioFeatures(
                tracks,
                'user-123',
                { energy: 0.5, valence: 0.5 } as SpotifyAudioFeatures,
            )

            expect(result[0].score).toBeGreaterThan(result[1].score)
        })
    })
})
