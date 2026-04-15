import { API_ROUTES } from '@lucky/shared/constants'
import type { AxiosInstance } from 'axios'

export interface SpotifyArtist {
    id: string
    name: string
    imageUrl: string | null
    popularity: number
    genres: string[]
}

export interface ArtistPreference {
    id: string
    discordUserId: string
    guildId: string
    artistKey: string
    artistName: string
    spotifyId: string | null
    imageUrl: string | null
    preference: 'prefer' | 'block'
    createdAt: string
    updatedAt: string
}

export function createArtistsApi(apiClient: AxiosInstance) {
    return {
        getSuggestions: () =>
            apiClient.get<{ artists: SpotifyArtist[] }>(API_ROUTES.ARTISTS.suggestions()),

        search: (query: string) =>
            apiClient.get<{ artists: SpotifyArtist[] }>(
                `/artists/search?q=${encodeURIComponent(query)}`,
            ),

        getRelated: (artistId: string) =>
            apiClient.get<{ artists: SpotifyArtist[] }>(
                `/artists/${encodeURIComponent(artistId)}/related`,
            ),

        getPreferences: (guildId: string) =>
            apiClient.get<{ preferences: ArtistPreference[] }>(
                `/users/me/preferred-artists?guildId=${encodeURIComponent(guildId)}`,
            ),

        savePreference: (data: {
            guildId: string
            artistKey: string
            artistName: string
            spotifyId?: string
            imageUrl?: string
            preference: 'prefer' | 'block'
        }) =>
            apiClient.post<{ preference: ArtistPreference }>(
                '/users/me/preferred-artists',
                data,
            ),

        savePreferencesBatch: (data: {
            guildId: string
            items: Array<{
                artistId: string
                artistKey: string
                artistName: string
                imageUrl: string | null
                preference: 'prefer' | 'block'
            }>
        }) =>
            apiClient.put<{ preferences: ArtistPreference[] }>(
                '/api/artists/preferences/batch',
                data,
            ),

        deletePreference: (artistKey: string, guildId: string) =>
            apiClient.delete<{ success: boolean }>(
                `/users/me/preferred-artists/${encodeURIComponent(artistKey)}?guildId=${encodeURIComponent(guildId)}`,
            ),
    }
}
