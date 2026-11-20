import { jest } from '@jest/globals'

// Runs the real bridge against the real block breaker: one play that reaches
// yt-dlp several times must add one failure to the streak, not one per
// attempt, or a single bad upload switches YouTube off for every guild.
const mockStreamViaYtDlp = jest.fn()
const mockSearchYtDlpCandidates = jest.fn()
const mockStreamViaSoundCloud = jest.fn()
const mockGetSpotifySource = jest.fn()
const mockFailureInc = jest.fn()
let mockSoundCloudAvailable = true

jest.mock('./ytdlpProcess', () => ({
    streamViaYtDlp: (...args: unknown[]) => mockStreamViaYtDlp(...args),
    searchYtDlpCandidates: (...args: unknown[]) =>
        mockSearchYtDlpCandidates(...args),
}))
jest.mock('./soundcloudMatcher', () => ({
    resolveViaSoundCloud: async (...args: unknown[]) => ({
        stream: await mockStreamViaSoundCloud(...args),
        match: { id: 'https://soundcloud.com/artist/song' },
    }),
    streamSoundCloudTrack: jest.fn(),
}))
jest.mock('./spotifyIsrc', () => ({
    ensureSpotifyIsrc: jest.fn(async () => null),
    trackIsrc: () => null,
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
    providerHealthService: { isAvailable: () => mockSoundCloudAvailable },
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

import { captureMessage } from '../../utils/monitoring/sentry'
import { createResilientStream } from './resilientStreamBridge'
import { isReportedBridgeExhausted } from './bridgeExhaustedError'
import {
    getBreakerEpisode,
    isYtDlpBlocked,
    recordYtDlpSuccess,
    claimBreakerEpisodeReport,
    YTDLP_BLOCK_COOLDOWN_MS,
} from './ytdlpBlockBreaker'

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
        mockGetSpotifySource.mockResolvedValue({
            source: 'youtube',
            id: 'vid123',
            method: 'ytdlp-search',
        })
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

    it('replaying the same track object is a new play but the same video (#2973)', async () => {
        mockStreamViaYtDlp.mockRejectedValue(botcheck())
        const track = spotifyTrack('replay')

        await createResilientStream(track as never)
        await createResilientStream(track as never)

        expect(failureCount('botcheck')).toBe(2)
        expect(isYtDlpBlocked()).toBe(false)
    })
})

describe('breaker open: one Sentry event per episode (#3082)', () => {
    const exhaustedEvents = () =>
        (captureMessage as jest.Mock).mock.calls.filter(
            (c) =>
                c[0] === 'YouTube extraction exhausted all fallback stages' &&
                (c[3] as { failure_class: string }).failure_class ===
                    'breaker_open',
        )

    beforeEach(() => {
        jest.clearAllMocks()
        recordYtDlpSuccess()
        mockGetSpotifySource.mockResolvedValue(null)
        mockSearchYtDlpCandidates.mockResolvedValue([hit])
        mockStreamViaSoundCloud.mockRejectedValue(new Error('sc fail'))
        mockStreamViaYtDlp.mockRejectedValue(botcheck())
    })

    async function openBreaker() {
        await createResilientStream(spotifyTrack('open-a') as never).catch(
            () => undefined,
        )
        await createResilientStream(spotifyTrack('open-b') as never).catch(
            () => undefined,
        )
        expect(isYtDlpBlocked()).toBe(true)
    }

    it('reports the first exhausted play only, and counts every play', async () => {
        await openBreaker()
        jest.clearAllMocks()

        for (const id of ['p1', 'p2', 'p3']) {
            await expect(
                createResilientStream(spotifyTrack(id) as never),
            ).rejects.toThrow('Bridge exhausted')
        }

        expect(exhaustedEvents()).toHaveLength(1)
        expect(failureCount('breaker_open')).toBe(3)
    })

    it('reports again in a new episode after the breaker closed', async () => {
        await openBreaker()
        jest.clearAllMocks()
        await createResilientStream(spotifyTrack('q1') as never).catch(
            () => undefined,
        )
        recordYtDlpSuccess()
        await openBreaker()
        await createResilientStream(spotifyTrack('q2') as never).catch(
            () => undefined,
        )

        expect(exhaustedEvents()).toHaveLength(2)
    })

    it('counts and dedupes plays that fail on the SoundCloud-circuit-open branch', async () => {
        await openBreaker()
        jest.clearAllMocks()
        mockSoundCloudAvailable = false
        try {
            const errors: unknown[] = []
            for (const id of ['s1', 's2', 's3']) {
                errors.push(
                    await createResilientStream(spotifyTrack(id) as never).then(
                        () => null,
                        (e: unknown) => e,
                    ),
                )
            }
            expect(errors.map(isReportedBridgeExhausted)).toEqual([
                false,
                true,
                true,
            ])
            expect(failureCount('breaker_open')).toBe(3)
        } finally {
            mockSoundCloudAvailable = true
        }
    })

    it('counts and dedupes plays that fail on the empty-title branch', async () => {
        await openBreaker()
        jest.clearAllMocks()
        const errors: unknown[] = []
        for (const id of ['e1', 'e2']) {
            const track = makeTrack(`https://open.spotify.com/track/${id}`, '')
            errors.push(
                await createResilientStream(track as never).then(
                    () => null,
                    (e: unknown) => e,
                ),
            )
        }
        expect(errors.map(isReportedBridgeExhausted)).toEqual([false, true])
        expect(failureCount('breaker_open')).toBe(2)
    })

    it('a stale play cannot consume the slot of a newer episode', async () => {
        await openBreaker()
        const staleEpisode = getBreakerEpisode()
        recordYtDlpSuccess()
        await openBreaker()
        const freshEpisode = getBreakerEpisode()
        expect(freshEpisode).not.toBe(staleEpisode)

        expect(claimBreakerEpisodeReport(staleEpisode)).toBe(true)
        expect(claimBreakerEpisodeReport(staleEpisode)).toBe(false)
        expect(claimBreakerEpisodeReport(freshEpisode)).toBe(true)
        expect(claimBreakerEpisodeReport(freshEpisode)).toBe(false)
    })

    it('reports again in a new episode after the cooldown expired', async () => {
        jest.useFakeTimers()
        try {
            await openBreaker()
            jest.clearAllMocks()
            await createResilientStream(spotifyTrack('c1') as never).catch(
                () => undefined,
            )
            expect(exhaustedEvents()).toHaveLength(1)

            jest.advanceTimersByTime(YTDLP_BLOCK_COOLDOWN_MS + 1)
            expect(isYtDlpBlocked()).toBe(false)

            await openBreaker()
            await createResilientStream(spotifyTrack('c2') as never).catch(
                () => undefined,
            )
            expect(exhaustedEvents()).toHaveLength(2)
        } finally {
            jest.useRealTimers()
        }
    })

    it('keeps reporting other failure classes per play', async () => {
        mockStreamViaYtDlp.mockRejectedValue(new Error('weird failure'))

        for (const id of ['r1', 'r2']) {
            await createResilientStream(spotifyTrack(id) as never).catch(
                () => undefined,
            )
        }

        expect(
            (captureMessage as jest.Mock).mock.calls.filter(
                (c) =>
                    c[0] === 'YouTube extraction exhausted all fallback stages',
            ),
        ).toHaveLength(2)
        expect(failureCount('breaker_open')).toBe(0)
    })
})
