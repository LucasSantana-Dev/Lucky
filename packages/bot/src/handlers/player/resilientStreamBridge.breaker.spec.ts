import { jest } from '@jest/globals'

// Runs the real bridge against the real block breaker: one play that reaches
// yt-dlp several times must add one failure to the streak, not one per
// attempt, or a single bad upload switches YouTube off for every guild.
const mockStreamViaYtDlp = jest.fn()
const mockSearchYtDlpCandidates = jest.fn()
const mockStreamViaSoundCloud = jest.fn()
const mockGetSpotifySource = jest.fn()
const mockFailureInc = jest.fn()

jest.mock('./ytdlpProcess', () => ({
    streamViaYtDlp: (...args: unknown[]) => mockStreamViaYtDlp(...args),
    searchYtDlpCandidates: (...args: unknown[]) =>
        mockSearchYtDlpCandidates(...args),
}))
jest.mock('./soundcloudMatcher', () => ({
    streamViaSoundCloud: (...args: unknown[]) =>
        mockStreamViaSoundCloud(...args),
}))
jest.mock('./spotifySourceCache', () => ({
    getSpotifySource: (...args: unknown[]) => mockGetSpotifySource(...args),
    setSpotifySource: jest.fn(async () => undefined),
    setSpotifySourceNegative: jest.fn(async () => undefined),
    isNegativeEntry: () => false,
}))
jest.mock('../../utils/monitoring/prometheus', () => ({
    playStageSeconds: { observe: jest.fn() },
    spotifyCacheTotal: { inc: jest.fn() },
    extractionFailuresTotal: {
        inc: (...args: unknown[]) => mockFailureInc(...args),
    },
}))
jest.mock('./extractorHealth', () => ({
    isExtractorDegraded: () => false,
    setExtractorDegraded: jest.fn(),
}))
jest.mock('../../services/musicManagement/search/providerHealth', () => ({
    providerHealthService: { isAvailable: () => true },
}))
jest.mock('../../config/featureFlags', () => ({
    isHostedYoutubeEnabled: () => false,
}))
jest.mock('./youtubeiNativeStream', () => ({
    streamViaYoutubei: jest.fn(),
    searchYoutubeiCandidates: jest.fn(),
}))
jest.mock('./streamFallbackState', () => ({
    stampFallbackStage: jest.fn(),
    stampBridgeSource: jest.fn(),
    clearBridgeStamps: jest.fn(),
}))
jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
    errorLog: jest.fn(),
}))
jest.mock('../../utils/monitoring/sentry', () => ({
    addBreadcrumb: jest.fn(),
    captureMessage: jest.fn(),
    safeUrlOrigin: () => 'https://www.youtube.com',
    scrubUrls: (text: string) => text,
}))

import { createResilientStream } from './resilientStreamBridge'
import { isYtDlpBlocked, recordYtDlpSuccess } from './ytdlpBlockBreaker'

const botcheck = () =>
    new Error(
        "yt-dlp exited with code 1 - ERROR: [youtube] vid123: Sign in to confirm you're not a bot",
    )
const empty = () => new Error('yt-dlp exited without output (code 0)')

function makeTrack(url: string, title = 'Test Track') {
    let metadata: unknown = null
    return {
        title,
        author: 'Test Artist',
        duration: '3:30',
        url,
        get metadata() {
            return metadata
        },
        setMetadata(m: unknown) {
            metadata = m
        },
    }
}

const spotifyTrack = (id: string) =>
    makeTrack(`https://open.spotify.com/track/${id}`)

const hit = {
    id: 'vid123',
    title: 'Test Track',
    channel: 'Test Artist - Topic',
    durationSec: 210,
}

const failureCount = (type: string) =>
    mockFailureInc.mock.calls.filter(
        (c) => (c[0] as { type: string }).type === type,
    ).length

describe('block breaker: one streak failure per play', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        recordYtDlpSuccess()
        mockGetSpotifySource.mockResolvedValue(null)
        mockSearchYtDlpCandidates.mockResolvedValue([hit])
        mockStreamViaSoundCloud.mockResolvedValue('soundcloud-stream')
    })

    it('cache hit then a fresh search of the same video counts once', async () => {
        mockGetSpotifySource.mockResolvedValue(
            'https://www.youtube.com/watch?v=vid123',
        )
        mockStreamViaYtDlp.mockRejectedValue(botcheck())

        await expect(
            createResilientStream(spotifyTrack('one') as never),
        ).resolves.toBe('soundcloud-stream')

        expect(mockStreamViaYtDlp).toHaveBeenCalledTimes(2)
        expect(failureCount('botcheck')).toBe(2)
        expect(isYtDlpBlocked()).toBe(false)
    })

    it('an empty search then a failed broad search counts once', async () => {
        mockSearchYtDlpCandidates
            .mockRejectedValueOnce(empty())
            .mockRejectedValueOnce(botcheck())

        await expect(
            createResilientStream(spotifyTrack('two') as never),
        ).resolves.toBe('soundcloud-stream')

        expect(mockSearchYtDlpCandidates).toHaveBeenCalledTimes(2)
        expect(failureCount('empty')).toBe(1)
        expect(failureCount('botcheck')).toBe(1)
        expect(isYtDlpBlocked()).toBe(false)
    })

    it('the fallback hit of an exhausted pass counts with the same play', async () => {
        const scope = { id: 'pass' }
        const ext = { context: { getContext: () => scope } }
        mockStreamViaYtDlp.mockRejectedValue(botcheck())
        mockStreamViaSoundCloud.mockRejectedValue(new Error('sc fail'))

        await expect(
            createResilientStream(
                makeTrack('https://www.youtube.com/watch?v=first') as never,
                ext,
            ),
        ).rejects.toThrow('Bridge exhausted')
        await expect(
            createResilientStream(
                makeTrack(
                    'https://www.youtube.com/watch?v=second',
                    'Searched Hit',
                ) as never,
                ext,
            ),
        ).rejects.toThrow('Bridge exhausted')

        expect(mockStreamViaYtDlp).toHaveBeenCalledWith(
            'https://www.youtube.com/watch?v=second',
        )
        expect(failureCount('botcheck')).toBe(2)
        expect(isYtDlpBlocked()).toBe(false)
    })

    it('two different plays with a bot-check still open the breaker', async () => {
        mockStreamViaYtDlp.mockRejectedValue(botcheck())

        await createResilientStream(spotifyTrack('a') as never)
        expect(isYtDlpBlocked()).toBe(false)

        await createResilientStream(spotifyTrack('b') as never)
        expect(isYtDlpBlocked()).toBe(true)
    })

    it('replaying the same track object is a new play', async () => {
        mockStreamViaYtDlp.mockRejectedValue(botcheck())
        const track = spotifyTrack('replay')

        await createResilientStream(track as never)
        await createResilientStream(track as never)

        expect(isYtDlpBlocked()).toBe(true)
    })
})
