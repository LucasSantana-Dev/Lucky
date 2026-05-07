import { jest } from '@jest/globals'
import { spotifyLinkService } from '@lucky/shared/services'
import { getUserSpotifySeeds, clearUserSeedsCache } from './spotifyUserSeeds'
import * as spotifyApi from './spotifyApi'

jest.mock('@lucky/shared/services', () => ({
    spotifyLinkService: {
        getByDiscordId: jest.fn(),
        getValidAccessToken: jest.fn(),
    },
}))

jest.mock('./spotifyApi', () => ({
    getUserTopArtistsAndTracks: jest.fn(),
    getUserSavedTracks: jest.fn().mockResolvedValue([]),
}))

describe('spotifyUserSeeds', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        clearUserSeedsCache('test-user-id')
        ;(spotifyApi.getUserSavedTracks as jest.Mock).mockResolvedValue([])
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

        ;(spotifyLinkService.getByDiscordId as jest.Mock).mockResolvedValue(
            mockLink,
        )
        ;(spotifyLinkService.getValidAccessToken as jest.Mock).mockResolvedValue(
            'token',
        )
        ;(spotifyApi.getUserTopArtistsAndTracks as jest.Mock).mockResolvedValue(
            mockSeeds,
        )

        const result = await getUserSpotifySeeds('test-user-id')

        expect(result).not.toBeNull()
        expect(result?.artistIds).toEqual(['artist-1', 'artist-2'])
        expect(result?.artistNames).toEqual(new Set(['artist one', 'artist two']))
        expect(result?.trackIds).toEqual(['track-1', 'track-2'])
        expect(result?.likedTrackIds).toEqual([])
    })

    it('should populate likedTrackIds when getUserSavedTracks returns data', async () => {
        const mockLink = {
            spotifyId: 'spotify-123',
            accessToken: 'token',
            refreshToken: 'refresh',
            tokenExpiresAt: new Date(Date.now() + 3600000),
            spotifyUsername: 'testuser',
        }
        const mockSeeds = {
            artists: [{ id: 'artist-1', name: 'Artist One', genres: ['rock'] }],
            tracks: [],
        }
        ;(spotifyLinkService.getByDiscordId as jest.Mock).mockResolvedValue(mockLink)
        ;(spotifyLinkService.getValidAccessToken as jest.Mock).mockResolvedValue('token')
        ;(spotifyApi.getUserTopArtistsAndTracks as jest.Mock).mockResolvedValue(mockSeeds)
        ;(spotifyApi.getUserSavedTracks as jest.Mock).mockResolvedValue(['liked-1', 'liked-2'])

        clearUserSeedsCache('test-user-id')
        const result = await getUserSpotifySeeds('test-user-id')

        expect(result?.likedTrackIds).toEqual(['liked-1', 'liked-2'])
    })

    it('should return null if user has no Spotify link', async () => {
        ;(spotifyLinkService.getByDiscordId as jest.Mock).mockResolvedValue(
            null,
        )

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

        ;(spotifyLinkService.getByDiscordId as jest.Mock).mockResolvedValue(
            mockLink,
        )
        ;(spotifyLinkService.getValidAccessToken as jest.Mock).mockResolvedValue(
            null,
        )

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

        ;(spotifyLinkService.getByDiscordId as jest.Mock).mockResolvedValue(
            mockLink,
        )
        ;(spotifyLinkService.getValidAccessToken as jest.Mock).mockResolvedValue(
            'token',
        )
        ;(spotifyApi.getUserTopArtistsAndTracks as jest.Mock).mockResolvedValue(
            null,
        )

        const result = await getUserSpotifySeeds('test-user-id')

        expect(result).toBeNull()
    })

    it('should cache results for 30 minutes', async () => {
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

        ;(spotifyLinkService.getByDiscordId as jest.Mock).mockResolvedValue(
            mockLink,
        )
        ;(spotifyLinkService.getValidAccessToken as jest.Mock).mockResolvedValue(
            'token',
        )
        ;(spotifyApi.getUserTopArtistsAndTracks as jest.Mock).mockResolvedValue(
            mockSeeds,
        )

        const result1 = await getUserSpotifySeeds('test-user-id')
        const result2 = await getUserSpotifySeeds('test-user-id')

        expect(result1).toEqual(result2)
        expect(
            (spotifyApi.getUserTopArtistsAndTracks as jest.Mock)
                .mock.calls.length,
        ).toBe(1)
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

        ;(spotifyLinkService.getByDiscordId as jest.Mock).mockResolvedValue(
            mockLink,
        )
        ;(spotifyLinkService.getValidAccessToken as jest.Mock).mockResolvedValue(
            'token',
        )
        ;(spotifyApi.getUserTopArtistsAndTracks as jest.Mock).mockResolvedValue(
            mockSeeds,
        )

        const result = await getUserSpotifySeeds('test-user-id')

        expect(result?.artistNames.has('the beatles')).toBe(true)
        expect(result?.artistNames.has('The Beatles')).toBe(false)
    })
})
