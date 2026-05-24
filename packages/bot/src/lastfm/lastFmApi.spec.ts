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
    scrobble,
    normalizeLastFmArtist,
    normalizeLastFmTitle,
    getTopTracks,
    getRecentTracks,
    getSimilarTracks,
    getTagTopTracks,
    getLovedTracks,
    getArtistTopTags,
    parseArtists,
    getTrackMetadata,
    __resetMetadataCacheForTests,
    LastFmSessionExpiredError,
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

const debugLogMock = jest.fn()

jest.mock('@lucky/shared/utils/general/log', () => ({
    debugLog: (params: unknown) => debugLogMock(params),
    warnLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    successLog: jest.fn(),
}))

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

    it.each([
        [
            'getSessionKeyForUser cases',
            async () => {
                getSessionKeyMock.mockResolvedValue('db-session')
                let sessionKey = await getSessionKeyForUser('user-1')
                expect(sessionKey).toBe('db-session')
                expect(getSessionKeyMock).toHaveBeenCalledWith('user-1')

                getSessionKeyMock.mockResolvedValue(null)
                sessionKey = await getSessionKeyForUser('user-2')
                expect(sessionKey).toBe('env-session')

                sessionKey = await getSessionKeyForUser('user-3', {
                    allowEnvFallback: false,
                })
                expect(sessionKey).toBeNull()
            },
        ],
    ])('%s', async (_label, test) => {
        await test()
    })

    it.each([
        [
            'updateNowPlaying cases',
            async () => {
                await updateNowPlaying(
                    'Artist Name',
                    'Track Name',
                    187,
                    'session-123',
                    {
                        album: 'Test Album',
                        albumArtist: 'Album Artist',
                        mbid: 'test-mbid-123',
                    },
                )

                let lastCall =
                    fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
                let request = lastCall?.[1] as { body: string }
                expect(request.body).toContain('method=track.updateNowPlaying')
                expect(request.body).toContain('artist=Artist+Name')
                expect(request.body).toContain('track=Track+Name')
                expect(request.body).toContain('duration=187')
                expect(request.body).toContain('api_sig=')
                expect(request.body).toContain('album=Test+Album')
                expect(request.body).toContain('albumArtist=Album+Artist')
                expect(request.body).toContain('mbid=test-mbid-123')

                fetchMock.mockClear()
                await updateNowPlaying(
                    'Artist Name',
                    'Track Name',
                    187,
                    'session-123',
                )

                lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
                request = lastCall?.[1] as { body: string }
                expect(request.body).not.toContain('album=')
                expect(request.body).not.toContain('albumArtist=')
                expect(request.body).not.toContain('mbid=')
            },
        ],
    ])('%s', async (_label, test) => {
        await test()
    })

    describe('blank-input guard', () => {
        it.each([
            [
                'test cases',
                async () => {
                    await updateNowPlaying('', 'Track Name', 187, 'session-123')
                    expect(fetchMock).not.toHaveBeenCalled()
                    await updateNowPlaying(
                        'Artist Name',
                        '',
                        187,
                        'session-123',
                    )
                    expect(fetchMock).not.toHaveBeenCalled()
                    await updateNowPlaying(
                        '   ',
                        'Track Name',
                        187,
                        'session-123',
                    )
                    expect(fetchMock).not.toHaveBeenCalled()
                    await updateNowPlaying(
                        'Artist Name',
                        '   ',
                        187,
                        'session-123',
                    )
                    expect(fetchMock).not.toHaveBeenCalled()
                },
            ],
        ])(
            'returns early without calling API when %s',
            async (_label, test) => {
                await test()
            },
        )
    })

    describe('normalizeLastFmArtist', () => {
        it.each([
            [
                'test cases',
                async () => {
                    expect(normalizeLastFmArtist('Doja Cat - Topic')).toBe(
                        'Doja Cat',
                    )
                    expect(normalizeLastFmArtist('Artist A, Artist B')).toBe(
                        'Artist A',
                    )
                    expect(normalizeLastFmArtist('Artist A / Artist B')).toBe(
                        'Artist A',
                    )
                    expect(normalizeLastFmArtist('Kendrick Lamar')).toBe(
                        'Kendrick Lamar',
                    )
                },
            ],
        ])('%s: normalizes correctly', (_label, test) => {
            return test()
        })
    })

    describe('normalizeLastFmTitle', () => {
        it.each([
            [
                'test cases',
                async () => {
                    expect(
                        normalizeLastFmTitle('Track Name (Official Video)'),
                    ).toBe('Track Name')
                    expect(
                        normalizeLastFmTitle(
                            'Track Name [Official Music Video]',
                        ),
                    ).toBe('Track Name')
                    expect(
                        normalizeLastFmTitle('Track Name (feat. Other Artist)'),
                    ).toBe('Track Name')
                    expect(
                        normalizeLastFmTitle('Track Name (ft. Other Artist)'),
                    ).toBe('Track Name')
                    expect(normalizeLastFmTitle('HUMBLE.')).toBe('HUMBLE.')
                },
            ],
        ])('%s: normalizes correctly', (_label, test) => {
            return test()
        })
    })

    describe('LastFmSessionExpiredError', () => {
        it('creates error with default and custom messages', () => {
            const defaultError = new LastFmSessionExpiredError()
            expect(defaultError).toBeInstanceOf(Error)
            expect(defaultError.message).toBe(
                'Last.fm session key has expired (error code 9)',
            )
            expect(defaultError.name).toBe('LastFmSessionExpiredError')

            const customError = new LastFmSessionExpiredError(
                'Custom expiry message',
            )
            expect(customError.message).toBe('Custom expiry message')
            expect(customError.name).toBe('LastFmSessionExpiredError')
            expect(customError instanceof Error).toBe(true)
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

        it.each([
            [
                'error cases',
                async () => {
                    fetchMock.mockRejectedValueOnce(new Error('network'))
                    let tracks = await getTopTracks('username')
                    expect(tracks).toEqual([])
                    fetchMock.mockResolvedValueOnce({ ok: false })
                    tracks = await getTopTracks('username')
                    expect(tracks).toEqual([])
                    delete process.env.LASTFM_API_KEY
                    tracks = await getTopTracks('username')
                    expect(tracks).toEqual([])
                },
            ],
        ])('returns empty array when %s', async (_label, test) => {
            await test()
        })
    })

    describe('getRecentTracks', () => {
        it('returns recent tracks with artist format handling, excludes nowplaying, and uses default limit', async () => {
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
                            {
                                name: 'Song C',
                                artist: { '#text': 'Oasis', mbid: '' },
                            },
                        ],
                    },
                }),
            })

            const tracks = await getRecentTracks('username', 10)

            expect(tracks).toHaveLength(3)
            expect(tracks[0]).toEqual({ artist: 'Artist A', title: 'Song A' })
            expect(tracks[1]).toEqual({ artist: 'Artist B', title: 'Song B' })
            expect(tracks[2].artist).toBe('Oasis')

            const call = fetchMock.mock.calls[0]?.[0] as string
            expect(call).toContain('limit=10')

            // Test default limit
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ recenttracks: { track: [] } }),
            })

            await getRecentTracks('username')

            const defaultCall = fetchMock.mock.calls[1]?.[0] as string
            expect(defaultCall).toContain('limit=20')
        })

        it.each([
            [
                'error cases',
                async () => {
                    delete process.env.LASTFM_API_KEY
                    let tracks = await getRecentTracks('username')
                    expect(tracks).toEqual([])
                    process.env.LASTFM_API_KEY = 'api-key'
                    fetchMock.mockRejectedValueOnce(new Error('network error'))
                    tracks = await getRecentTracks('username')
                    expect(tracks).toEqual([])
                },
            ],
        ])('returns empty array when %s', async (_label, test) => {
            await test()
        })
    })

    describe('getSimilarTracks', () => {
        it('returns similar tracks with match parsing, query encoding, and default limit', async () => {
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
                                match: 'invalid',
                            },
                        ],
                    },
                }),
            })

            const tracks = await getSimilarTracks(
                'The Artist & Co',
                'Song Title',
                5,
            )

            expect(tracks).toHaveLength(2)
            expect(tracks[0]).toEqual({
                artist: 'Similar Artist',
                title: 'Similar Song',
                match: 0.85,
            })
            expect(tracks[1].match).toBe(0)

            const call = fetchMock.mock.calls[0]?.[0] as string
            expect(call).toContain('artist=The%20Artist%20%26%20Co')
            expect(call).toContain('track=Song%20Title')
            expect(call).toContain('limit=5')
        })

        it.each([
            [
                'error cases',
                async () => {
                    delete process.env.LASTFM_API_KEY
                    let tracks = await getSimilarTracks('Artist', 'Track')
                    expect(tracks).toEqual([])
                    process.env.LASTFM_API_KEY = 'api-key'
                    fetchMock.mockRejectedValueOnce(new Error('network error'))
                    tracks = await getSimilarTracks('Artist', 'Track')
                    expect(tracks).toEqual([])
                },
            ],
        ])('returns empty array when %s', async (_label, test) => {
            await test()
        })
    })

    describe('isLastFmInvalidSessionError', () => {
        it.each([
            [
                'test cases',
                async () => {
                    expect(
                        isLastFmInvalidSessionError(
                            new Error(
                                'Last.fm track.scrobble: 403 {"message":"Invalid session key - Please re-authenticate","error":9}',
                            ),
                        ),
                    ).toBe(true)
                    expect(
                        isLastFmInvalidSessionError(
                            new Error(
                                'Last.fm track.scrobble: 403 {"message":"Session expired","error": 9}',
                            ),
                        ),
                    ).toBe(true)
                    expect(
                        isLastFmInvalidSessionError(
                            new LastFmSessionExpiredError(),
                        ),
                    ).toBe(true)
                    expect(
                        isLastFmInvalidSessionError(
                            new LastFmSessionExpiredError(
                                'totally different message',
                            ),
                        ),
                    ).toBe(true)
                    expect(
                        isLastFmInvalidSessionError(
                            new Error('network timeout'),
                        ),
                    ).toBe(false)
                    expect(isLastFmInvalidSessionError('bad')).toBe(false)
                },
            ],
        ])('detects session errors: %s', (_label, test) => {
            return test()
        })
    })

    describe('getTagTopTracks', () => {
        it('returns mapped tracks from tag on success; respects and defaults limit', async () => {
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

            // Test default limit
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ toptracks: { track: [] } }),
            })

            await getTagTopTracks('indie')

            const lastCall =
                fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
            const url = lastCall?.[0] as string
            expect(url).toContain('limit=30')
        })

        it.each([
            [
                'error cases',
                async () => {
                    delete process.env.LASTFM_API_KEY
                    let tracks = await getTagTopTracks('jazz')
                    expect(tracks).toEqual([])
                    process.env.LASTFM_API_KEY = 'api-key'
                    fetchMock.mockRejectedValueOnce(new Error('network error'))
                    tracks = await getTagTopTracks('jazz')
                    expect(tracks).toEqual([])
                    fetchMock.mockResolvedValueOnce({ ok: false })
                    tracks = await getTagTopTracks('jazz')
                    expect(tracks).toEqual([])
                    fetchMock.mockResolvedValueOnce({
                        ok: true,
                        json: async () => ({}),
                    })
                    tracks = await getTagTopTracks('jazz')
                    expect(tracks).toEqual([])
                },
            ],
        ])('returns empty array when %s', async (_label, test) => {
            await test()
        })
    })

    describe('getArtistTopTags', () => {
        it('returns mapped, lowercased tags on success; respects limit; filters empty names; caches and keys by (artist, limit)', async () => {
            // Initial fetch for artist/limit combo 1
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

            // Cached call should not re-fetch
            const second = await getArtistTopTags('Radiohead')
            expect(second).toEqual(['indie', 'alternative', 'rock'])
            expect(fetchMock).toHaveBeenCalledTimes(1)

            // Respect limit argument
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
            const limited = await getArtistTopTags('Muse', 3)
            expect(limited).toHaveLength(3)

            // Filter empty names
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
            const filtered = await getArtistTopTags('Snarky Puppy')
            expect(filtered).toEqual(['jazz', 'fusion'])
        })

        it.each([
            [
                'guard cases',
                async () => {
                    let tags = await getArtistTopTags('   ')
                    expect(tags).toEqual([])
                    expect(fetchMock).not.toHaveBeenCalled()
                    delete process.env.LASTFM_API_KEY
                    tags = await getArtistTopTags('Radiohead')
                    expect(tags).toEqual([])
                    expect(fetchMock).not.toHaveBeenCalled()
                },
            ],
        ])('guards early: %s', async (_label, test) => {
            await test()
        })

        it.each([
            [
                'error cases',
                async () => {
                    fetchMock.mockRejectedValueOnce(new Error('network'))
                    let tags = await getArtistTopTags('Some Unique Artist Name')
                    expect(tags).toEqual([])
                    fetchMock.mockResolvedValueOnce({ ok: false })
                    tags = await getArtistTopTags('Artist')
                    expect(tags).toEqual([])
                    fetchMock.mockResolvedValueOnce({
                        ok: true,
                        json: async () => ({ error: 6, message: 'not found' }),
                    })
                    tags = await getArtistTopTags('Artist')
                    expect(tags).toEqual([])
                },
            ],
        ])('returns empty and does not cache: %s', async (_label, test) => {
            await test()
        })
    })

    describe('getLovedTracks', () => {
        it('returns loved tracks array on success with artist format handling', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    lovedtracks: {
                        track: [
                            {
                                name: 'Loved Song',
                                artist: { name: 'Artist A' },
                            },
                            {
                                name: 'Another Fave',
                                artist: { name: 'Artist B' },
                            },
                            {
                                name: 'Wonderwall',
                                artist: { '#text': 'Oasis', mbid: '' },
                            },
                        ],
                    },
                }),
            })

            const result = await getLovedTracks('testuser', 10)

            expect(result).toHaveLength(3)
            expect(result[0]).toEqual({
                artist: 'Artist A',
                title: 'Loved Song',
            })
            expect(result[2]).toEqual({ artist: 'Oasis', title: 'Wonderwall' })
        })

        it.each([
            [
                'error cases',
                async () => {
                    fetchMock.mockResolvedValueOnce({ ok: false })
                    let result = await getLovedTracks('user', 10)
                    expect(result).toEqual([])
                    fetchMock.mockResolvedValueOnce({
                        ok: true,
                        json: async () => ({}),
                    })
                    result = await getLovedTracks('user', 10)
                    expect(result).toEqual([])
                    fetchMock.mockRejectedValueOnce(new Error('network'))
                    result = await getLovedTracks('user', 10)
                    expect(result).toEqual([])
                },
            ],
        ])('returns empty array on %s', async (_label, test) => {
            await test()
        })
    })

    describe('parseArtists', () => {
        it.each([
            ['empty string', '', '', []],
            ['single artist', 'Radiohead', 'Radiohead', []],
            ['- Topic suffix', 'Radiohead - Topic', 'Radiohead', []],
            ['feat. separator', 'Drake feat. Rihanna', 'Drake', ['Rihanna']],
            [
                'ft. separator',
                'Post Malone ft. Swae Lee',
                'Post Malone',
                ['Swae Lee'],
            ],
            ['& separator', 'Jay-Z & Kanye West', 'Jay-Z', ['Kanye West']],
            [
                '× separator',
                'James Blake × Frank Ocean',
                'James Blake',
                ['Frank Ocean'],
            ],
            [
                'word-boundary x',
                'Travis Scott x Drake',
                'Travis Scott',
                ['Drake'],
            ],
            ['vs. separator', 'Biggie vs. Tupac', 'Biggie', ['Tupac']],
            [
                'with separator',
                'Eric Clapton with B.B. King',
                'Eric Clapton',
                ['B.B. King'],
            ],
            [
                'case-insensitive',
                'Artist FEAT. Featured',
                'Artist',
                ['Featured'],
            ],
            [
                'no split on x inside word',
                'Rex Orange County',
                'Rex Orange County',
                [],
            ],
            [
                'multiple featured in chain',
                'Kendrick Lamar feat. Drake & J. Cole',
                'Kendrick Lamar',
                [],
            ],
        ])(
            '%s: splits correctly',
            (_label, input, expectedPrimary, expectedFeatured) => {
                const result = parseArtists(input)
                expect(result.primary).toBe(expectedPrimary)
                expect(result.featured).toEqual(
                    expect.arrayContaining(expectedFeatured),
                )
            },
        )
    })

    describe('getTrackMetadata', () => {
        beforeEach(() => {
            process.env.LASTFM_API_KEY = 'test-key'
            process.env.LASTFM_API_SECRET = 'test-secret'
            // Module-level caches persist across tests; reset so each case
            // starts clean and ordering can't silently leak fixtures.
            __resetMetadataCacheForTests()
        })

        afterEach(() => {
            jest.useRealTimers()
        })

        it.each([
            [
                'blank guards',
                async () => {
                    let result = await getTrackMetadata('', 'Track')
                    expect(result).toBeNull()
                    expect(fetchMock).not.toHaveBeenCalled()
                    result = await getTrackMetadata('Artist', '')
                    expect(result).toBeNull()
                    result = await getTrackMetadata('   ', 'Track')
                    expect(result).toBeNull()
                    result = await getTrackMetadata('Artist', '   ')
                    expect(result).toBeNull()
                },
            ],
        ])('returns null without fetching on %s', async (_label, test) => {
            await test()
        })

        it('returns canonical metadata on successful fetch; caches and reuses without re-fetching; provides defaults for missing fields', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    track: {
                        name: 'Bohemian Rhapsody',
                        artist: { name: 'Queen' },
                        album: {
                            title: 'A Night at the Opera',
                            artist: 'Queen',
                        },
                        mbid: 'abc-123',
                        duration: '354000',
                    },
                }),
            })

            const result = await getTrackMetadata('Queen', 'Bohemian Rhapsody')

            expect(result).toEqual({
                artist: 'Queen',
                title: 'Bohemian Rhapsody',
                album: 'A Night at the Opera',
                albumArtist: 'Queen',
                mbid: 'abc-123',
                duration: 354000,
            })

            // Test caching: second call should not re-fetch
            const cached = await getTrackMetadata('queen', 'bohemian rhapsody')
            expect(cached).toEqual(result)
            expect(fetchMock).toHaveBeenCalledTimes(1)

            // Test defaults for missing fields
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    track: {
                        name: 'Some Track',
                        artist: { name: 'Some Artist' },
                    },
                }),
            })

            const withDefaults = await getTrackMetadata(
                'Some Artist',
                'Some Track',
            )
            expect(withDefaults).not.toBeNull()
            expect(withDefaults!.album).toBe('')
            expect(withDefaults!.mbid).toBe('')
            expect(withDefaults!.duration).toBe(0)
            expect(withDefaults!.albumArtist).toBe('')
        })

        it('re-fetches when cached entry has expired TTL', async () => {
            jest.useFakeTimers()
            const now = 1000000

            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    track: {
                        name: 'First Version',
                        artist: { name: 'Artist A' },
                    },
                }),
            })

            jest.setSystemTime(now)
            const first = await getTrackMetadata('Artist A', 'First Version')
            expect(first!.title).toBe('First Version')
            expect(fetchMock).toHaveBeenCalledTimes(1)

            jest.setSystemTime(now + 86400001)

            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    track: {
                        name: 'Second Version',
                        artist: { name: 'Artist A' },
                    },
                }),
            })

            const second = await getTrackMetadata('Artist A', 'First Version')
            expect(second!.title).toBe('Second Version')
            expect(fetchMock).toHaveBeenCalledTimes(2)
        })

        it.each([
            [
                'error cases',
                async () => {
                    fetchMock.mockResolvedValueOnce({ ok: false })
                    let result = await getTrackMetadata('Artist', 'Track')
                    expect(result).toBeNull()
                    fetchMock.mockResolvedValueOnce({
                        ok: true,
                        json: async () => ({
                            error: 6,
                            message: 'Track not found',
                        }),
                    })
                    result = await getTrackMetadata('Nobody', 'Nonexistent')
                    expect(result).toBeNull()
                    fetchMock.mockResolvedValueOnce({
                        ok: true,
                        json: async () => ({}),
                    })
                    result = await getTrackMetadata('Artist', 'Track')
                    expect(result).toBeNull()
                    fetchMock.mockRejectedValueOnce(new Error('network'))
                    result = await getTrackMetadata('Artist', 'Track')
                    expect(result).toBeNull()
                },
            ],
        ])('returns null on %s', async (_label, test) => {
            await test()
        })

        it('deduplicates concurrent requests and extracts primary artist from collaborations', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    track: {
                        name: 'Dedup Test Track',
                        artist: { name: 'Dedup Test Artist' },
                        album: { title: 'Dedup Album' },
                    },
                }),
            })

            const [result1, result2] = await Promise.all([
                getTrackMetadata('Dedup Test Artist', 'Dedup Test Track'),
                getTrackMetadata('Dedup Test Artist', 'Dedup Test Track'),
            ])

            expect(result1).toEqual({
                artist: 'Dedup Test Artist',
                title: 'Dedup Test Track',
                album: 'Dedup Album',
                albumArtist: '',
                mbid: '',
                duration: 0,
            })
            expect(result2).toEqual(result1)
            expect(fetchMock).toHaveBeenCalledTimes(1)

            // Also test collaboration handling
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    track: {
                        name: 'Hotline Bling',
                        artist: { name: 'Drake' },
                        album: { title: 'Views' },
                    },
                }),
            })

            await getTrackMetadata('Drake feat. Rihanna', 'Hotline Bling')
            const url = String(fetchMock.mock.calls[1]![0])
            expect(url).toContain('artist=Drake&')
            expect(url).not.toContain('Rihanna')
        })
    })

    describe('scrobble', () => {
        it('sends signed scrobble payload with timestamp and metadata handling', async () => {
            const timestamp = Math.floor(Date.now() / 1000)
            await scrobble(
                'Artist Name',
                'Track Name',
                timestamp,
                187,
                'session-123',
                {
                    album: 'Test Album',
                    albumArtist: 'Album Artist',
                    mbid: 'test-mbid-456',
                },
            )

            const lastCall =
                fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
            const request = lastCall?.[1] as { body: string }
            expect(request.body).toContain('method=track.scrobble')
            expect(request.body).toContain('artist=Artist+Name')
            expect(request.body).toContain('track=Track+Name')
            expect(request.body).toContain(`timestamp=${timestamp}`)
            expect(request.body).toContain('duration=187')
            expect(request.body).toContain('api_sig=')
            expect(request.body).toContain('album=Test+Album')
            expect(request.body).toContain('albumArtist=Album+Artist')
            expect(request.body).toContain('mbid=test-mbid-456')
        })

        it('omits metadata fields when not provided to scrobble', async () => {
            const timestamp = Math.floor(Date.now() / 1000)
            await scrobble(
                'Artist Name',
                'Track Name',
                timestamp,
                187,
                'session-123',
            )

            const lastCall =
                fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
            const request = lastCall?.[1] as { body: string }
            expect(request.body).not.toContain('album=')
            expect(request.body).not.toContain('albumArtist=')
            expect(request.body).not.toContain('mbid=')
        })

        it.each([
            [
                'guard cases',
                async () => {
                    const timestamp = Math.floor(Date.now() / 1000)
                    await scrobble(
                        'Artist Name',
                        'Track Name',
                        timestamp,
                        187,
                        null,
                    )
                    expect(fetchMock).not.toHaveBeenCalled()
                    await scrobble(
                        '  ',
                        'Track Name',
                        timestamp,
                        187,
                        'session-123',
                    )
                    expect(fetchMock).not.toHaveBeenCalled()
                    await scrobble(
                        'Artist Name',
                        '  ',
                        timestamp,
                        187,
                        'session-123',
                    )
                    expect(fetchMock).not.toHaveBeenCalled()
                },
            ],
        ])(
            'returns early without calling API when %s',
            async (_label, test) => {
                await test()
            },
        )
    })
})
