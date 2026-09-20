import * as spotifyApi from './spotifyApi'
import { debugLog, warnLog } from '@lucky/shared/utils/general/log'
import { logAndSwallow } from '@lucky/shared/utils/error'

jest.mock('@lucky/shared/utils/general/log')
jest.mock('@lucky/shared/utils/error')

describe('Spotify API 429 Retry Logic', () => {
    let fetchMock: jest.Mock

    beforeEach(() => {
        jest.clearAllMocks()
        fetchMock = jest.fn()
        global.fetch = fetchMock
        ;(logAndSwallow as jest.Mock).mockImplementation(() => {})
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    describe('getArtistPopularity with 429 retry', () => {
        it('should retry on 429 and return popularity on second attempt', async () => {
            let attemptCount = 0

            fetchMock.mockImplementation(async () => {
                attemptCount++
                if (attemptCount === 1) {
                    throw new Response(null, { status: 429 })
                }
                return new Response(
                    JSON.stringify({
                        artists: { items: [{ popularity: 82 }] },
                    }),
                    { status: 200 },
                )
            })

            const result = await spotifyApi.getArtistPopularity(
                'test-token',
                'Retry Artist Popularity',
            )

            expect(attemptCount).toBe(2)
            expect(result).toBe(82)
        })

        it('should return null after network error', async () => {
            fetchMock.mockRejectedValue(new Error('network failure'))

            const result = await spotifyApi.getArtistPopularity(
                'test-token',
                'Failing Artist Popularity',
            )

            expect(result).toBeNull()
        })
    })

    describe('getArtistGenres with 429 retry', () => {
        it('should retry on 429 and return genres on second attempt', async () => {
            let attemptCount = 0

            fetchMock.mockImplementation(async () => {
                attemptCount++
                if (attemptCount === 1) {
                    throw new Response(null, { status: 429 })
                }
                return new Response(
                    JSON.stringify({
                        artists: { items: [{ genres: ['pop', 'rock'] }] },
                    }),
                    { status: 200 },
                )
            })

            const result = await spotifyApi.getArtistGenres(
                'test-token',
                'Retry Artist Genres',
            )

            expect(attemptCount).toBe(2)
            expect(result).toEqual(['pop', 'rock'])
        })

        it('should return empty array after network error', async () => {
            fetchMock.mockRejectedValue(new Error('network failure'))

            const result = await spotifyApi.getArtistGenres(
                'test-token',
                'Failing Artist Genres',
            )

            expect(result).toEqual([])
        })
    })

    // Regression: real fetch() RESOLVES with a 429 Response (it does not throw
    // on HTTP error statuses). Verify retry fires when fetch resolves rather
    // than rejects — Greptile feedback on PR #808.
    describe('429 retry when fetch resolves (not throws) the Response', () => {
        it('retries on resolved 429 then succeeds', async () => {
            let attemptCount = 0
            fetchMock.mockImplementation(async () => {
                attemptCount++
                if (attemptCount === 1) {
                    return new Response(null, { status: 429 })
                }
                return new Response(
                    // Vehicle only: exercises the shared 429 retry in
                    // spotifyFetch. Was getAudioFeatures until that endpoint
                    // was removed; the shape is now a search response.
                    JSON.stringify({
                        tracks: { items: [{ id: 't1' }] },
                    }),
                    { status: 200 },
                )
            })

            const result = await spotifyApi.searchSpotifyTrack(
                'tok',
                'Creep',
                'Radiohead',
            )

            expect(attemptCount).toBe(2)
            expect(result).not.toBeNull()
        })

        it('honours Retry-After delta-seconds header from resolved Response', async () => {
            jest.useFakeTimers()
            try {
                let attemptCount = 0
                fetchMock.mockImplementation(async () => {
                    attemptCount++
                    if (attemptCount === 1) {
                        return new Response(null, {
                            status: 429,
                            headers: { 'Retry-After': '2' },
                        })
                    }
                    return new Response(
                        JSON.stringify({ tracks: { items: [{ id: 't' }] } }),
                        { status: 200 },
                    )
                })

                const promise = spotifyApi.searchSpotifyTrack(
                    'tok',
                    'Creep',
                    'Radiohead',
                )
                await jest.advanceTimersByTimeAsync(2000)
                await promise

                expect(attemptCount).toBe(2)
                await expect(promise).resolves.not.toBeNull()
            } finally {
                jest.useRealTimers()
            }
        })

        it('parses Retry-After HTTP-date header without producing NaN delay', async () => {
            jest.useFakeTimers()
            try {
                const baseTime = new Date('2026-05-10T12:00:00Z').getTime()
                jest.setSystemTime(baseTime)
                const futureDate = new Date(baseTime + 3000).toUTCString()

                let attemptCount = 0
                fetchMock.mockImplementation(async () => {
                    attemptCount++
                    if (attemptCount === 1) {
                        return new Response(null, {
                            status: 429,
                            headers: { 'Retry-After': futureDate },
                        })
                    }
                    return new Response(
                        JSON.stringify({ tracks: { items: [{ id: 't' }] } }),
                        { status: 200 },
                    )
                })

                const promise = spotifyApi.searchSpotifyTrack(
                    'tok',
                    'Creep',
                    'Radiohead',
                )
                await jest.advanceTimersByTimeAsync(3000)
                await promise

                expect(attemptCount).toBe(2)
                await expect(promise).resolves.not.toBeNull()
            } finally {
                jest.useRealTimers()
            }
        })
    })
})
