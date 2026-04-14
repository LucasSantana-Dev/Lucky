import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AxiosInstance } from 'axios'
import { createArtistsApi } from './artistsApi'

function makeClient(data: unknown = {}, status = 200): AxiosInstance {
    const response = { data, status }
    return {
        get: vi.fn().mockResolvedValue(response),
        post: vi.fn().mockResolvedValue(response),
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
