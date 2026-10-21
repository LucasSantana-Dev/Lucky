import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'

const mockRedisGet = jest.fn<(key: string) => Promise<string | null>>()
const mockRedisSet =
    jest.fn<(key: string, value: string, ttl: number) => Promise<void>>()

jest.mock('@lucky/shared/services', () => ({
    redisClient: {
        get: (key: string) => mockRedisGet(key),
        set: (key: string, value: string, ttl: number) =>
            mockRedisSet(key, value, ttl),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    warnLog: jest.fn(),
}))

import {
    ensureSpotifyIsrc,
    lookupSpotifyIsrc,
    normalizeIsrc,
    resetSpotifyIsrcForTests,
    SPOTIFY_ISRC_LOOKUP_TIMEOUT_MS,
    spotifyTrackIdFromUrl,
    trackIsrc,
    useSpotifyApiForIsrc,
} from './spotifyIsrc'
import {
    logSpotifyApiFailures,
    resetSpotifyApiFailureLogForTests,
} from './spotifyApiFailureLog'

const TRACK_ID = '4uLU6hMCjMI75M1A2tKUQC'
const TRACK_URL = `https://open.spotify.com/track/${TRACK_ID}`
const ISRC_KEY = `lucky:spotify_isrc:${TRACK_ID}`

const json = (body: unknown, status = 200, headers = {}) =>
    new Response(JSON.stringify(body), { status, headers })

// Same flow as discord-player-spotify 1.1.9: fetchData() calls the global
// fetch and throws on a non-2xx answer.
function libraryExtractor() {
    return {
        internal: {
            async fetchData(url: string) {
                const res = await fetch(url)
                if (!res.ok)
                    throw new Error(
                        `Failed to fetch Spotify data: ${res.status}`,
                    )
                return res
            },
        },
    }
}

function makeTrack(url = TRACK_URL, metadata: unknown = null) {
    let current = metadata
    return {
        url,
        get metadata() {
            return current
        },
        setMetadata(m: unknown) {
            current = m
        },
    }
}

describe('normalizeIsrc', () => {
    it.each([
        ['USRC17607839', 'USRC17607839'],
        ['us-rc1-76-07839', 'USRC17607839'],
        [' gb ayE 06 00012 ', 'GBAYE0600012'],
    ])('normalizes %p to %p', (raw, expected) => {
        expect(normalizeIsrc(raw)).toBe(expected)
    })

    it.each([
        [''],
        ['USRC1760783'],
        ['USRC176078399'],
        ['1SRC17607839'],
        [null],
        [42],
    ])('rejects %p', (raw) => {
        expect(normalizeIsrc(raw)).toBeNull()
    })
})

describe('spotifyTrackIdFromUrl', () => {
    it('reads the id of a plain and a localized track URL', () => {
        expect(spotifyTrackIdFromUrl(TRACK_URL)).toBe(TRACK_ID)
        expect(
            spotifyTrackIdFromUrl(
                `https://open.spotify.com/intl-pt/track/${TRACK_ID}?si=x`,
            ),
        ).toBe(TRACK_ID)
    })

    it.each([
        [undefined],
        ['not a url'],
        [`https://evil.example/track/${TRACK_ID}`],
        ['https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC'],
        ['https://open.spotify.com/track/short'],
    ])('returns null for %p', (url) => {
        expect(spotifyTrackIdFromUrl(url)).toBeNull()
    })
})

describe('lookupSpotifyIsrc', () => {
    const realFetch = globalThis.fetch
    const fetchMock = jest.fn<typeof fetch>()

    beforeEach(() => {
        jest.clearAllMocks()
        fetchMock.mockReset()
        mockRedisGet.mockResolvedValue(null)
        mockRedisSet.mockResolvedValue(undefined)
        resetSpotifyIsrcForTests()
        resetSpotifyApiFailureLogForTests()
        globalThis.fetch = fetchMock
    })

    afterEach(() => {
        resetSpotifyApiFailureLogForTests()
        globalThis.fetch = realFetch
        jest.useRealTimers()
    })

    function wire() {
        const extractor = libraryExtractor()
        logSpotifyApiFailures(extractor)
        useSpotifyApiForIsrc(extractor)
    }

    it('answers from Redis without calling Spotify', async () => {
        wire()
        mockRedisGet.mockResolvedValueOnce('USRC17607839')

        await expect(lookupSpotifyIsrc(TRACK_ID)).resolves.toBe('USRC17607839')
        expect(fetchMock).not.toHaveBeenCalled()
        expect(mockRedisGet).toHaveBeenCalledWith(ISRC_KEY)
    })

    it('reads a cached "no ISRC" answer as null without calling Spotify', async () => {
        wire()
        mockRedisGet.mockResolvedValueOnce('__none__')

        await expect(lookupSpotifyIsrc(TRACK_ID)).resolves.toBeNull()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('fetches the track on a miss, normalizes and caches the ISRC for 30 days', async () => {
        wire()
        fetchMock.mockResolvedValueOnce(
            json({ external_ids: { isrc: 'us-rc1-76-07839' } }),
        )

        await expect(lookupSpotifyIsrc(TRACK_ID)).resolves.toBe('USRC17607839')
        expect(String(fetchMock.mock.calls[0][0])).toBe(
            `https://api.spotify.com/v1/tracks/${TRACK_ID}`,
        )
        expect(mockRedisSet).toHaveBeenCalledWith(
            ISRC_KEY,
            'USRC17607839',
            30 * 24 * 60 * 60,
        )
    })

    it('caches a track without an ISRC for 24 h and returns null', async () => {
        wire()
        fetchMock.mockResolvedValueOnce(json({ external_ids: {} }))

        await expect(lookupSpotifyIsrc(TRACK_ID)).resolves.toBeNull()
        expect(mockRedisSet).toHaveBeenCalledWith(
            ISRC_KEY,
            '__none__',
            24 * 60 * 60,
        )
    })

    it('returns null on a 429, caches nothing and skips Spotify until Retry-After', async () => {
        wire()
        fetchMock.mockResolvedValueOnce(json({}, 429, { 'Retry-After': '600' }))

        await expect(lookupSpotifyIsrc(TRACK_ID)).resolves.toBeNull()
        await expect(lookupSpotifyIsrc(TRACK_ID)).resolves.toBeNull()

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(mockRedisSet).not.toHaveBeenCalled()
    })

    it('gives up after the lookup budget and caches nothing', async () => {
        jest.useFakeTimers()
        wire()
        fetchMock.mockReturnValueOnce(new Promise<Response>(() => {}))

        const pending = lookupSpotifyIsrc(TRACK_ID)
        await jest.advanceTimersByTimeAsync(SPOTIFY_ISRC_LOOKUP_TIMEOUT_MS)

        await expect(pending).resolves.toBeNull()
        expect(mockRedisSet).not.toHaveBeenCalled()
    })

    it('returns null when no Spotify extractor is registered', async () => {
        await expect(lookupSpotifyIsrc(TRACK_ID)).resolves.toBeNull()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('still calls Spotify when Redis is down', async () => {
        wire()
        mockRedisGet.mockRejectedValueOnce(new Error('ECONNREFUSED'))
        fetchMock.mockResolvedValueOnce(
            json({ external_ids: { isrc: 'USRC17607839' } }),
        )

        await expect(lookupSpotifyIsrc(TRACK_ID)).resolves.toBe('USRC17607839')
    })
})

describe('ensureSpotifyIsrc', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockRedisGet.mockResolvedValue(null)
        resetSpotifyIsrcForTests()
    })

    it('stores the ISRC in metadata and keeps the existing keys', async () => {
        mockRedisGet.mockResolvedValueOnce('USRC17607839')
        const track = makeTrack(TRACK_URL, { requestedBy: 'u1' })

        await expect(ensureSpotifyIsrc(track)).resolves.toBe('USRC17607839')
        expect(track.metadata).toEqual({
            requestedBy: 'u1',
            isrc: 'USRC17607839',
        })
        expect(trackIsrc(track)).toBe('USRC17607839')
    })

    it('returns the ISRC already on the track without a lookup', async () => {
        const track = makeTrack(TRACK_URL, { isrc: 'USRC17607839' })

        await expect(ensureSpotifyIsrc(track)).resolves.toBe('USRC17607839')
        expect(mockRedisGet).not.toHaveBeenCalled()
    })

    it('skips tracks that are not Spotify tracks', async () => {
        const track = makeTrack('https://www.youtube.com/watch?v=abc')

        await expect(ensureSpotifyIsrc(track)).resolves.toBeNull()
        expect(mockRedisGet).not.toHaveBeenCalled()
        expect(track.metadata).toBeNull()
    })

    it('leaves metadata alone when there is no ISRC', async () => {
        mockRedisGet.mockResolvedValueOnce('__none__')
        const track = makeTrack()

        await expect(ensureSpotifyIsrc(track)).resolves.toBeNull()
        expect(track.metadata).toBeNull()
    })
})
