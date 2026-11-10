import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'

const warnLogMock = jest.fn()

const redisGetMock = jest.fn<(key: string) => Promise<string | null>>()
const redisSetMock =
    jest.fn<(key: string, value: string, ttl: number) => Promise<boolean>>()
const redisHealthyMock = jest.fn<() => boolean>()

jest.mock('@lucky/shared/utils', () => ({
    warnLog: (...a: unknown[]) => warnLogMock(...a),
}))

jest.mock('@lucky/shared/services', () => ({
    redisClient: {
        isHealthy: () => redisHealthyMock(),
        get: (key: string) => redisGetMock(key),
        set: (key: string, value: string, ttl: number) =>
            redisSetMock(key, value, ttl),
    },
}))

import {
    awaitSpotifyBlockHydration,
    hydrateSpotifyBlock,
    isSpotifyBlocked,
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
        redisGetMock.mockReset().mockResolvedValue(null)
        redisSetMock.mockReset().mockResolvedValue(true)
        redisHealthyMock.mockReset().mockReturnValue(true)
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

    const flushPromises = () => new Promise((r) => setImmediate(r))

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
        redisGetMock.mockReset().mockResolvedValue(null)
        redisSetMock.mockReset().mockResolvedValue(true)
        redisHealthyMock.mockReset().mockReturnValue(true)
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

    it('persists the block in Redis with the remaining block as TTL', async () => {
        const api = libraryExtractor()
        fetchMock.mockResolvedValueOnce(answer(429, { 'Retry-After': '600' }))

        await api.search('a')
        await flushPromises()

        expect(isSpotifyBlocked()).toBe(true)
        expect(redisSetMock).toHaveBeenCalledWith(
            'spotify:blockedUntil',
            String(now + 600_000),
            600,
        )
    })

    it('caps the persisted TTL at 24 hours', async () => {
        const api = libraryExtractor()
        fetchMock.mockResolvedValueOnce(answer(429, { 'Retry-After': '1e20' }))

        await api.search('a')
        await flushPromises()

        expect(redisSetMock).toHaveBeenCalledWith(
            'spotify:blockedUntil',
            String(now + 86_400_000),
            86_400,
        )
    })

    it('hydrates the block from Redis after a restart', async () => {
        redisGetMock.mockResolvedValue(String(now + 300_000))
        expect(isSpotifyBlocked()).toBe(false)

        await hydrateSpotifyBlock()

        expect(isSpotifyBlocked()).toBe(true)
        now += 300_001
        expect(isSpotifyBlocked()).toBe(false)
    })

    it('fails fast on the first call after a restart without hitting Spotify', async () => {
        redisGetMock.mockResolvedValue(String(now + 300_000))
        const api = libraryExtractor()

        await expect(api.search('a')).resolves.toBeNull()

        expect(fetchMock).not.toHaveBeenCalled()
    })

    it.each([
        ['stale', () => String(now - 1)],
        ['malformed', () => 'nope'],
        ['past the 24h cap', () => String(now + 86_400_000 + 1)],
    ])('ignores a %s Redis value', async (_label, value) => {
        redisGetMock.mockResolvedValue(value())

        await hydrateSpotifyBlock()

        expect(redisGetMock).toHaveBeenCalledTimes(1)
        expect(isSpotifyBlocked()).toBe(false)
    })

    it('keeps the in-memory block when Redis fails on write', async () => {
        redisSetMock.mockRejectedValue(new Error('redis down'))
        const api = libraryExtractor()
        fetchMock.mockResolvedValueOnce(answer(429, { 'Retry-After': '600' }))

        await expect(api.search('a')).resolves.toBeNull()

        expect(isSpotifyBlocked()).toBe(true)
    })

    it('does not memoize a null read from an unhealthy Redis, retries after 30s', async () => {
        redisHealthyMock.mockReturnValue(false)
        await hydrateSpotifyBlock()
        expect(redisGetMock).toHaveBeenCalledTimes(1)

        now += 10_000
        await hydrateSpotifyBlock()
        expect(redisGetMock).toHaveBeenCalledTimes(1)

        redisHealthyMock.mockReturnValue(true)
        redisGetMock.mockResolvedValue(String(now + 300_000))
        now += 20_001
        await hydrateSpotifyBlock()

        expect(redisGetMock).toHaveBeenCalledTimes(2)
        expect(isSpotifyBlocked()).toBe(true)
    })

    it('does not memoize a thrown read, retries after 30s', async () => {
        redisGetMock.mockRejectedValueOnce(new Error('redis down'))
        await hydrateSpotifyBlock()

        now += 30_001
        redisGetMock.mockResolvedValue(String(now + 300_000))
        await hydrateSpotifyBlock()

        expect(isSpotifyBlocked()).toBe(true)
    })

    it('retries a null read after 30s even on a healthy Redis', async () => {
        // The client answers null for a failed GET too, so null proves nothing.
        await hydrateSpotifyBlock()
        await hydrateSpotifyBlock()
        expect(redisGetMock).toHaveBeenCalledTimes(1)

        now += 30_001
        redisGetMock.mockResolvedValue(String(now + 300_000))
        await hydrateSpotifyBlock()

        expect(redisGetMock).toHaveBeenCalledTimes(2)
        expect(isSpotifyBlocked()).toBe(true)
    })

    it('memoizes a value read from Redis', async () => {
        redisGetMock.mockResolvedValue(String(now + 300_000))
        await hydrateSpotifyBlock()
        now += 60_000
        await hydrateSpotifyBlock()

        expect(redisGetMock).toHaveBeenCalledTimes(1)
    })

    it('does not stall fetchData past 500ms when the Redis read hangs', async () => {
        jest.useFakeTimers()
        try {
            redisGetMock.mockReturnValue(new Promise(() => {}))
            const api = libraryExtractor()
            fetchMock.mockResolvedValueOnce(answer(200))

            const call = api.fetchData(SEARCH_URL)
            await jest.advanceTimersByTimeAsync(499)
            expect(fetchMock).not.toHaveBeenCalled()
            await jest.advanceTimersByTimeAsync(2)

            await expect(call).resolves.toBeInstanceOf(Response)
            expect(fetchMock).toHaveBeenCalledTimes(1)

            // The timed-out read is dropped: the next call does not wait again.
            fetchMock.mockResolvedValueOnce(answer(200))
            const next = api.fetchData(SEARCH_URL)
            await jest.advanceTimersByTimeAsync(0)

            await expect(next).resolves.toBeInstanceOf(Response)
            expect(fetchMock).toHaveBeenCalledTimes(2)
            expect(redisGetMock).toHaveBeenCalledTimes(1)
        } finally {
            jest.useRealTimers()
        }
    })

    it('ignores a late answer from a timed-out read (#2971)', async () => {
        jest.useFakeTimers({ doNotFake: ['Date'] })
        try {
            let finishFirst: (value: string | null) => void = () => {}
            redisGetMock.mockReturnValueOnce(
                new Promise<string | null>((resolve) => {
                    finishFirst = resolve
                }),
            )
            const waited = awaitSpotifyBlockHydration()
            await jest.advanceTimersByTimeAsync(501)
            await waited

            now += 30_001
            redisGetMock.mockResolvedValueOnce(String(now + 300_000))
            await hydrateSpotifyBlock()
            expect(isSpotifyBlocked()).toBe(true)

            finishFirst(null)
            await jest.advanceTimersByTimeAsync(0)
            now += 30_001
            await hydrateSpotifyBlock()

            expect(redisGetMock).toHaveBeenCalledTimes(2)
        } finally {
            jest.useRealTimers()
        }
    })

    it('searches normally when Redis fails on read', async () => {
        redisGetMock.mockRejectedValue(new Error('redis down'))
        const api = libraryExtractor()
        fetchMock.mockResolvedValueOnce(answer(200))

        await expect(api.search('a')).resolves.toEqual([])

        expect(isSpotifyBlocked()).toBe(false)
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
