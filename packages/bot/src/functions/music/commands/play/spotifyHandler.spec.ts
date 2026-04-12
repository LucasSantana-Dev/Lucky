import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { handleSpotifyTrack, handleSpotifyPlaylist } from './spotifyHandler'
import type { PlayCommandOptions } from './types'

const debugLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (payload: unknown) => debugLogMock(payload),
    errorLog: (payload: unknown) => errorLogMock(payload),
}))

function createUser(): PlayCommandOptions['user'] {
    return {
        id: 'user-1',
        tag: 'TestUser#0001',
    } as any
}

function createSearchResult(hasTracks: boolean, tracks: any[] = [], playlist: any = null) {
    return {
        hasTracks: () => hasTracks,
        tracks,
        playlist,
    }
}

function createPlayer(searchImpl: (query: string, options: any) => any): PlayCommandOptions['player'] {
    return {
        search: jest.fn(searchImpl),
    } as any
}

describe('spotifyHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('handleSpotifyTrack', () => {
        it('returns success with single track', async () => {
            const track = {
                title: 'Test Song',
                author: 'Test Artist',
                url: 'https://spotify.com/track/123',
            }
            const player = createPlayer(() => createSearchResult(true, [track]))

            const result = await handleSpotifyTrack(
                'https://spotify.com/track/123',
                createUser(),
                'guild-1',
                'channel-1',
                player,
            )

            expect(result.success).toBe(true)
            expect(result.tracks).toEqual([track])
            expect(result.isPlaylist).toBe(false)
            expect(debugLogMock).toHaveBeenCalled()
        })

        it('returns error when no tracks found', async () => {
            const player = createPlayer(() => createSearchResult(false, []))

            const result = await handleSpotifyTrack(
                'https://spotify.com/track/invalid',
                createUser(),
                'guild-1',
                'channel-1',
                player,
            )

            expect(result.success).toBe(false)
            expect(result.error).toContain('No tracks found')
            expect(result.error).toContain('Spotify link')
        })

        it('handles search errors gracefully', async () => {
            const player = createPlayer(() => {
                throw new Error('Search failed')
            })

            const result = await handleSpotifyTrack(
                'https://spotify.com/track/123',
                createUser(),
                'guild-1',
                'channel-1',
                player,
            )

            expect(result.success).toBe(false)
            expect(result.error).toContain('Failed to process Spotify track')
            expect(errorLogMock).toHaveBeenCalled()
        })
    })

    describe('handleSpotifyPlaylist', () => {
        it('returns success with multiple tracks', async () => {
            const tracks = [
                { title: 'Track 1', author: 'Artist 1', url: 'https://spotify.com/track/1' },
                { title: 'Track 2', author: 'Artist 2', url: 'https://spotify.com/track/2' },
            ]
            const playlistObj = { name: 'Test Playlist' }
            const player = createPlayer(() => createSearchResult(true, tracks, playlistObj))

            const result = await handleSpotifyPlaylist(
                'https://spotify.com/playlist/456',
                createUser(),
                'guild-1',
                'channel-1',
                player,
            )

            expect(result.success).toBe(true)
            expect(result.tracks).toEqual(tracks)
            expect(result.isPlaylist).toBe(true)
            expect(debugLogMock).toHaveBeenCalled()
        })

        it('returns error when no tracks found in playlist', async () => {
            const player = createPlayer(() => createSearchResult(false, []))

            const result = await handleSpotifyPlaylist(
                'https://spotify.com/playlist/invalid',
                createUser(),
                'guild-1',
                'channel-1',
                player,
            )

            expect(result.success).toBe(false)
            expect(result.error).toContain('No tracks found')
            expect(result.error).toContain('Spotify playlist')
        })

        it('handles search errors gracefully', async () => {
            const player = createPlayer(() => {
                throw new Error('Search failed')
            })

            const result = await handleSpotifyPlaylist(
                'https://spotify.com/playlist/456',
                createUser(),
                'guild-1',
                'channel-1',
                player,
            )

            expect(result.success).toBe(false)
            expect(result.error).toContain('Failed to process Spotify playlist')
            expect(errorLogMock).toHaveBeenCalled()
        })

        it('marks result as playlist when multiple tracks found', async () => {
            const tracks = [
                { title: 'Track 1', url: 'https://spotify.com/track/1' },
                { title: 'Track 2', url: 'https://spotify.com/track/2' },
            ]
            const player = createPlayer(() => createSearchResult(true, tracks, null))

            const result = await handleSpotifyPlaylist(
                'https://spotify.com/playlist/456',
                createUser(),
                'guild-1',
                'channel-1',
                player,
            )

            expect(result.success).toBe(true)
            expect(result.isPlaylist).toBe(true)
        })
    })
})
