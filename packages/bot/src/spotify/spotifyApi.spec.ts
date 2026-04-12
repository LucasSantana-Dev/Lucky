=======
import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals'
import {
    getBatchAudioFeatures,
    getArtistPopularity,
    type SpotifyAudioFeatures,
} from './spotifyApi'

// We need to clear the artist cache between tests since it persists module state
jest.resetModules()

type MockFetchResponse = {
    ok: boolean
    json?: () => Promise<unknown>
}

const fetchMock = jest.fn<
    (input: RequestInfo | URL, init?: RequestInit) => Promise<MockFetchResponse>
>()

describe('spotifyApi', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(globalThis as { fetch: typeof fetch }).fetch =
            fetchMock as unknown as typeof fetch
    })

    describe('getBatchAudioFeatures', () => {
        it('returns empty map for empty ids array', async () => {
            const result = await getBatchAudioFeatures('token', [])
            expect(result.size).toBe(0)
        })

        it('fetches audio features for multiple tracks', async () => {
            const mockFeatures = {
                audio_features: [
                    {
                        id: 'track1',
                        energy: 0.8,
                        valence: 0.7,
                        danceability: 0.6,
                        tempo: 120,
                        acousticness: 0.1,
                    },
                    {
                        id: 'track2',
                        energy: 0.5,
                        valence: 0.6,
                        danceability: 0.7,
                        tempo: 100,
                        acousticness: 0.3,
                    },
                ],
            }

            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => mockFeatures,
            })

            const result = await getBatchAudioFeatures('token', [
                'track1',
                'track2',
            ])

            expect(result.size).toBe(2)
            expect(result.get('track1')).toEqual({
                energy: 0.8,
                valence: 0.7,
                danceability: 0.6,
                tempo: 120,
                acousticness: 0.1,
            })
            expect(result.get('track2')).toEqual({
                energy: 0.5,
                valence: 0.6,
                danceability: 0.7,
                tempo: 100,
                acousticness: 0.3,
            })
        })

        it('skips tracks with null entries', async () => {
            const mockFeatures = {
                audio_features: [
                    {
                        id: 'track1',
                        energy: 0.8,
                        valence: 0.7,
                        danceability: 0.6,
                        tempo: 120,
                        acousticness: 0.1,
                    },
                    null,
                    {
                        id: 'track3',
                        energy: 0.5,
                        valence: 0.6,
                        danceability: 0.7,
                        tempo: 100,
                        acousticness: 0.3,
                    },
                ],
            }

            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => mockFeatures,
            })

            const result = await getBatchAudioFeatures('token', [
                'track1',
                'invalid',
                'track3',
            ])

            expect(result.size).toBe(2)
            expect(result.has('track1')).toBe(true)
            expect(result.has('track3')).toBe(true)
        })

        it('returns empty map on fetch error', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
            })

            const result = await getBatchAudioFeatures('token', ['track1'])
            expect(result.size).toBe(0)
        })

        it('returns empty map on json parse error', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => {
                    throw new Error('JSON error')
                },
            })

            const result = await getBatchAudioFeatures('token', ['track1'])
            expect(result.size).toBe(0)
        })

        it('handles missing optional audio feature fields', async () => {
            const mockFeatures = {
                audio_features: [
                    {
                        id: 'track1',
                        energy: 0.8,
                        valence: 0.7,
                    },
                ],
            }

            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => mockFeatures,
            })

            const result = await getBatchAudioFeatures('token', ['track1'])
            const feature = result.get('track1')
            expect(feature).toEqual({
                energy: 0.8,
                valence: 0.7,
                danceability: 0,
                tempo: 0,
                acousticness: 0,
            })
        })
    })

    describe('getArtistPopularity', () => {
        it('returns artist popularity from search', async () => {
            const mockResponse = {
                artists: {
                    items: [{ popularity: 75 }],
                },
            }

            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => mockResponse,
            })

            const result = await getArtistPopularity('token', 'The Beatles')
            expect(result).toBe(75)
        })

        it('returns null when no artists found', async () => {
            const mockResponse = {
                artists: {
                    items: [],
                },
            }

            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => mockResponse,
            })

            const result = await getArtistPopularity('token', 'Unknown Artist')
