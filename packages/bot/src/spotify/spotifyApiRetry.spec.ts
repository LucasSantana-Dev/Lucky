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

    describe('getAudioFeatures with 429 retry', () => {
        it('should retry on 429 and succeed on second attempt', async () => {
            let attemptCount = 0

            fetchMock.mockImplementation(async () => {
                attemptCount++
                if (attemptCount === 1) {
                    const error = new Response(null, { status: 429 })
                    throw error
                }
                // Second attempt succeeds
                return new Response(
                    JSON.stringify({
                        id: 'track1',
                        energy: 0.8,
                        valence: 0.7,
                        danceability: 0.6,
                        tempo: 120,
                        acousticness: 0.2,
                    }),
                    { status: 200 },
                )
            })

            const result = await spotifyApi.getAudioFeatures('test-token', 'track1')

            expect(attemptCount).toBe(2)
            expect(result).not.toBeNull()
            expect(result?.energy).toBe(0.8)
            expect(result?.valence).toBe(0.7)
            expect(debugLog).toHaveBeenCalled()
        })

        it('should swallow error and return null after exhausting retries on consecutive 429 responses', async () => {
            let attemptCount = 0

            fetchMock.mockImplementation(async () => {
                attemptCount++
                const error = new Response(null, { status: 429 })
                throw error
            })

            const result = await spotifyApi.getAudioFeatures('test-token', 'track1')

            // maxRetries default is 2, so we expect: initial attempt + 2 retries = 3 total
            expect(attemptCount).toBe(3)
            expect(warnLog).toHaveBeenCalled()
            expect(logAndSwallow).toHaveBeenCalled()
            expect(result).toBeNull()
        })

        it('should throw immediately on non-429 errors without retrying', async () => {
            fetchMock.mockImplementation(async () => {
                throw new Response(null, { status: 401 })
            })

            const result = await spotifyApi.getAudioFeatures('test-token', 'track1')

            // No retry — only 1 attempt
            expect(fetchMock).toHaveBeenCalledTimes(1)
            expect(result).toBeNull()
            expect(logAndSwallow).toHaveBeenCalled()
        })

        it('should use Retry-After header when present', async () => {
            let attemptCount = 0

            fetchMock.mockImplementation(async () => {
                attemptCount++
                if (attemptCount === 1) {
                    throw new Response(null, {
                        status: 429,
                        headers: { 'Retry-After': '0' },
                    })
                }
                return new Response(
                    JSON.stringify({
                        id: 'track1',
                        energy: 0.8,
                        valence: 0.7,
                        danceability: 0.6,
                        tempo: 120,
                        acousticness: 0.2,
                    }),
                    { status: 200 },
                )
            })

            const result = await spotifyApi.getAudioFeatures('test-token', 'track1')

            expect(attemptCount).toBe(2)
            expect(result).not.toBeNull()
            expect(debugLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ retryAfter: 0 }),
                }),
            )
        })
    })

    describe('getSpotifyRecommendations with 429 retry', () => {
        it('should retry on 429 and return recommendations on second attempt', async () => {
            let attemptCount = 0

            fetchMock.mockImplementation(async () => {
                attemptCount++
                if (attemptCount === 1) {
                    const error = new Response(null, { status: 429 })
                    throw error
                }
                return new Response(
                    JSON.stringify({
                        tracks: [
                            {
                                id: 'rec1',
                                name: 'Recommended Song',
                                artists: [{ name: 'Artist' }],
                                duration_ms: 180000,
                            },
                        ],
                    }),
                    { status: 200 },
                )
            })

            const result = await spotifyApi.getSpotifyRecommendations('test-token', [
                'seed1',
            ])

            expect(attemptCount).toBe(2)
            expect(result).toHaveLength(1)
            expect(result[0].name).toBe('Recommended Song')
            expect(debugLog).toHaveBeenCalled()
        })

        it('should swallow error and return empty array after exhausting retries on multiple 429 responses', async () => {
            let attemptCount = 0

            fetchMock.mockImplementation(async () => {
                attemptCount++
                const error = new Response(null, { status: 429 })
                throw error
            })

            const result = await spotifyApi.getSpotifyRecommendations('test-token', ['seed1'])

            expect(attemptCount).toBe(3) // initial + 2 retries
            expect(warnLog).toHaveBeenCalled()
            expect(logAndSwallow).toHaveBeenCalled()
            expect(result).toEqual([])
        })
    })
})
