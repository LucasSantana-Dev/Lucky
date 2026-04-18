import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AxiosInstance } from 'axios'
import { createArtistsApi } from './artistsApi'

function makeClient(data: unknown = {}, status = 200): AxiosInstance {
    const response = { data, status }
    return {
        get: vi.fn().mockResolvedValue(response),
        post: vi.fn().mockResolvedValue(response),
        put: vi.fn().mockResolvedValue(response),
        delete: vi.fn().mockResolvedValue(response),
    } as unknown as AxiosInstance
}

describe('createArtistsApi', () => {
    let client: ReturnType<typeof makeClient>
    let api: ReturnType<typeof createArtistsApi>

    beforeEach(() => {
        client = makeClient()
        api = createArtistsApi(client)
    })

    describe('search', () => {
        it('calls GET /artists/search with encoded query', async () => {
            await api.search('The Beatles')
            expect(client.get).toHaveBeenCalledWith(
                '/artists/search?q=The%20Beatles',
            )
        })

        it('encodes special characters in query', async () => {
            await api.search('AC/DC')
            expect(client.get).toHaveBeenCalledWith('/artists/search?q=AC%2FDC')
        })
    })

    describe('getRelated', () => {
        it('calls GET /artists/:id/related with encoded id', async () => {
            await api.getRelated('abc123')
            expect(client.get).toHaveBeenCalledWith('/artists/abc123/related')
        })
    })

    describe('getPreferences', () => {
        it('calls GET /users/me/preferred-artists with guildId', async () => {
            await api.getPreferences('guild-1')
            expect(client.get).toHaveBeenCalledWith(
                '/users/me/preferred-artists?guildId=guild-1',
            )
        })
    })

    describe('savePreference', () => {
        it('calls POST /users/me/preferred-artists with data', async () => {
            const data = {
                guildId: 'g1',
                artistKey: 'thebeatles',
                artistName: 'The Beatles',
                spotifyId: 'sp123',
                imageUrl: 'http://img.example.com/a.jpg',
                preference: 'prefer' as const,
            }
            await api.savePreference(data)
            expect(client.post).toHaveBeenCalledWith(
                '/users/me/preferred-artists',
                data,
            )
        })

        it('works without optional fields', async () => {
            const data = {
                guildId: 'g1',
                artistKey: 'artist',
                artistName: 'Artist',
                preference: 'block' as const,
            }
            await api.savePreference(data)
            expect(client.post).toHaveBeenCalledWith(
                '/users/me/preferred-artists',
                data,
            )
        })
    })

    describe('savePreferencesBatch', () => {
        it('calls PUT /artists/preferences/batch with data', async () => {
            const data = {
                guildId: 'g1',
                items: [
                    {
                        artistId: 'sp1',
                        artistKey: 'thebeatles',
                        artistName: 'The Beatles',
                        imageUrl: 'http://img.example.com/a.jpg',
                        preference: 'prefer' as const,
                    },
                    {
                        artistId: 'sp2',
                        artistKey: 'pinkfloyd',
                        artistName: 'Pink Floyd',
                        imageUrl: 'http://img.example.com/b.jpg',
                        preference: 'block' as const,
                    },
                ],
            }
            await api.savePreferencesBatch(data)
            expect(client.put).toHaveBeenCalledWith(
                '/artists/preferences/batch',
                data,
            )
        })

        it('handles success response', async () => {
            const mockPreferences = [
                {
                    id: 'p1',
                    discordUserId: 'u1',
                    guildId: 'g1',
                    artistKey: 'thebeatles',
                    artistName: 'The Beatles',
                    spotifyId: 'sp1',
                    imageUrl: 'http://img.example.com/a.jpg',
                    preference: 'prefer' as const,
                    createdAt: '2026-04-15T00:00:00Z',
                    updatedAt: '2026-04-15T00:00:00Z',
                },
            ]
            client = makeClient({ preferences: mockPreferences })
            api = createArtistsApi(client)

            const data = {
                guildId: 'g1',
                items: [
                    {
                        artistId: 'sp1',
                        artistKey: 'thebeatles',
                        artistName: 'The Beatles',
                        imageUrl: 'http://img.example.com/a.jpg',
                        preference: 'prefer' as const,
                    },
                ],
            }
            const result = await api.savePreferencesBatch(data)

            expect(result.data).toEqual({ preferences: mockPreferences })
        })

        it('handles error response', async () => {
            client = makeClient(
                { error: 'Failed to save' },
                500,
            )
            api = createArtistsApi(client)

            const data = {
                guildId: 'g1',
                items: [
                    {
                        artistId: 'sp1',
                        artistKey: 'thebeatles',
                        artistName: 'The Beatles',
                        imageUrl: null,
                        preference: 'prefer' as const,
                    },
                ],
            }
            const result = await api.savePreferencesBatch(data)

            expect(result.status).toBe(500)
        })
    })

    describe('deletePreference', () => {
        it('calls DELETE /users/me/preferred-artists/:key with guildId', async () => {
            await api.deletePreference('thebeatles', 'guild-1')
            expect(client.delete).toHaveBeenCalledWith(
                '/users/me/preferred-artists/thebeatles?guildId=guild-1',
            )
        })

        it('encodes special characters in artistKey and guildId', async () => {
            await api.deletePreference('artist/test', 'guild 1')
            expect(client.delete).toHaveBeenCalledWith(
                '/users/me/preferred-artists/artist%2Ftest?guildId=guild%201',
            )
        })
    })
})
