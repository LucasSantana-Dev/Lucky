import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const warnLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    warnLog: (...a: unknown[]) => warnLogMock(...a),
}))

import {
    logSpotifyApiFailures,
    reportSpotifyApiFailure,
    resetSpotifyApiFailureLogForTests,
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

        expect(warnLogMock).toHaveBeenCalledTimes(1)
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
