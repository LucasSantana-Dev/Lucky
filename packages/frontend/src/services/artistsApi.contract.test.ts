import { describe, test, expect, vi } from 'vitest'
import { artistsSchemas } from '../../../backend/src/schemas/artists'
import { createArtistsApi } from './artistsApi'

const guildId = '123456789012345678'
const queryOf = (path: string) =>
    Object.fromEntries(new URLSearchParams(path.split('?')[1]))

describe('artists frontend/backend contract', () => {
    test('the search call sends a q query the backend search schema accepts', () => {
        const apiClient = { get: vi.fn() }
        createArtistsApi(apiClient as never).search('Daft Punk & Co')

        const [path] = apiClient.get.mock.calls[0]
        expect(path).toBe('/artists/search?q=Daft%20Punk%20%26%20Co')
        expect(queryOf(path)).toEqual({ q: 'Daft Punk & Co' })
        expect(
            artistsSchemas.searchQuery.safeParse(queryOf(path)).success,
        ).toBe(true)
    })

    test('a search query over 200 characters is rejected for the q field', () => {
        const result = artistsSchemas.searchQuery.safeParse({
            q: 'x'.repeat(201),
        })

        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues).toHaveLength(1)
        expect(result.error.issues[0]).toMatchObject({
            code: 'too_big',
            path: ['q'],
        })
    })

    test('the preferences call sends a guildId query the backend schema accepts', () => {
        const apiClient = { get: vi.fn() }
        createArtistsApi(apiClient as never).getPreferences(guildId)

        const [path] = apiClient.get.mock.calls[0]
        expect(path).toBe(`/users/me/preferred-artists?guildId=${guildId}`)
        expect(queryOf(path)).toEqual({ guildId })
        expect(
            artistsSchemas.preferredArtistsQuery.safeParse(queryOf(path))
                .success,
        ).toBe(true)
    })

    test('the save call sends a body the backend save schema accepts', () => {
        const apiClient = { post: vi.fn() }
        createArtistsApi(apiClient as never).savePreference({
            guildId,
            artistKey: 'daft-punk',
            artistName: 'Daft Punk',
            spotifyId: 'sp1',
            preference: 'block',
        })

        const [path, body] = apiClient.post.mock.calls[0]
        expect(path).toBe('/users/me/preferred-artists')
        expect(body).toEqual({
            guildId,
            artistKey: 'daft-punk',
            artistName: 'Daft Punk',
            spotifyId: 'sp1',
            preference: 'block',
        })
        expect(artistsSchemas.savePreferenceBody.safeParse(body).success).toBe(
            true,
        )
    })

    test('the batch call sends a body the backend batch schema accepts', () => {
        const apiClient = { put: vi.fn() }
        const data = {
            guildId,
            items: [
                {
                    artistId: 'a1',
                    artistKey: 'daft-punk',
                    artistName: 'Daft Punk',
                    imageUrl: null,
                    preference: 'prefer' as const,
                },
            ],
        }
        createArtistsApi(apiClient as never).savePreferencesBatch(data)

        const [path, body] = apiClient.put.mock.calls[0]
        expect(path).toBe('/artists/preferences/batch')
        expect(body).toEqual(data)
        expect(
            artistsSchemas.batchSavePreferencesBody.safeParse(body).success,
        ).toBe(true)
    })

    test('a batch item with an unknown preference is rejected for that item preference field', () => {
        const result = artistsSchemas.batchSavePreferencesBody.safeParse({
            guildId,
            items: [
                {
                    artistId: 'a1',
                    artistKey: 'k',
                    artistName: 'n',
                    imageUrl: null,
                    preference: 'ban',
                },
            ],
        })

        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues).toHaveLength(1)
        expect(result.error.issues[0]).toMatchObject({
            code: 'invalid_value',
            path: ['items', 0, 'preference'],
        })
    })

    test('the delete call sends the key in the path and guildId in the query the backend schemas accept', () => {
        const apiClient = { delete: vi.fn() }
        createArtistsApi(apiClient as never).deletePreference(
            'daft punk',
            guildId,
        )

        const [path] = apiClient.delete.mock.calls[0]
        expect(path).toBe(
            `/users/me/preferred-artists/daft%20punk?guildId=${guildId}`,
        )
        expect(
            artistsSchemas.deletePreferenceQuery.safeParse(queryOf(path))
                .success,
        ).toBe(true)
        expect(
            artistsSchemas.deletePreferenceParams.safeParse({
                artistKey: decodeURIComponent(
                    path.split('?')[0].split('/').pop() as string,
                ),
            }).success,
        ).toBe(true)
    })
})
