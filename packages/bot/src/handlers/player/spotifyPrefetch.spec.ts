import { jest } from '@jest/globals'

const mockIsYtDlpBlocked = jest.fn(() => false)
const mockSearchYtDlpCandidates = jest.fn()
const mockPickYouTubeCandidate = jest.fn()
const mockGetSpotifySource = jest.fn()
const mockSetSpotifySource = jest.fn()
const mockCleanTitle = jest.fn()
const mockCleanAuthor = jest.fn()
const mockCleanSearchQuery = jest.fn()
const mockDebugLog = jest.fn()
const mockWarnLog = jest.fn()

jest.mock('./ytdlpBlockBreaker', () => ({
    isYtDlpBlocked: () => mockIsYtDlpBlocked(),
}))
jest.mock('./ytdlpProcess', () => ({
    searchYtDlpCandidates: (...args: unknown[]) =>
        mockSearchYtDlpCandidates(...args),
}))
jest.mock('./youtubeSearchMatcher', () => ({
    pickYouTubeCandidate: (...args: unknown[]) =>
        mockPickYouTubeCandidate(...args),
    youtubeWatchUrl: (id: string) => `https://www.youtube.com/watch?v=${id}`,
}))
jest.mock('./spotifySourceCache', () => ({
    getSpotifySource: (...args: unknown[]) => mockGetSpotifySource(...args),
    setSpotifySource: (...args: unknown[]) => mockSetSpotifySource(...args),
    isNegativeEntry: (value: string) => value === '__neg__',
    normalizeCacheKey: (url: string) => url.replace(/\?si=[^&]*$/, ''),
}))
jest.mock('../../utils/music/searchQueryCleaner', () => ({
    cleanTitle: (...args: unknown[]) => mockCleanTitle(...args),
    cleanAuthor: (...args: unknown[]) => mockCleanAuthor(...args),
    cleanSearchQuery: (t: unknown, a: unknown) => mockCleanSearchQuery(t, a),
}))
jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => mockDebugLog(...args),
    warnLog: (...args: unknown[]) => mockWarnLog(...args),
    errorLog: jest.fn(),
}))

import { prefetchNextSpotifyTrack } from './spotifyPrefetch'

function makeQueue(nextTrack: unknown = null) {
    return {
        tracks: {
            at: jest.fn(() => nextTrack),
        },
    } as unknown as import('discord-player').GuildQueue
}

function makeTrack(url = 'https://open.spotify.com/track/abc') {
    return { url, title: 'Test', author: 'Artist' }
}

