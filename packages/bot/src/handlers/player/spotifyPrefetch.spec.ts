import { jest } from '@jest/globals'

const mockIsYtDlpBlocked = jest.fn(() => false)
const mockResolveYtDlpSearchUrl = jest.fn()
const mockGetSpotifySource = jest.fn()
const mockSetSpotifySource = jest.fn()
const mockSetSpotifySourceNegative = jest.fn()
const mockCleanTitle = jest.fn()
const mockCleanAuthor = jest.fn()
const mockCleanSearchQuery = jest.fn()
const mockDebugLog = jest.fn()
const mockWarnLog = jest.fn()

jest.mock('./ytdlpBlockBreaker', () => ({
    isYtDlpBlocked: () => mockIsYtDlpBlocked(),
}))
jest.mock('./ytdlpProcess', () => ({
    resolveYtDlpSearchUrl: (...args: unknown[]) =>
        mockResolveYtDlpSearchUrl(...args),
}))
jest.mock('./spotifySourceCache', () => ({
    getSpotifySource: (...args: unknown[]) => mockGetSpotifySource(...args),
    setSpotifySource: (...args: unknown[]) => mockSetSpotifySource(...args),
    setSpotifySourceNegative: (...args: unknown[]) =>
        mockSetSpotifySourceNegative(...args),
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
    beforeEach(() => {
        jest.clearAllMocks()
        mockIsYtDlpBlocked.mockReturnValue(false)
        mockGetSpotifySource.mockResolvedValue(null)
        mockCleanTitle.mockReturnValue('Test')
        mockCleanAuthor.mockReturnValue('Artist')
        mockCleanSearchQuery.mockReturnValue('test artist')
    })

    it('returns early when yt-dlp is blocked', async () => {
        mockIsYtDlpBlocked.mockReturnValue(true)

        await prefetchNextSpotifyTrack(makeQueue(makeTrack()))

        expect(mockGetSpotifySource).not.toHaveBeenCalled()
    })

    it('returns early when there is no next track', async () => {
        await prefetchNextSpotifyTrack(makeQueue(null))

        expect(mockGetSpotifySource).not.toHaveBeenCalled()
    })

    it('returns early when queue.tracks.at throws', async () => {
        const queue = {
            tracks: {
                at: jest.fn(() => {
                    throw new Error('empty')
                }),
            },
        } as unknown as import('discord-player').GuildQueue

        await expect(prefetchNextSpotifyTrack(queue)).resolves.toBeUndefined()
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

        expect(mockResolveYtDlpSearchUrl).not.toHaveBeenCalled()
    })

    it('resolves and caches the YouTube URL for an uncached Spotify track', async () => {
        const ytUrl = 'https://www.youtube.com/watch?v=new123'
        mockResolveYtDlpSearchUrl.mockResolvedValueOnce(ytUrl)
        mockSetSpotifySource.mockResolvedValueOnce(undefined)

        await prefetchNextSpotifyTrack(makeQueue(makeTrack()))

        expect(mockSetSpotifySource).toHaveBeenCalledWith(
            'https://open.spotify.com/track/abc',
            ytUrl,
        )
        expect(mockDebugLog).toHaveBeenCalled()
    })

    it('stores a negative entry and logs a warning when resolution fails', async () => {
        mockResolveYtDlpSearchUrl.mockRejectedValueOnce(new Error('timeout'))
        mockSetSpotifySourceNegative.mockResolvedValueOnce(undefined)

        await prefetchNextSpotifyTrack(makeQueue(makeTrack()))

        expect(mockSetSpotifySourceNegative).toHaveBeenCalledWith(
            'https://open.spotify.com/track/abc',
        )
        expect(mockWarnLog).toHaveBeenCalled()
    })

    it('does not throw when setSpotifySourceNegative rejects', async () => {
        mockResolveYtDlpSearchUrl.mockRejectedValueOnce(new Error('boom'))
        mockSetSpotifySourceNegative.mockRejectedValueOnce(
            new Error('cache down'),
        )

        await expect(
            prefetchNextSpotifyTrack(makeQueue(makeTrack())),
        ).resolves.toBeUndefined()
    })
})
