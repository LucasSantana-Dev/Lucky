import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'
import {
    getSessionKeyForUser,
    isLastFmInvalidSessionError,
    updateNowPlaying,
    normalizeLastFmArtist,
    normalizeLastFmTitle,
    getTopTracks,
    getRecentTracks,
    getSimilarTracks,
    getTagTopTracks,
    getLovedTracks,
    getArtistTopTags,
} from './lastFmApi'

const getSessionKeyMock =
    jest.fn<(discordId: string) => Promise<string | null>>()

type MockFetchResponse = {
    ok: boolean
    json?: () => Promise<unknown>
    text?: () => Promise<string>
}

const fetchMock =
    jest.fn<
        (
            input: RequestInfo | URL,
            init?: RequestInit,
        ) => Promise<MockFetchResponse>
    >()

jest.mock('@lucky/shared/services', () => ({
    lastFmLinkService: {
        getSessionKey: (discordId: string) => getSessionKeyMock(discordId),
    },
}))

describe('lastFmApi', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        process.env.LASTFM_API_KEY = 'api-key'
        process.env.LASTFM_API_SECRET = 'api-secret'
        process.env.LASTFM_SESSION_KEY = 'env-session'
        ;(globalThis as { fetch: typeof fetch }).fetch =
            fetchMock as unknown as typeof fetch
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({}),
        } as MockFetchResponse)
    })

    afterEach(() => {
        delete process.env.LASTFM_API_KEY
        delete process.env.LASTFM_API_SECRET
        delete process.env.LASTFM_SESSION_KEY
    })

    it('uses database session key when available', async () => {
        getSessionKeyMock.mockResolvedValue('db-session')

        const sessionKey = await getSessionKeyForUser('user-1')

        expect(sessionKey).toBe('db-session')
        expect(getSessionKeyMock).toHaveBeenCalledWith('user-1')
    })

    it('falls back to LASTFM_SESSION_KEY when database has no session', async () => {
        getSessionKeyMock.mockResolvedValue(null)

        const sessionKey = await getSessionKeyForUser('user-2')

        expect(sessionKey).toBe('env-session')
    })

    it('does not fallback to env key when allowEnvFallback is false', async () => {
        getSessionKeyMock.mockResolvedValue(null)

        const sessionKey = await getSessionKeyForUser('user-3', {
            allowEnvFallback: false,
        })

        expect(sessionKey).toBeNull()
    })

    it('sends signed updateNowPlaying payload', async () => {
        await updateNowPlaying('Artist Name', 'Track Name', 187, 'session-123')

        const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
        const request = lastCall?.[1] as { body: string }
        expect(request.body).toContain('method=track.updateNowPlaying')
        expect(request.body).toContain('artist=Artist+Name')
        expect(request.body).toContain('track=Track+Name')
        expect(request.body).toContain('duration=187')
        expect(request.body).toContain('api_sig=')
    })

    describe('normalizeLastFmArtist', () => {
        it('strips " - Topic" suffix', () => {
            expect(normalizeLastFmArtist('Doja Cat - Topic')).toBe('Doja Cat')
        })

        it('takes first artist when multiple are separated by comma', () => {
            expect(normalizeLastFmArtist('Artist A, Artist B')).toBe('Artist A')
        })

        it('takes first artist when separated by slash', () => {
            expect(normalizeLastFmArtist('Artist A / Artist B')).toBe(
                'Artist A',
            )
        })

        it('returns unchanged when no separators', () => {
            expect(normalizeLastFmArtist('Kendrick Lamar')).toBe(
                'Kendrick Lamar',
            )
        })
    })

    describe('normalizeLastFmTitle', () => {
        it('removes (Official Video) suffix', () => {
            expect(normalizeLastFmTitle('Track Name (Official Video)')).toBe(
                'Track Name',
            )
        })

        it('removes [Official Music Video] suffix', () => {
            expect(
                normalizeLastFmTitle('Track Name [Official Music Video]'),
            ).toBe('Track Name')
        })

        it('removes feat. clause', () => {
            expect(
                normalizeLastFmTitle('Track Name (feat. Other Artist)'),
            ).toBe('Track Name')
        })

        it('removes (ft. Other Artist) bracketed clause', () => {
            expect(normalizeLastFmTitle('Track Name (ft. Other Artist)')).toBe(
                'Track Name',
            )
        })

        it('returns unchanged for clean titles', () => {
            expect(normalizeLastFmTitle('HUMBLE.')).toBe('HUMBLE.')
        })
    })

    describe('getTopTracks', () => {
        it('returns mapped tracks on success', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    toptracks: {
                        track: [
                            {
                                name: 'Song A',
                                artist: { name: 'Artist X' },
                                playcount: '42',
                            },
                        ],
                    },
                }),
            })

            const tracks = await getTopTracks('username', '3month', 5)

            expect(tracks).toHaveLength(1)
            expect(tracks[0]).toEqual({
                artist: 'Artist X',
                title: 'Song A',
                playCount: 42,
            })
        })

        it('returns empty array when fetch fails', async () => {
            fetchMock.mockRejectedValueOnce(new Error('network'))

            const tracks = await getTopTracks('username')

            expect(tracks).toEqual([])
        })

        it('returns empty array when api_key is not configured', async () => {
            delete process.env.LASTFM_API_KEY

            const tracks = await getTopTracks('username')

            expect(tracks).toEqual([])
        })

        it('returns empty array on non-ok response', async () => {
            fetchMock.mockResolvedValueOnce({ ok: false })

            const tracks = await getTopTracks('username')

            expect(tracks).toEqual([])
        })
    })

    describe('getRecentTracks', () => {
        it('returns recent tracks excluding nowplaying', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    recenttracks: {
                        track: [
                            {
                                name: 'Currently Playing',
                                artist: { name: 'Current Artist' },
                                '@attr': { nowplaying: 'true' },
                            },
                            {
                                name: 'Song A',
                                artist: { name: 'Artist A' },
                            },
                            {
                                name: 'Song B',
                                artist: 'Artist B',
                            },
                        ],
                    },
                }),
            })

            const tracks = await getRecentTracks('username', 10)

            expect(tracks).toHaveLength(2)
            expect(tracks).toEqual([
                { artist: 'Artist A', title: 'Song A' },
                { artist: 'Artist B', title: 'Song B' },
            ])
        })

        it('returns empty array when api is not configured', async () => {
            delete process.env.LASTFM_API_KEY

            const tracks = await getRecentTracks('username')

            expect(tracks).toEqual([])
        })

        it('returns empty array on fetch failure', async () => {
            fetchMock.mockRejectedValueOnce(new Error('network error'))

            const tracks = await getRecentTracks('username')

            expect(tracks).toEqual([])
        })

        it('handles artist as string or object', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    recenttracks: {
                        track: [
                            {
                                name: 'Song A',
                                artist: { name: 'Artist A' },
                            },
                            {
                                name: 'Song B',
                                artist: 'Artist B',
                            },
                        ],
                    },
                }),
            })

            const tracks = await getRecentTracks('username')

            expect(tracks[0].artist).toBe('Artist A')
            expect(tracks[1].artist).toBe('Artist B')
        })

        it('handles artist as #text object (actual Last.fm API format)', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    recenttracks: {
                        track: [
                            {
                                name: 'Song A',
                                artist: { '#text': 'Oasis', mbid: '' },
                            },
                            {
                                name: 'Song B',
                                artist: { '#text': 'Blur', mbid: '123' },
                            },
                        ],
                    },
                }),
            })

            const tracks = await getRecentTracks('username')

            expect(tracks[0].artist).toBe('Oasis')
            expect(tracks[1].artist).toBe('Blur')
        })

        it('uses default limit when not specified', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ recenttracks: { track: [] } }),
            })

            await getRecentTracks('username')

            const call = fetchMock.mock.calls[0]?.[0] as string
            expect(call).toContain('limit=20')
        })
    })

    describe('getSimilarTracks', () => {
        it('returns similar tracks with match score', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    similartracks: {
                        track: [
                            {
                                name: 'Similar Song',
                                artist: { name: 'Similar Artist' },
                                match: '0.85',
                            },
                            {
                                name: 'Other Song',
                                artist: { name: 'Other Artist' },
                                match: '0.42',
                            },
                        ],
                    },
                }),
            })

            const tracks = await getSimilarTracks('Artist', 'Track', 5)

            expect(tracks).toHaveLength(2)
            expect(tracks[0]).toEqual({
                artist: 'Similar Artist',
                title: 'Similar Song',
                match: 0.85,
            })
            expect(tracks[1].match).toBe(0.42)
        })

        it('returns empty array when api is not configured', async () => {
            delete process.env.LASTFM_API_KEY

            const tracks = await getSimilarTracks('Artist', 'Track')

            expect(tracks).toEqual([])
        })

        it('returns empty array on fetch failure', async () => {
            fetchMock.mockRejectedValueOnce(new Error('network error'))

            const tracks = await getSimilarTracks('Artist', 'Track')

            expect(tracks).toEqual([])
        })

        it('parses match as float, defaulting to 0 on invalid', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    similartracks: {
                        track: [
                            {
                                name: 'Song',
                                artist: { name: 'Artist' },
                                match: 'invalid',
                            },
                        ],
                    },
                }),
            })

            const tracks = await getSimilarTracks('Artist', 'Track')

            expect(tracks[0].match).toBe(0)
        })

        it('encodes artist and title in query parameters', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ similartracks: { track: [] } }),
            })

            await getSimilarTracks('The Artist', 'Song & Title')

            const call = fetchMock.mock.calls[0]?.[0] as string
            expect(call).toContain('artist=The%20Artist')
            expect(call).toContain('track=Song%20%26%20Title')
        })

        it('uses default limit when not specified', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ similartracks: { track: [] } }),
            })

            await getSimilarTracks('Artist', 'Track')

            const call = fetchMock.mock.calls[0]?.[0] as string
            expect(call).toContain('limit=10')
        })
    })

    describe('isLastFmInvalidSessionError', () => {
        it('detects invalid-session payload errors', () => {
            const error = new Error(
                'Last.fm track.scrobble: 403 {"message":"Invalid session key - Please re-authenticate","error":9}',
            )

            expect(isLastFmInvalidSessionError(error)).toBe(true)
        })

        it('returns false for non-session errors', () => {
            expect(
                isLastFmInvalidSessionError(new Error('network timeout')),
            ).toBe(false)
            expect(isLastFmInvalidSessionError('bad')).toBe(false)
        })

        it('detects payload errors when error code has spacing', () => {
            const error = new Error(
                'Last.fm track.scrobble: 403 {"message":"Session expired","error": 9}',
            )

            expect(isLastFmInvalidSessionError(error)).toBe(true)
        })
    })

    describe('getTagTopTracks', () => {
        it('returns mapped tracks from tag on success', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    toptracks: {
                        track: [
                            {
                                name: 'Rock Track 1',
                                artist: { name: 'Rock Artist' },
                            },
                            {
                                name: 'Rock Track 2',
                                artist: { name: 'Another Rock Artist' },
                            },
                        ],
                    },
                }),
            })

            const tracks = await getTagTopTracks('rock', 10)

            expect(tracks).toHaveLength(2)
            expect(tracks[0]).toEqual({
                artist: 'Rock Artist',
                title: 'Rock Track 1',
            })
            expect(tracks[1]).toEqual({
                artist: 'Another Rock Artist',
                title: 'Rock Track 2',
            })
        })

        it('uses default limit when not specified', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ toptracks: { track: [] } }),
            })

            await getTagTopTracks('indie')

            const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
            const url = lastCall?.[0] as string
            expect(url).toContain('limit=30')
        })

        it('returns empty array when api_key is not configured', async () => {
            delete process.env.LASTFM_API_KEY

            const tracks = await getTagTopTracks('rock')

            expect(tracks).toEqual([])
        })

        it('returns empty array when fetch fails', async () => {
            fetchMock.mockRejectedValueOnce(new Error('network error'))

            const tracks = await getTagTopTracks('jazz')

            expect(tracks).toEqual([])
        })

        it('returns empty array on non-ok response', async () => {
            fetchMock.mockResolvedValueOnce({ ok: false })

            const tracks = await getTagTopTracks('chillhop')

            expect(tracks).toEqual([])
        })

        it('returns empty array when toptracks is missing', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            })

            const tracks = await getTagTopTracks('pop')

            expect(tracks).toEqual([])
        })
    })

    describe('getArtistTopTags', () => {
        it('returns mapped, lowercased tags on success', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    toptags: {
                        tag: [
                            { name: 'Indie', count: 100 },
                            { name: 'ALTERNATIVE', count: 80 },
                            { name: 'Rock', count: 60 },
                        ],
                    },
                }),
            })

            const tags = await getArtistTopTags('Radiohead')

            expect(tags).toEqual(['indie', 'alternative', 'rock'])
        })

        it('respects the limit argument', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    toptags: {
                        tag: Array.from({ length: 12 }, (_, i) => ({
                            name: `tag${i}`,
                        })),
                    },
                }),
            })

            const tags = await getArtistTopTags('Muse', 3)

            expect(tags).toHaveLength(3)
        })

        it('filters out tags without a name', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    toptags: {
                        tag: [
                            { name: 'jazz' },
                            { name: '' },
                            { name: '   ' },
                            { name: 'fusion' },
                        ],
                    },
                }),
            })

            const tags = await getArtistTopTags('Snarky Puppy')

            expect(tags).toEqual(['jazz', 'fusion'])
        })

        it('returns empty array when artist is blank', async () => {
            const tags = await getArtistTopTags('   ')

            expect(tags).toEqual([])
            expect(fetchMock).not.toHaveBeenCalled()
        })

        it('returns empty array when LASTFM_API_KEY is not configured', async () => {
            delete process.env.LASTFM_API_KEY

            const tags = await getArtistTopTags('Radiohead')

            expect(tags).toEqual([])
            expect(fetchMock).not.toHaveBeenCalled()
        })

        it('returns the cached value on a second call within TTL', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    toptags: { tag: [{ name: 'electronic' }] },
                }),
            })

            const first = await getArtistTopTags('Aphex Twin')
            const second = await getArtistTopTags('aphex twin')

            expect(first).toEqual(['electronic'])
            expect(second).toEqual(['electronic'])
            expect(fetchMock).toHaveBeenCalledTimes(1)
        })

        it('returns empty array and swallows fetch errors', async () => {
            fetchMock.mockRejectedValueOnce(new Error('network'))

            const tags = await getArtistTopTags('Some Unique Artist Name')

            expect(tags).toEqual([])
        })

        it('returns empty array on non-ok response without caching', async () => {
            const artist = 'Non-Ok Artist'
            fetchMock.mockResolvedValueOnce({ ok: false })
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    toptags: { tag: [{ name: 'rock' }] },
                }),
            })

            const first = await getArtistTopTags(artist)
            const second = await getArtistTopTags(artist)

            expect(first).toEqual([])
            expect(second).toEqual(['rock'])
            expect(fetchMock).toHaveBeenCalledTimes(2)
        })

        it('returns empty array on Last.fm error payload without caching', async () => {
            const artist = 'Error Payload Artist'
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ error: 6, message: 'The artist you supplied could not be found' }),
            })
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    toptags: { tag: [{ name: 'pop' }] },
                }),
            })

            const first = await getArtistTopTags(artist)
            const second = await getArtistTopTags(artist)

            expect(first).toEqual([])
            expect(second).toEqual(['pop'])
            expect(fetchMock).toHaveBeenCalledTimes(2)
        })

        it('keys the cache by (artist, limit) so different limits re-fetch', async () => {
            const artist = 'Cache Limit Artist'
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    toptags: {
                        tag: Array.from({ length: 10 }, (_, i) => ({ name: `t${i}` })),
                    },
                }),
            })
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    toptags: {
                        tag: Array.from({ length: 10 }, (_, i) => ({ name: `t${i}` })),
                    },
                }),
            })

            const small = await getArtistTopTags(artist, 2)
            const large = await getArtistTopTags(artist, 5)

            expect(small).toHaveLength(2)
            expect(large).toHaveLength(5)
            expect(fetchMock).toHaveBeenCalledTimes(2)
        })
    })

    describe('getLovedTracks', () => {
        it('returns loved tracks array on success', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    lovedtracks: {
                        track: [
                            { name: 'Loved Song', artist: { name: 'Artist A' } },
                            { name: 'Another Fave', artist: { name: 'Artist B' } },
                        ],
                    },
                }),
            })

            const result = await getLovedTracks('testuser', 10)

            expect(result).toEqual([
                { artist: 'Artist A', title: 'Loved Song' },
                { artist: 'Artist B', title: 'Another Fave' },
            ])
        })

        it('returns empty array on non-ok response', async () => {
            fetchMock.mockResolvedValueOnce({ ok: false })
            const result = await getLovedTracks('testuser')
            expect(result).toEqual([])
        })

        it('returns empty array when lovedtracks missing', async () => {
            fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
            const result = await getLovedTracks('testuser')
            expect(result).toEqual([])
        })

        it('returns empty array on fetch error', async () => {
            fetchMock.mockRejectedValueOnce(new Error('network'))
            const result = await getLovedTracks('testuser')
            expect(result).toEqual([])
        })

        it('handles artist as #text object (actual Last.fm API format)', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    lovedtracks: {
                        track: [
                            {
                                name: 'Wonderwall',
                                artist: { '#text': 'Oasis', mbid: '' },
                            },
                        ],
                    },
                }),
            })

            const result = await getLovedTracks('testuser')

            expect(result).toEqual([{ artist: 'Oasis', title: 'Wonderwall' }])
        })
    })
})
