import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals'
import { getUserTopTracks, getUserSavedTracks } from './spotifyApi'

describe('spotifyApi', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        jest.resetAllMocks()
    })

    describe('getUserTopTracks', () => {
        it('returns mapped tracks from Spotify API response', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            items: [
                                {
                                    name: 'Song A',
                                    artists: [{ name: 'Artist A' }],
                                },
                                {
                                    name: 'Song B',
                                    artists: [{ name: 'Artist B' }],
                                },
                            ],
                        }),
                } as Response),
            ) as jest.Mock

            const tracks = await getUserTopTracks('token123', 'medium_term', 50)

            expect(tracks).toEqual([
                { artist: 'Artist A', title: 'Song A' },
                { artist: 'Artist B', title: 'Song B' },
            ])
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/me/top/tracks'),
                expect.objectContaining({
                    headers: { Authorization: 'Bearer token123' },
                }),
            )
        })

        it('returns empty array on API error', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: false,
                } as Response),
            ) as jest.Mock

            const tracks = await getUserTopTracks('bad-token')

            expect(tracks).toEqual([])
        })

        it('returns empty array on network error', async () => {
            global.fetch = jest.fn(() =>
                Promise.reject(new Error('Network error')),
            ) as jest.Mock

            const tracks = await getUserTopTracks('token123')

            expect(tracks).toEqual([])
        })

        it('uses default time_range of medium_term', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ items: [] }),
                } as Response),
            ) as jest.Mock

            await getUserTopTracks('token123', undefined, 25)

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('time_range=medium_term'),
                expect.anything(),
            )
        })

        it('uses custom time_range when provided', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ items: [] }),
                } as Response),
            ) as jest.Mock

            await getUserTopTracks('token123', 'short_term', 10)

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('time_range=short_term'),
                expect.anything(),
            )
        })

        it('uses custom limit when provided', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ items: [] }),
                } as Response),
            ) as jest.Mock

            await getUserTopTracks('token123', 'medium_term', 100)

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('limit=100'),
                expect.anything(),
            )
        })

        it('handles empty items array', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ items: [] }),
                } as Response),
            ) as jest.Mock

            const tracks = await getUserTopTracks('token123')

            expect(tracks).toEqual([])
        })
    })

    describe('getUserSavedTracks', () => {
        it('returns mapped tracks from saved tracks endpoint', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            items: [
                                {
                                    track: {
                                        name: 'Saved Song 1',
                                        artists: [{ name: 'Saved Artist 1' }],
                                    },
                                },
                                {
                                    track: {
                                        name: 'Saved Song 2',
                                        artists: [{ name: 'Saved Artist 2' }],
                                    },
                                },
                            ],
                        }),
                } as Response),
            ) as jest.Mock

            const tracks = await getUserSavedTracks('token456', 50)

            expect(tracks).toEqual([
                { artist: 'Saved Artist 1', title: 'Saved Song 1' },
                { artist: 'Saved Artist 2', title: 'Saved Song 2' },
            ])
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/me/tracks'),
                expect.objectContaining({
                    headers: { Authorization: 'Bearer token456' },
                }),
            )
        })

        it('returns empty array on API error', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: false,
                } as Response),
            ) as jest.Mock

            const tracks = await getUserSavedTracks('bad-token')

            expect(tracks).toEqual([])
        })

        it('returns empty array on network error', async () => {
            global.fetch = jest.fn(() =>
                Promise.reject(new Error('Network error')),
            ) as jest.Mock

            const tracks = await getUserSavedTracks('token456')

            expect(tracks).toEqual([])
        })

        it('uses default limit of 50', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ items: [] }),
                } as Response),
            ) as jest.Mock

            await getUserSavedTracks('token456')

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('limit=50'),
                expect.anything(),
            )
        })

        it('uses custom limit when provided', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ items: [] }),
                } as Response),
            ) as jest.Mock

            await getUserSavedTracks('token456', 100)

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('limit=100'),
                expect.anything(),
            )
        })

        it('handles empty items array', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ items: [] }),
                } as Response),
            ) as jest.Mock

            const tracks = await getUserSavedTracks('token456')

            expect(tracks).toEqual([])
        })
    })
})
