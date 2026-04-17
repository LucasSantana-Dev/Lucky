import { describe, it, expect, beforeEach, vi } from 'vitest'
import { spotifyLinkService } from '@lucky/shared/services'
import { getUserSpotifySeeds, clearUserSeedsCache } from './spotifyUserSeeds'
import * as spotifyApi from './spotifyApi'

vi.mock('@lucky/shared/services', () => ({
    spotifyLinkService: {
        getByDiscordId: vi.fn(),
        getValidAccessToken: vi.fn(),
    },
}))

vi.mock('./spotifyApi', () => ({
    getUserTopArtistsAndTracks: vi.fn(),
}))

describe('spotifyUserSeeds', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        clearUserSeedsCache('test-user-id')
    })

    it('should fetch and cache user Spotify seeds', async () => {
        const mockLink = {
            spotifyId: 'spotify-123',
            accessToken: 'token',
            refreshToken: 'refresh',
            tokenExpiresAt: new Date(Date.now() + 3600000),
            spotifyUsername: 'testuser',
        }

        const mockSeeds = {
            artists: [
                { id: 'artist-1', name: 'Artist One', genres: ['rock'] },
                { id: 'artist-2', name: 'Artist Two', genres: ['pop'] },
            ],
            tracks: [
                { id: 'track-1', name: 'Track One', artist: 'Artist One' },
                { id: 'track-2', name: 'Track Two', artist: 'Artist Two' },
            ],
        }

        vi.mocked(spotifyLinkService.getByDiscordId).mockResolvedValue(mockLink)
        vi.mocked(spotifyLinkService.getValidAccessToken).mockResolvedValue('token')
        vi.mocked(spotifyApi.getUserTopArtistsAndTracks).mockResolvedValue(mockSeeds)

        const result = await getUserSpotifySeeds('test-user-id')

        expect(result).not.toBeNull()
        expect(result?.artistIds).toEqual(['artist-1', 'artist-2'])
        expect(result?.artistNames).toEqual(new Set(['artist one', 'artist two']))
        expect(result?.trackIds).toEqual(['track-1', 'track-2'])
    })

    it('should return null if user has no Spotify link', async () => {
        vi.mocked(spotifyLinkService.getByDiscordId).mockResolvedValue(null)

        const result = await getUserSpotifySeeds('test-user-id')

        expect(result).toBeNull()
    })

    it('should return null if token refresh fails', async () => {
        const mockLink = {
            spotifyId: 'spotify-123',
            accessToken: 'token',
            refreshToken: 'refresh',
            tokenExpiresAt: new Date(Date.now() + 3600000),
            spotifyUsername: 'testuser',
        }

        vi.mocked(spotifyLinkService.getByDiscordId).mockResolvedValue(mockLink)
        vi.mocked(spotifyLinkService.getValidAccessToken).mockResolvedValue(null)

        const result = await getUserSpotifySeeds('test-user-id')

        expect(result).toBeNull()
    })

    it('should return null if Spotify API call fails', async () => {
        const mockLink = {
            spotifyId: 'spotify-123',
            accessToken: 'token',
            refreshToken: 'refresh',
            tokenExpiresAt: new Date(Date.now() + 3600000),
            spotifyUsername: 'testuser',
        }

        vi.mocked(spotifyLinkService.getByDiscordId).mockResolvedValue(mockLink)
        vi.mocked(spotifyLinkService.getValidAccessToken).mockResolvedValue('token')
        vi.mocked(spotifyApi.getUserTopArtistsAndTracks).mockResolvedValue(null)

        const result = await getUserSpotifySeeds('test-user-id')

        expect(result).toBeNull()
    })

    it('should cache results for 5 minutes', async () => {
        const mockLink = {
            spotifyId: 'spotify-123',
            accessToken: 'token',
            refreshToken: 'refresh',
            tokenExpiresAt: new Date(Date.now() + 3600000),
            spotifyUsername: 'testuser',
        }

        const mockSeeds = {
            artists: [
                { id: 'artist-1', name: 'Artist One', genres: ['rock'] },
            ],
            tracks: [
                { id: 'track-1', name: 'Track One', artist: 'Artist One' },
            ],
        }

        vi.mocked(spotifyLinkService.getByDiscordId).mockResolvedValue(mockLink)
        vi.mocked(spotifyLinkService.getValidAccessToken).mockResolvedValue('token')
        vi.mocked(spotifyApi.getUserTopArtistsAndTracks).mockResolvedValue(mockSeeds)

        const result1 = await getUserSpotifySeeds('test-user-id')
        const result2 = await getUserSpotifySeeds('test-user-id')

        expect(result1).toEqual(result2)
        expect(vi.mocked(spotifyApi.getUserTopArtistsAndTracks)).toHaveBeenCalledOnce()
    })

    it('should normalize artist names to lowercase', async () => {
        const mockLink = {
            spotifyId: 'spotify-123',
            accessToken: 'token',
            refreshToken: 'refresh',
            tokenExpiresAt: new Date(Date.now() + 3600000),
            spotifyUsername: 'testuser',
        }

        const mockSeeds = {
            artists: [
                { id: 'artist-1', name: 'The Beatles', genres: ['rock'] },
            ],
            tracks: [],
        }

        vi.mocked(spotifyLinkService.getByDiscordId).mockResolvedValue(mockLink)
        vi.mocked(spotifyLinkService.getValidAccessToken).mockResolvedValue('token')
        vi.mocked(spotifyApi.getUserTopArtistsAndTracks).mockResolvedValue(mockSeeds)

        const result = await getUserSpotifySeeds('test-user-id')

        expect(result?.artistNames.has('the beatles')).toBe(true)
        expect(result?.artistNames.has('The Beatles')).toBe(false)
    })
})
