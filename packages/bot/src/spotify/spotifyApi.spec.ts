import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { getAudioFeatures, searchSpotifyTrack } from './spotifyApi'

describe('spotifyApi', () => {
    let originalFetch: typeof global.fetch

    beforeEach(() => {
        originalFetch = global.fetch
    })

    afterEach(() => {
        global.fetch = originalFetch
    })

    describe('getAudioFeatures', () => {
        it('returns audio features on successful response', async () => {
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({
                    energy: 0.8,
                    valence: 0.75,
                    danceability: 0.65,
                    tempo: 120,
                    acousticness: 0.1,
                }),
            }
            global.fetch = jest.fn().mockResolvedValue(mockResponse)

            const result = await getAudioFeatures('test-token', 'track-123')

            expect(result).toEqual({
                energy: 0.8,
                valence: 0.75,
                danceability: 0.65,
                tempo: 120,
                acousticness: 0.1,
            })
            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.spotify.com/v1/audio-features/track-123',
                {
                    method: 'GET',
                    headers: {
                        Authorization: 'Bearer test-token',
                    },
                },
            )
        })

        it('uses default values for missing optional properties', async () => {
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({
                    energy: 0.8,
                    valence: 0.75,
                }),
            }
            global.fetch = jest.fn().mockResolvedValue(mockResponse)

            const result = await getAudioFeatures('test-token', 'track-123')

            expect(result).toEqual({
                energy: 0.8,
                valence: 0.75,
                danceability: 0,
                tempo: 0,
                acousticness: 0,
            })
        })

        it('returns null when response is not ok', async () => {
            const mockResponse = {
                ok: false,
            }
            global.fetch = jest.fn().mockResolvedValue(mockResponse)

            const result = await getAudioFeatures('test-token', 'track-123')

            expect(result).toBeNull()
        })

        it('returns null when json parsing fails', async () => {
            const mockResponse = {
                ok: true,
                json: jest.fn().mockRejectedValue(new Error('JSON parse error')),
            }
            global.fetch = jest.fn().mockResolvedValue(mockResponse)

            const result = await getAudioFeatures('test-token', 'track-123')

            expect(result).toBeNull()
        })

        it('returns null when energy is missing', async () => {
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({
                    valence: 0.75,
                    danceability: 0.65,
                }),
            }
            global.fetch = jest.fn().mockResolvedValue(mockResponse)

            const result = await getAudioFeatures('test-token', 'track-123')

            expect(result).toBeNull()
        })

        it('returns null when valence is not a number', async () => {
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({
                    energy: 0.8,
                    valence: 'high',
                }),
            }
            global.fetch = jest.fn().mockResolvedValue(mockResponse)

            const result = await getAudioFeatures('test-token', 'track-123')

            expect(result).toBeNull()
        })

        it('catches and returns null on fetch error', async () => {
            global.fetch = jest
                .fn()
                .mockRejectedValue(new Error('Network error'))

            const result = await getAudioFeatures('test-token', 'track-123')

            expect(result).toBeNull()
        })
    })

    describe('searchSpotifyTrack', () => {
        it('returns track id on successful search', async () => {
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({
                    tracks: {
                        items: [{ id: 'spotify:track:abc123' }],
                    },
                }),
            }
            global.fetch = jest.fn().mockResolvedValue(mockResponse)

            const result = await searchSpotifyTrack(
                'test-token',
                'Song Title',
                'Artist Name',
            )

            expect(result).toBe('spotify:track:abc123')
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining(
                    'https://api.spotify.com/v1/search?q=track%3A%22Song+Title%22+artist%3A%22Artist+Name%22',
                ),
                {
                    method: 'GET',
                    headers: {
                        Authorization: 'Bearer test-token',
                    },
                },
            )
        })

        it('returns null when no tracks found', async () => {
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({
                    tracks: {
                        items: [],
                    },
                }),
            }
            global.fetch = jest.fn().mockResolvedValue(mockResponse)

            const result = await searchSpotifyTrack(
                'test-token',
                'Unknown Song',
                'Unknown Artist',
            )

            expect(result).toBeNull()
        })

        it('returns null when tracks property is missing', async () => {
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({}),
            }
            global.fetch = jest.fn().mockResolvedValue(mockResponse)

            const result = await searchSpotifyTrack(
                'test-token',
                'Song',
                'Artist',
            )

            expect(result).toBeNull()
        })

        it('returns null when response is not ok', async () => {
            const mockResponse = {
                ok: false,
            }
            global.fetch = jest.fn().mockResolvedValue(mockResponse)

            const result = await searchSpotifyTrack(
                'test-token',
                'Song',
                'Artist',
            )

            expect(result).toBeNull()
        })

        it('returns null when json parsing fails', async () => {
            const mockResponse = {
                ok: true,
                json: jest.fn().mockRejectedValue(new Error('JSON parse error')),
            }
            global.fetch = jest.fn().mockResolvedValue(mockResponse)

            const result = await searchSpotifyTrack(
                'test-token',
                'Song',
                'Artist',
            )

            expect(result).toBeNull()
        })

        it('catches and returns null on fetch error', async () => {
            global.fetch = jest
                .fn()
                .mockRejectedValue(new Error('Network error'))

            const result = await searchSpotifyTrack(
                'test-token',
                'Song',
                'Artist',
            )

            expect(result).toBeNull()
        })

        it('encodes special characters in search query', async () => {
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({
                    tracks: { items: [{ id: 'track-123' }] },
                }),
            }
            global.fetch = jest.fn().mockResolvedValue(mockResponse)

            await searchSpotifyTrack(
                'test-token',
                "Song's Title",
                'Artist & Co.',
            )

            const fetchUrl = (global.fetch as jest.Mock).mock.calls[0][0]
            expect(fetchUrl).toContain('Song%27s+Title')
            expect(fetchUrl).toContain('Artist+%26+Co.')
        })
    })
})
