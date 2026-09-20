import { jest } from '@jest/globals'
import type { Track } from 'discord-player'
import { computeHitAtK } from './autoplayEval'
import type { EvalSample } from './autoplayEval'
import { normalizeTrackKey } from './scoringUtils'

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

describe('autoplayEval', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        spotifyLinkServiceMock.mockResolvedValue(null)
        getBatchAudioFeaturesMock.mockResolvedValue(new Map())
        getArtistGenresMock.mockResolvedValue([])
    })

    describe('computeHitAtK', () => {
        it('returns 1.0 when positive candidate scores highest', () => {
            const seed = createTrack({ author: 'Pink Floyd' })
            const positive = createTrack({
                title: 'Another Brick',
                author: 'Pink Floyd',
            })
            const negative1 = createTrack({
                title: 'Song A',
                author: 'Artist A',
            })
            const negative2 = createTrack({
                title: 'Song B',
                author: 'Artist B',
            })
            const negative3 = createTrack({
                title: 'Song C',
                author: 'Artist C',
            })
            const negative4 = createTrack({
                title: 'Song D',
                author: 'Artist D',
            })

            const sample: EvalSample = {
                seed,
                candidates: [
                    { track: negative1, isPositive: false },
                    { track: negative2, isPositive: false },
                    { track: negative3, isPositive: false },
                    { track: positive, isPositive: true },
                    { track: negative4, isPositive: false },
                ],
                recentArtists: new Set(),
                implicitDislikeKeys: new Set(),
            }

            const result = computeHitAtK([sample], 5)
            expect(result).toBe(1.0)
        })

        it('returns 0.0 when positive is in implicitDislikeKeys', () => {
            const seed = createTrack({ author: 'Pink Floyd' })
            const positive = createTrack({
                title: 'Comfortably Numb',
                author: 'Pink Floyd',
            })
            const negative1 = createTrack({
                title: 'Song A',
                author: 'Pink Floyd',
            })
            const negative2 = createTrack({
                title: 'Song B',
                author: 'Pink Floyd',
            })
            const negative3 = createTrack({
                title: 'Song C',
                author: 'Pink Floyd',
            })
            const negative4 = createTrack({
                title: 'Song D',
                author: 'Pink Floyd',
            })

            const positiveKey = 'comfortablynumb::pinkfloyd'

            const sample: EvalSample = {
                seed,
                candidates: [
                    { track: negative1, isPositive: false },
                    { track: negative2, isPositive: false },
                    { track: negative3, isPositive: false },
                    { track: positive, isPositive: true },
                    { track: negative4, isPositive: false },
                ],
                recentArtists: new Set(),
                implicitDislikeKeys: new Set([positiveKey]),
            }

            const result = computeHitAtK([sample], 4)
            expect(result).toBe(0.0)
        })

        it('returns 0 for empty samples array', () => {
            const result = computeHitAtK([], 5)
            expect(result).toBe(0)
        })

        it('throws for non-positive k', () => {
            expect(() => computeHitAtK([], 0)).toThrow(
                'k must be a positive integer',
            )
            expect(() => computeHitAtK([], -1)).toThrow(
                'k must be a positive integer',
            )
        })

        it('throws for non-integer k', () => {
            expect(() => computeHitAtK([], 2.5)).toThrow(
                'k must be a positive integer',
            )
        })

        it('works across multiple samples (averages correctly)', () => {
            const seed1 = createTrack({ author: 'Artist 1' })
            const positive1 = createTrack({
                title: 'Hit Song',
                author: 'Artist 1',
            })
            const negative1A = createTrack({
                title: 'Other 1',
                author: 'Artist X',
            })
            const negative1B = createTrack({
                title: 'Other 2',
                author: 'Artist Y',
            })

            const sample1: EvalSample = {
                seed: seed1,
                candidates: [
                    { track: negative1A, isPositive: false },
                    { track: positive1, isPositive: true },
                    { track: negative1B, isPositive: false },
                ],
                recentArtists: new Set(),
                implicitDislikeKeys: new Set(),
            }

            const seed2 = createTrack({ author: 'Artist 2' })
            const negative2A = createTrack({
                title: 'Other 3',
                author: 'Artist 2',
            })
            const negative2B = createTrack({
                title: 'Other 4',
                author: 'Artist 2',
            })
            const positive2 = createTrack({
                title: 'Hidden Song',
                author: 'Artist 5',
            })

            const positive2Key = 'hiddensong::artist5'

            const sample2: EvalSample = {
                seed: seed2,
                candidates: [
                    { track: negative2A, isPositive: false },
                    { track: negative2B, isPositive: false },
                    { track: positive2, isPositive: true },
                ],
                recentArtists: new Set(),
                implicitDislikeKeys: new Set([positive2Key]),
            }

            const result = computeHitAtK([sample1, sample2], 2)
            expect(result).toBe(0.5)
        })
    })

    describe('fixture gate — CI baseline', () => {
        it('Hit@5 >= 0.8 when decoys carry recent-artist and dislike penalties', () => {
            const samples: EvalSample[] = []

            for (let i = 0; i < 5; i++) {
                const seed = createTrack({
                    title: 'Seed Song',
                    author: 'Seed Artist',
                })
                const positive = createTrack({
                    title: `Fresh Song ${i}`,
                    author: `Fresh Artist ${i}`,
                })

                const decoyArtists = Array.from(
                    { length: 14 },
                    (_, d) => `Stale Artist ${i} ${d}`,
                )
                const decoys = decoyArtists.map((author, d) =>
                    createTrack({ title: `Stale Song ${i} ${d}`, author }),
                )

                const recentArtists = new Set(
                    decoyArtists.map((a) => a.toLowerCase()),
                )
                const implicitDislikeKeys = new Set(
                    decoys
                        .slice(0, 7)
                        .map((t) => normalizeTrackKey(t.title, t.author)),
                )

                samples.push({
                    seed,
                    candidates: [
                        ...decoys.map((track) => ({
                            track,
                            isPositive: false,
                        })),
                        { track: positive, isPositive: true },
                    ],
                    recentArtists,
                    implicitDislikeKeys,
                })
            }

            const result = computeHitAtK(samples, 5)
            expect(result).toBeGreaterThanOrEqual(0.8)
        })

        it('Hit@5 = 0 when positive track is in implicitDislikeKeys', () => {
            const seed = createTrack({ author: 'Artist A' })
            const positive = createTrack({
                title: 'Disliked Track',
                author: 'Artist A',
            })
            const sameArtistNegatives = [
                createTrack({ title: 'Other 1', author: 'Artist A' }),
                createTrack({ title: 'Other 2', author: 'Artist A' }),
                createTrack({ title: 'Other 3', author: 'Artist A' }),
                createTrack({ title: 'Other 4', author: 'Artist A' }),
            ]

            const decoys = [
                createTrack({ title: 'Decoy X1', author: 'Artist X' }),
                createTrack({ title: 'Decoy X2', author: 'Artist X' }),
                createTrack({ title: 'Decoy Y1', author: 'Artist Y' }),
                createTrack({ title: 'Decoy Y2', author: 'Artist Y' }),
                createTrack({ title: 'Decoy Z1', author: 'Artist Z' }),
                createTrack({
                    title: 'Long Decoy 1',
                    author: 'Long Artist',
                    durationMS: 9 * 60 * 1000,
                }),
                createTrack({
                    title: 'Long Decoy 2',
                    author: 'Another Long Artist',
                    durationMS: 9 * 60 * 1000,
                }),
                createTrack({
                    title: 'Long Decoy 3',
                    author: 'Third Long Artist',
                    durationMS: 9 * 60 * 1000,
                }),
                createTrack({
                    title: 'Long Decoy 4',
                    author: 'Fourth Long Artist',
                    durationMS: 9 * 60 * 1000,
                }),
                createTrack({
                    title: 'Long Decoy 5',
                    author: 'Fifth Long Artist',
                    durationMS: 9 * 60 * 1000,
                }),
            ]

            const positiveKey = 'dislikedtrack::artista'

            const sample: EvalSample = {
                seed,
                candidates: [
                    ...sameArtistNegatives.map((track) => ({
                        track,
                        isPositive: false,
                    })),
                    ...decoys.map((track) => ({ track, isPositive: false })),
                    { track: positive, isPositive: true },
                ],
                recentArtists: new Set(),
                implicitDislikeKeys: new Set([positiveKey]),
            }

            const result = computeHitAtK([sample], 4)
            expect(result).toBe(0)
        })
    })
})
