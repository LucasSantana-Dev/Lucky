import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'

const warnLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    warnLog: (...a: unknown[]) => warnLogMock(...a),
}))

import {
    logSpotifyApiFailures,
    reportSpotifyApiFailure,
    resetSpotifyApiFailureLogForTests,
    retryAfterMs,
} from './spotifyApiFailureLog'

const SEARCH_URL =
    'https://api.spotify.com/v1/search/?q=beauty%20and%20a%20beat&type=track&limit=10&market=US'

// Same shape as discord-player-spotify 1.1.9: fetchData throws on a non-2xx
// answer and search() swallows whatever it throws.
function fakeExtractor(fetchData: (url: string) => Promise<Response>) {
    const internal = {
        fetchData,
        async search(query: string) {
            try {
                await this.fetchData(`${SEARCH_URL}&query=${query}`)
                return []
            } catch {
                return null
            }
        },
    }
    return { internal }
}

describe('logSpotifyApiFailures', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        resetSpotifyApiFailureLogForTests()
    })

    it('logs the HTTP status that search() would otherwise swallow', async () => {
        const extractor = fakeExtractor(async () => {
            throw new Error('Failed to fetch Spotify data: 429')
        })
        logSpotifyApiFailures(extractor)

        await expect(extractor.internal.search('x')).resolves.toBeNull()

        const failureLogs = warnLogMock.mock.calls.filter(
            (call) =>
                (call[0] as { message: string }).message ===
                'Spotify extractor request failed',
        )
        expect(failureLogs).toHaveLength(1)
        expect(warnLogMock).toHaveBeenCalledWith({
            message: 'Spotify extractor request failed',
            data: expect.objectContaining({
                status: '429',
                endpoint: '/v1/search/',
                hint: expect.stringContaining('QUOTA_EXCEEDED'),
            }),
        })
    })

    it('never logs the query string, which carries the search text', async () => {
        const extractor = fakeExtractor(async () => {
            throw new Error('Failed to fetch Spotify data: 403')
        })
        logSpotifyApiFailures(extractor)

        await extractor.internal.search('x')

        expect(JSON.stringify(warnLogMock.mock.calls)).not.toContain('beauty')
    })

    it('passes a successful response through without logging', async () => {
        const response = new Response('{}')
        const extractor = fakeExtractor(async () => response)
        logSpotifyApiFailures(extractor)

        await expect(extractor.internal.fetchData(SEARCH_URL)).resolves.toBe(
            response,
        )
        expect(warnLogMock).not.toHaveBeenCalled()
    })

    it('reports a token failure, which has no status', async () => {
        const extractor = fakeExtractor(async () => {
            throw new Error('Failed to retrieve access token from Spotify.')
        })
        logSpotifyApiFailures(extractor)

        await extractor.internal.search('x')

        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: 'none',
                    error: 'Failed to retrieve access token from Spotify.',
                }),
            }),
        )
    })

    it('warns once and leaves the extractor alone when its internals changed', () => {
        logSpotifyApiFailures({ id: 'x' })
        logSpotifyApiFailures(null)

        expect(warnLogMock).toHaveBeenCalledTimes(1)
        expect(warnLogMock).toHaveBeenCalledWith({
            message: expect.stringContaining('internals changed'),
        })
    })
})

describe('reportSpotifyApiFailure', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        resetSpotifyApiFailureLogForTests()
    })

    const failed = (status: number) =>
        new Error(`Failed to fetch Spotify data: ${status}`)

    it('logs each status at most once per 5 minutes', () => {
        reportSpotifyApiFailure(SEARCH_URL, failed(429), 0)
        reportSpotifyApiFailure(SEARCH_URL, failed(429), 60_000)
        reportSpotifyApiFailure(SEARCH_URL, failed(403), 60_000)
        reportSpotifyApiFailure(SEARCH_URL, failed(429), 5 * 60_000)

        const statuses = warnLogMock.mock.calls.map(
            (call) => (call[0] as { data: { status: string } }).data.status,
        )
        expect(statuses).toEqual(['429', '403', '429'])
    })
})

