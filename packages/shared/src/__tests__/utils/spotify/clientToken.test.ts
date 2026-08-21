import {
    beforeEach,
    afterEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'

jest.mock('../../../utils/general/log', () => ({
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

import {
    getSpotifyClientToken,
    resetSpotifyClientTokenCache,
} from '../../../utils/spotify/clientToken'

const originalFetch = global.fetch

function mockTokenResponse(token: string, expiresIn = 3600) {
    return {
        ok: true,
        json: async () => ({ access_token: token, expires_in: expiresIn }),
    } as unknown as Response
}

describe('getSpotifyClientToken', () => {
    beforeEach(() => {
        resetSpotifyClientTokenCache()
        process.env.SPOTIFY_CLIENT_ID = 'id'
        process.env.SPOTIFY_CLIENT_SECRET = 'secret'
    })

    afterEach(() => {
        global.fetch = originalFetch
        delete process.env.SPOTIFY_CLIENT_ID
        delete process.env.SPOTIFY_CLIENT_SECRET
    })

    it('opens one token exchange for concurrent callers', async () => {
        // Without in-flight sharing every caller misses the cache before any
        // of them stores a token, so each opens its own exchange.
        let resolveFetch: (value: Response) => void = () => {}
        const pending = new Promise<Response>((resolve) => {
            resolveFetch = resolve
        })
        const fetchMock = jest.fn(() => pending)
        global.fetch = fetchMock as unknown as typeof fetch

        const calls = Promise.all([
            getSpotifyClientToken(),
            getSpotifyClientToken(),
            getSpotifyClientToken(),
        ])
        resolveFetch(mockTokenResponse('tok-1'))

        expect(await calls).toEqual(['tok-1', 'tok-1', 'tok-1'])
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('serves a cached token without refetching', async () => {
        const fetchMock = jest.fn(async () => mockTokenResponse('tok-1'))
        global.fetch = fetchMock as unknown as typeof fetch

        expect(await getSpotifyClientToken()).toBe('tok-1')
        expect(await getSpotifyClientToken()).toBe('tok-1')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('retries after a failed exchange instead of caching the failure', async () => {
        const responses: Response[] = [
            { ok: false } as unknown as Response,
            mockTokenResponse('tok-2'),
        ]
        const fetchMock = jest.fn(async () => responses.shift() as Response)
        global.fetch = fetchMock as unknown as typeof fetch

        expect(await getSpotifyClientToken()).toBeNull()
        expect(await getSpotifyClientToken()).toBe('tok-2')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('returns null without a request when credentials are unset', async () => {
        delete process.env.SPOTIFY_CLIENT_ID
        const fetchMock = jest.fn()
        global.fetch = fetchMock as unknown as typeof fetch

        expect(await getSpotifyClientToken()).toBeNull()
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