describe('prefetchNextSpotifyTrack', () => {
    const spotifyUrl = 'https://open.spotify.com/track/abc'
    const candidates = [{ id: 'new123', title: 'Test', channel: 'Artist' }]

    beforeEach(() => {
        jest.clearAllMocks()
        mockIsYtDlpBlocked.mockReturnValue(false)
        mockGetSpotifySource.mockResolvedValue(null)
        mockSetSpotifySource.mockResolvedValue(undefined)
        mockCleanTitle.mockReturnValue('Test')
        mockCleanAuthor.mockReturnValue('Artist')
        mockCleanSearchQuery.mockReturnValue('test artist')
        mockSearchYtDlpCandidates.mockResolvedValue(candidates)
        mockPickYouTubeCandidate.mockReturnValue({
            pick: { id: 'new123', score: 1 },
            rejected: [],
        })
    })

    it('returns early when yt-dlp is blocked', async () => {
        mockIsYtDlpBlocked.mockReturnValue(true)

        await prefetchNextSpotifyTrack(makeQueue(makeTrack()))

        expect(mockGetSpotifySource).not.toHaveBeenCalled()
        expect(mockSearchYtDlpCandidates).not.toHaveBeenCalled()
    })

    it('returns early when there is no next track', async () => {
        await prefetchNextSpotifyTrack(makeQueue(null))

        expect(mockGetSpotifySource).not.toHaveBeenCalled()
    })

    it('swallows a throwing queue.tracks.at without a lookup', async () => {
        const queue = {
            tracks: {
                at: jest.fn(() => {
                    throw new Error('empty')
                }),
            },
        } as unknown as import('discord-player').GuildQueue

        await expect(prefetchNextSpotifyTrack(queue)).resolves.toBeUndefined()
        expect(mockGetSpotifySource).not.toHaveBeenCalled()
        expect(mockSearchYtDlpCandidates).not.toHaveBeenCalled()
    })

    it('returns early when the next track has no url', async () => {
        await prefetchNextSpotifyTrack(makeQueue(makeTrack('')))

        expect(mockGetSpotifySource).not.toHaveBeenCalled()
    })

    it('returns early when next track is not a Spotify URL', async () => {
        await prefetchNextSpotifyTrack(
            makeQueue(makeTrack('https://www.youtube.com/watch?v=abc')),
        )

        expect(mockGetSpotifySource).not.toHaveBeenCalled()
    })

    it('returns early when the URL is already cached', async () => {
        mockGetSpotifySource.mockResolvedValueOnce(
            'https://www.youtube.com/watch?v=cached',
        )

        await prefetchNextSpotifyTrack(makeQueue(makeTrack()))

        expect(mockSearchYtDlpCandidates).not.toHaveBeenCalled()
        expect(mockSetSpotifySource).not.toHaveBeenCalled()
    })

    it('treats a failing cache read as a miss', async () => {
        mockGetSpotifySource.mockRejectedValue(new Error('redis down'))

        await prefetchNextSpotifyTrack(makeQueue(makeTrack()))

        expect(mockSearchYtDlpCandidates).toHaveBeenCalledTimes(1)
        expect(mockSetSpotifySource).toHaveBeenCalledWith(
            spotifyUrl,
            'https://www.youtube.com/watch?v=new123',
        )
    })

    it('caches the validated pick, not the raw first hit', async () => {
        const first = { id: 'radio99', title: 'Test (Radio Edit)' }
        const second = { id: 'new123', title: 'Test' }
        mockSearchYtDlpCandidates.mockResolvedValue([first, second])
        mockPickYouTubeCandidate.mockReturnValue({
            pick: { ...second, score: 0.9 },
            rejected: [{ ...first, reason: 'marker' }],
        })

        await prefetchNextSpotifyTrack(
            makeQueue({ ...makeTrack(), title: 'Test', duration: '3:20' }),
        )

        expect(mockSearchYtDlpCandidates).toHaveBeenCalledTimes(1)
        expect(mockSearchYtDlpCandidates).toHaveBeenCalledWith(
            'test artist official audio',
        )
        expect(mockPickYouTubeCandidate).toHaveBeenCalledWith(
            {
                title: 'Test',
                author: 'Artist',
                sourceTitle: 'Test',
                duration: '3:20',
            },
            [first, second],
        )
        expect(mockSetSpotifySource).toHaveBeenCalledTimes(1)
        expect(mockSetSpotifySource).toHaveBeenCalledWith(
            spotifyUrl,
            'https://www.youtube.com/watch?v=new123',
        )
        expect(mockDebugLog).toHaveBeenCalledTimes(1)
    })

    it('writes nothing when no candidate passes validation', async () => {
        mockPickYouTubeCandidate.mockReturnValue({ pick: null, rejected: [] })

        await prefetchNextSpotifyTrack(makeQueue(makeTrack()))

        expect(mockSetSpotifySource).not.toHaveBeenCalled()
        expect(mockDebugLog).toHaveBeenCalledTimes(1)
        expect(mockWarnLog).not.toHaveBeenCalled()
    })

    it('never writes a negative entry and logs a warning when the search fails', async () => {
        mockSearchYtDlpCandidates.mockRejectedValueOnce(new Error('timeout'))

        await expect(
            prefetchNextSpotifyTrack(makeQueue(makeTrack())),
        ).resolves.toBeUndefined()

        expect(mockSetSpotifySource).not.toHaveBeenCalled()
        expect(mockWarnLog).toHaveBeenCalledTimes(1)
        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ error: 'timeout' }),
            }),
        )
    })

    it('does not overwrite a positive entry written while the search ran', async () => {
        mockGetSpotifySource
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce('https://www.youtube.com/watch?v=playback')

        await prefetchNextSpotifyTrack(makeQueue(makeTrack()))

        expect(mockGetSpotifySource).toHaveBeenCalledTimes(2)
        expect(mockSetSpotifySource).not.toHaveBeenCalled()
    })

    it('replaces a negative entry written while the search ran', async () => {
        mockGetSpotifySource
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce('__neg__')

        await prefetchNextSpotifyTrack(makeQueue(makeTrack()))

        expect(mockSetSpotifySource).toHaveBeenCalledWith(
            spotifyUrl,
            'https://www.youtube.com/watch?v=new123',
        )
    })

    it('does not throw when the final cache write rejects', async () => {
        mockSetSpotifySource.mockRejectedValueOnce(new Error('cache down'))

        await expect(
            prefetchNextSpotifyTrack(makeQueue(makeTrack())),
        ).resolves.toBeUndefined()

        // The write was attempted exactly once, with the validated pick.
        expect(mockSetSpotifySource).toHaveBeenCalledTimes(1)
        expect(mockSetSpotifySource).toHaveBeenCalledWith(
            spotifyUrl,
            'https://www.youtube.com/watch?v=new123',
        )
        expect(mockWarnLog).toHaveBeenCalledTimes(1)
        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Prefetch: failed to resolve next Spotify track',
                data: expect.objectContaining({ error: 'cache down' }),
            }),
        )
        // The failure is not turned into a negative cache entry.
        expect(mockDebugLog).not.toHaveBeenCalled()
    })

    it('dedupes share links that differ only in ?si=', async () => {
        let release: (value: unknown[]) => void = () => undefined
        mockSearchYtDlpCandidates.mockReturnValue(
            new Promise((resolve) => {
                release = resolve
            }),
        )

        const first = prefetchNextSpotifyTrack(makeQueue(makeTrack()))
        const second = prefetchNextSpotifyTrack(
            makeQueue(makeTrack(`${spotifyUrl}?si=abc123`)),
        )
        await new Promise((resolve) => setImmediate(resolve))
        release(candidates)
        await Promise.all([first, second])

        expect(mockSearchYtDlpCandidates).toHaveBeenCalledTimes(1)
        expect(mockSetSpotifySource).toHaveBeenCalledTimes(1)
    })

    it('logs and swallows a rejection of the in-flight task for a joining caller', async () => {
        // cleanTitle runs inside the shared task but outside its own
        // try/catch, so the task promise rejects.
        mockCleanTitle.mockImplementation(() => {
            throw new Error('cleaner broke')
        })

        const first = prefetchNextSpotifyTrack(makeQueue(makeTrack()))
        const second = prefetchNextSpotifyTrack(makeQueue(makeTrack()))

        await expect(Promise.all([first, second])).resolves.toEqual([
            undefined,
            undefined,
        ])
        expect(mockSearchYtDlpCandidates).not.toHaveBeenCalled()
        expect(mockSetSpotifySource).not.toHaveBeenCalled()
        expect(mockWarnLog).toHaveBeenCalledTimes(2)
        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Prefetch: unexpected failure',
                data: { error: 'cleaner broke' },
            }),
        )
    })

    it('runs one search for concurrent prefetches of the same track', async () => {
        let release: (value: unknown[]) => void = () => undefined
        mockSearchYtDlpCandidates.mockReturnValue(
            new Promise((resolve) => {
                release = resolve
            }),
        )

        const first = prefetchNextSpotifyTrack(makeQueue(makeTrack()))
        const second = prefetchNextSpotifyTrack(makeQueue(makeTrack()))
        await new Promise((resolve) => setImmediate(resolve))
        release(candidates)
        await Promise.all([first, second])

        expect(mockSearchYtDlpCandidates).toHaveBeenCalledTimes(1)
        expect(mockSetSpotifySource).toHaveBeenCalledTimes(1)
    })

    it('allows a new prefetch of the same track once the first settled', async () => {
        mockSearchYtDlpCandidates.mockRejectedValueOnce(new Error('timeout'))

        await prefetchNextSpotifyTrack(makeQueue(makeTrack()))
        await prefetchNextSpotifyTrack(makeQueue(makeTrack()))

        expect(mockSearchYtDlpCandidates).toHaveBeenCalledTimes(2)
        expect(mockSetSpotifySource).toHaveBeenCalledTimes(1)
    })
})