describe('Spotify API block after a 429', () => {
    const realFetch = globalThis.fetch
    const fetchMock = jest.fn<typeof fetch>()
    let now = 0

    // Same flow as discord-player-spotify 1.1.9: fetchData() calls the global
    // fetch and throws on a non-2xx answer, dropping the response headers.
    function libraryExtractor() {
        const internal = {
            async fetchData(url: string) {
                const res = await fetch(url)
                if (!res.ok)
                    throw new Error(
                        `Failed to fetch Spotify data: ${res.status}`,
                    )
                return res
            },
            async search(query: string) {
                try {
                    await this.fetchData(`${SEARCH_URL}&query=${query}`)
                    return []
                } catch {
                    return null
                }
            },
        }
        logSpotifyApiFailures({ internal })
        return internal
    }

    const answer = (status: number, headers: Record<string, string> = {}) =>
        new Response('{}', { status, headers })

    const blockLogs = () =>
        warnLogMock.mock.calls.filter((call) =>
            String((call[0] as { message: string }).message).includes(
                'skipping Spotify calls',
            ),
        )

    beforeEach(() => {
        jest.clearAllMocks()
        resetSpotifyApiFailureLogForTests()
        fetchMock.mockReset()
        globalThis.fetch = fetchMock
        now = Date.parse('2026-10-19T12:00:00Z')
        jest.spyOn(Date, 'now').mockImplementation(() => now)
    })

    afterEach(() => {
        resetSpotifyApiFailureLogForTests()
        globalThis.fetch = realFetch
        jest.restoreAllMocks()
    })

    it('skips the network until Retry-After passes, then calls Spotify again', async () => {
        const api = libraryExtractor()
        fetchMock.mockResolvedValueOnce(answer(429, { 'Retry-After': '20335' }))

        await expect(api.search('a')).resolves.toBeNull()
        expect(fetchMock).toHaveBeenCalledTimes(1)

        now += 20_334_000
        await expect(api.search('b')).resolves.toBeNull()
        await expect(api.fetchData(SEARCH_URL)).rejects.toThrow(
            'Spotify API blocked until 2026-10-19T17:38:55.000Z',
        )
        expect(fetchMock).toHaveBeenCalledTimes(1)

        now += 1000
        fetchMock.mockResolvedValueOnce(answer(200))
        await expect(api.search('c')).resolves.toEqual([])
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('logs the block once, with the time it unblocks', async () => {
        const api = libraryExtractor()
        fetchMock.mockResolvedValue(answer(429, { 'Retry-After': '20335' }))

        await Promise.all([api.search('a'), api.search('b')])
        await api.search('c')

        expect(blockLogs()).toEqual([
            [
                {
                    message: expect.stringContaining('429'),
                    data: {
                        unblocksAt: '2026-10-19T17:38:55.000Z',
                        retryAfter: '20335',
                    },
                },
            ],
        ])
    })

    it('blocks for 60 seconds when the 429 has no Retry-After', async () => {
        const api = libraryExtractor()
        fetchMock.mockResolvedValueOnce(answer(429))

        await api.search('a')
        now += 59_000
        await api.search('b')
        expect(fetchMock).toHaveBeenCalledTimes(1)

        now += 1000
        fetchMock.mockResolvedValueOnce(answer(200))
        await expect(api.search('c')).resolves.toEqual([])
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('keeps the original 429 when Retry-After is huge', async () => {
        const api = libraryExtractor()
        fetchMock.mockResolvedValueOnce(answer(429, { 'Retry-After': '1e20' }))

        await expect(api.fetchData(SEARCH_URL)).rejects.toThrow(
            'Failed to fetch Spotify data: 429',
        )
        await expect(api.fetchData(SEARCH_URL)).rejects.toThrow(
            'Spotify API blocked until 2026-10-20T12:00:00.000Z',
        )
    })

    it('does not block on other failures', async () => {
        const api = libraryExtractor()
        fetchMock.mockResolvedValueOnce(answer(403))
        fetchMock.mockResolvedValueOnce(answer(200))

        await expect(api.search('a')).resolves.toBeNull()
        await expect(api.search('b')).resolves.toEqual([])
        expect(blockLogs()).toEqual([])
    })

    it('leaves fetch calls outside the Spotify extractor alone', async () => {
        libraryExtractor()
        fetchMock.mockResolvedValueOnce(answer(429, { 'Retry-After': '600' }))

        await fetch('https://example.com/')

        expect(blockLogs()).toEqual([])
    })
})

describe('retryAfterMs', () => {
    const now = Date.parse('2026-10-19T12:00:00Z')

    it('reads delay-seconds', () => {
        expect(retryAfterMs('20335', now)).toBe(20_335_000)
    })

    it('reads an HTTP date', () => {
        expect(retryAfterMs('Mon, 19 Oct 2026 12:05:00 GMT', now)).toBe(300_000)
    })

    it('caps a huge value at 24 hours', () => {
        expect(retryAfterMs('1e20', now)).toBe(24 * 60 * 60_000)
        expect(retryAfterMs('Fri, 01 Jan 2100 00:00:00 GMT', now)).toBe(
            24 * 60 * 60_000,
        )
    })

    it.each([
        null,
        undefined,
        '',
        '0',
        '-5',
        'soon',
        'Mon, 19 Oct 2026 11:00:00 GMT',
    ])('falls back to 60 seconds for %p', (header) => {
        expect(retryAfterMs(header, now)).toBe(60_000)
    })
})
