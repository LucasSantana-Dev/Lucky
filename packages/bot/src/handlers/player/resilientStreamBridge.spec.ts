import { jest } from '@jest/globals'
import { EventEmitter } from 'events'

// --- mocks (declared before imports) ---
const mockStreamViaSoundCloud = jest.fn()
const mockCleanTitle = jest.fn()
const mockCleanAuthor = jest.fn()
const mockCleanSearchQuery = jest.fn()
const mockExtractSongCore = jest.fn()
const mockIsAvailable = jest.fn()
const mockDebugLog = jest.fn()
const mockInfoLog = jest.fn()
const mockWarnLog = jest.fn()
const mockAddBreadcrumb = jest.fn()
const mockCaptureMessage = jest.fn()
const mockStreamViaYtDlp = jest.fn()
const mockSearchYtDlpCandidates = jest.fn()
const mockStampFallbackStage = jest.fn()
const mockObserve = jest.fn()
const mockSpotifyCacheInc = jest.fn()
const mockGetSpotifySource = jest.fn()
const mockSetSpotifySource = jest.fn()
const mockSetSpotifySourceNegative = jest.fn()
const mockExtractionFailuresInc = jest.fn()

jest.mock('../../utils/monitoring/prometheus', () => ({
    playStageSeconds: { observe: (...args: unknown[]) => mockObserve(...args) },
    spotifyCacheTotal: {
        inc: (...args: unknown[]) => mockSpotifyCacheInc(...args),
    },
    // Only reached by the real breaker in the one-count-per-play suite.
    extractionFailuresTotal: {
        inc: (...args: unknown[]) => mockExtractionFailuresInc(...args),
    },
    musicExtractorDegradedGauge: { set: jest.fn() },
}))

const NEGATIVE_SENTINEL = '__negative__'
jest.mock('./spotifySourceCache', () => ({
    getSpotifySource: (...args: unknown[]) => mockGetSpotifySource(...args),
    setSpotifySource: (...args: unknown[]) => mockSetSpotifySource(...args),
    setSpotifySourceNegative: (...args: unknown[]) =>
        mockSetSpotifySourceNegative(...args),
    isNegativeEntry: (v: unknown) => v === NEGATIVE_SENTINEL,
}))

jest.mock('./soundcloudMatcher', () => ({
    streamViaSoundCloud: (...args: unknown[]) =>
        mockStreamViaSoundCloud(...args),
}))
jest.mock('../../utils/music/searchQueryCleaner', () => ({
    cleanTitle: (...args: unknown[]) => mockCleanTitle(...args),
    cleanAuthor: (...args: unknown[]) => mockCleanAuthor(...args),
    cleanSearchQuery: (...args: unknown[]) => mockCleanSearchQuery(...args),
    extractSongCore: (...args: unknown[]) => mockExtractSongCore(...args),
}))
jest.mock('../../services/musicManagement/search/providerHealth', () => ({
    providerHealthService: {
        isAvailable: (...args: unknown[]) => mockIsAvailable(...args),
    },
}))
jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => mockDebugLog(...args),
    infoLog: (...args: unknown[]) => mockInfoLog(...args),
    warnLog: (...args: unknown[]) => mockWarnLog(...args),
    errorLog: jest.fn(),
}))
jest.mock('../../utils/monitoring/sentry', () => ({
    addBreadcrumb: (...args: unknown[]) => mockAddBreadcrumb(...args),
    captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
    safeUrlOrigin: (url: unknown) => {
        if (typeof url !== 'string') return 'invalid-url'
        try {
            return new URL(url).origin
        } catch {
            return 'invalid-url'
        }
    },
    scrubUrls: (text: string) =>
        text.replace(/https?:\/\/[^\s"'<>]+/g, (m: string) => {
            try {
                return new URL(m).origin
            } catch {
                return 'invalid-url'
            }
        }),
}))
jest.mock('./ytdlpProcess', () => ({
    streamViaYtDlp: (...args: unknown[]) => mockStreamViaYtDlp(...args),
    searchYtDlpCandidates: (...args: unknown[]) =>
        mockSearchYtDlpCandidates(...args),
}))
const mockStampBridgeSource = jest.fn()
const mockClearBridgeStamps = jest.fn()
jest.mock('./streamFallbackState', () => ({
    stampFallbackStage: (...args: unknown[]) => mockStampFallbackStage(...args),
    stampBridgeSource: (...args: unknown[]) => mockStampBridgeSource(...args),
    clearBridgeStamps: (...args: unknown[]) => mockClearBridgeStamps(...args),
}))
// Off by default so the yt-dlp and SoundCloud suites below see the chain
// they were written for; the youtubei suite turns it on.
const mockIsHostedYoutubeEnabled = jest.fn(() => false)
jest.mock('../../config/featureFlags', () => ({
    isHostedYoutubeEnabled: () => mockIsHostedYoutubeEnabled(),
}))
const mockStreamViaYoutubei = jest.fn()
const mockSearchYoutubeiCandidates = jest.fn()
jest.mock('./youtubeiNativeStream', () => ({
    streamViaYoutubei: (...args: unknown[]) => mockStreamViaYoutubei(...args),
    searchYoutubeiCandidates: (...args: unknown[]) =>
        mockSearchYoutubeiCandidates(...args),
}))
const mockIsYtDlpBlocked = jest.fn(() => false)
const mockRecordYtDlpFailure = jest.fn()
const mockRecordYtDlpSuccess = jest.fn()
const mockCountYtDlpFailure = jest.fn()
jest.mock('./ytdlpBlockBreaker', () => ({
    classifyYtDlpFailure: (error: unknown) =>
        (
            jest.requireActual('./ytdlpBlockBreaker') as {
                classifyYtDlpFailure: (e: unknown) => string
            }
        ).classifyYtDlpFailure(error),
    isYtDlpBlocked: () => mockIsYtDlpBlocked(),
    recordYtDlpFailure: (...args: unknown[]) => mockRecordYtDlpFailure(...args),
    recordYtDlpSuccess: () => mockRecordYtDlpSuccess(),
    countYtDlpFailure: (...args: unknown[]) => mockCountYtDlpFailure(...args),
}))

import { isReportedBridgeExhausted } from './bridgeExhaustedError'
import {
    createResilientStream,
    streamSpotifyTrackViaBridge,
} from './resilientStreamBridge'

// Suite-wide: every test starts as a Spotify cache miss unless it says
// otherwise. clearAllMocks in the describe-level hooks keeps this default.
beforeEach(() => {
    mockGetSpotifySource.mockResolvedValue(null)
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrack(
    overrides: {
        title?: string
        author?: string
        duration?: string
        url?: string
    } = {},
) {
    let metadata: unknown = null
    return {
        title: overrides.title ?? 'Test Track',
        author: overrides.author ?? 'Test Artist',
        duration: overrides.duration ?? '3:30',
        url: overrides.url ?? 'https://www.youtube.com/watch?v=abc123',
        // Mirrors discord-player's Track: metadata is a getter-only property
        // backed by private state, mutated only via setMetadata(). A direct
        // `track.metadata = x` assignment throws in real usage.
        get metadata() {
            return metadata
        },
        setMetadata(m: unknown) {
            metadata = m
        },
    }
}

const fakeStream = new EventEmitter() as any

// A search hit that passes validation for makeTrack()'s defaults.
function hit(
    overrides: Partial<{
        id: string
        title: string
        channel: string
        durationSec: number | null
    }> = {},
) {
    return {
        id: 'vid123',
        title: 'Test Track',
        channel: 'Test Artist - Topic',
        durationSec: 210,
        ...overrides,
    }
}

// The Spotify search stage lists hits, then streams the chosen video URL.
function searchStreams() {
    mockSearchYtDlpCandidates.mockResolvedValue([hit()])
    mockStreamViaYtDlp.mockResolvedValue(fakeStream)
}

// ---------------------------------------------------------------------------
// createResilientStream — fallback chain + Sentry instrumentation
// ---------------------------------------------------------------------------

describe('createResilientStream', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockCleanTitle.mockReturnValue('Test Track')
        mockCleanAuthor.mockReturnValue('Test Artist')
        mockCleanSearchQuery.mockReturnValue('test track test artist')
        mockExtractSongCore.mockReturnValue(null)
        mockIsAvailable.mockReturnValue(true)
    })

    describe('play stage telemetry', () => {
        const stageCalls = () =>
            mockObserve.mock.calls.map(
                (c) => c[0] as { stage: string; outcome: string },
            )

        it('observes ytdlp_url ok and bridge_total ok on success', async () => {
            mockStreamViaYtDlp.mockResolvedValue(fakeStream)
            await createResilientStream(makeTrack({ url: 'https://y/ok' }))
            expect(stageCalls()).toEqual([
                { stage: 'ytdlp_url', outcome: 'ok' },
                { stage: 'bridge_total', outcome: 'ok' },
            ])
            for (const call of mockObserve.mock.calls) {
                expect(typeof call[1]).toBe('number')
                expect(call[1]).toBeGreaterThanOrEqual(0)
            }
        })

        it('observes ytdlp_url fail then soundcloud ok', async () => {
            mockStreamViaYtDlp.mockRejectedValue(new Error('boom'))
            mockStreamViaSoundCloud.mockResolvedValue(fakeStream)
            await createResilientStream(makeTrack({ url: 'https://y/fb' }))
            expect(stageCalls()).toEqual([
                { stage: 'ytdlp_url', outcome: 'fail' },
                { stage: 'soundcloud_full', outcome: 'ok' },
                { stage: 'bridge_total', outcome: 'ok' },
            ])
        })

        it('observes ytdlp_search for Spotify tracks', async () => {
            searchStreams()
            await createResilientStream(
                makeTrack({ url: 'https://open.spotify.com/track/1' }),
            )
            expect(stageCalls()).toEqual([
                { stage: 'ytdlp_search', outcome: 'ok' },
                { stage: 'bridge_total', outcome: 'ok' },
            ])
        })

        it('observes failures for every stage when all stages exhaust', async () => {
            mockExtractSongCore.mockReturnValue('Core')
            mockStreamViaYtDlp.mockRejectedValue(new Error('yt fail'))
            mockStreamViaSoundCloud.mockRejectedValue(new Error('sc fail'))
            await expect(
                createResilientStream(makeTrack({ url: 'https://y/dead' })),
            ).rejects.toThrow('Bridge exhausted')
            const calls = stageCalls()
            expect(calls[0]).toEqual({ stage: 'ytdlp_url', outcome: 'fail' })
            expect(calls.at(-1)).toEqual({
                stage: 'bridge_total',
                outcome: 'fail',
            })
            expect(calls.map((x) => x.stage)).toEqual([
                'ytdlp_url',
                'soundcloud_full',
                'soundcloud_title',
                'soundcloud_core',
                'bridge_total',
            ])
            expect(calls.every((x) => x.outcome === 'fail')).toBe(true)
        })

        it('adds durationMs to the exhausted warning after the core failure', async () => {
            mockExtractSongCore.mockReturnValue('Core')
            mockStreamViaYtDlp.mockRejectedValue(new Error('yt fail'))
            mockStreamViaSoundCloud.mockRejectedValue(new Error('sc fail'))
            await expect(
                createResilientStream(makeTrack({ url: 'https://y/core' })),
            ).rejects.toThrow('Bridge exhausted')
            const exhausted = mockWarnLog.mock.calls
                .map((c) => c[0] as { message: string; data: any })
                .find((w) => w.message === 'Bridge: all stages exhausted')
            expect(exhausted?.data.durationMs).toBeGreaterThanOrEqual(0)
            expect(typeof exhausted?.data.durationMs).toBe('number')
        })

        it('adds durationMs to the bridge success log', async () => {
            mockStreamViaYtDlp.mockResolvedValue(fakeStream)
            await createResilientStream(makeTrack({ url: 'https://y/dur' }))
            const data = mockInfoLog.mock.calls.map(
                (c) => (c[0] as { data: { durationMs: number } }).data,
            )
            expect(data).toHaveLength(1)
            expect(data[0].durationMs).toBeGreaterThanOrEqual(0)
            expect(data[0]).not.toHaveProperty('pass')
        })

        it('does not break the bridge when the histogram throws', async () => {
            mockObserve.mockImplementation(() => {
                throw new Error('metrics down')
            })
            mockStreamViaYtDlp.mockResolvedValue(fakeStream)
            await expect(
                createResilientStream(makeTrack({ url: 'https://y/safe' })),
            ).resolves.toBe(fakeStream)
            mockObserve.mockReset()
        })
    })

    it('falls back to SoundCloud when yt-dlp fails', async () => {
        mockStreamViaYtDlp.mockRejectedValue(new Error('yt-dlp failed'))
        mockStreamViaSoundCloud.mockResolvedValue(fakeStream)
        const result = await createResilientStream(makeTrack())
        expect(result).toBe(fakeStream)
        expect(mockStreamViaSoundCloud).toHaveBeenCalled()
    })

    it('throws Bridge exhausted when all stages fail', async () => {
        mockStreamViaYtDlp.mockRejectedValue(new Error('yt-dlp failed'))
        mockStreamViaSoundCloud.mockRejectedValue(new Error('no results'))
        await expect(
            createResilientStream(makeTrack({ title: 'Some Song' })),
        ).rejects.toThrow('Bridge exhausted')
        // #1500: an unplayable track is an expected outcome — WARN, not
        // error->Sentry (which produced false "regression" alerts, LUCKY-2T).
        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Bridge: all stages exhausted',
            }),
        )
    })

    it('throws immediately when cleanedTitle is empty after yt-dlp fails', async () => {
        mockCleanTitle.mockReturnValue('')
        mockCleanAuthor.mockReturnValue('')
        mockStreamViaYtDlp.mockRejectedValue(new Error('yt-dlp failed'))
        await expect(
            createResilientStream(makeTrack({ title: '' })),
        ).rejects.toThrow('Bridge exhausted: no stream for empty title')
        expect(mockStreamViaSoundCloud).not.toHaveBeenCalled()
    })

    it('captures breadcrumb on successful YouTube yt-dlp URL stream', async () => {
        mockStreamViaYtDlp.mockResolvedValue(fakeStream)
        await createResilientStream(makeTrack())
        expect(mockAddBreadcrumb).toHaveBeenCalledWith(
            'YouTube stream resolved via yt-dlp',
            'music.youtube-extraction',
            'info',
        )
    })

    it('captures breadcrumb, not a Sentry event, on yt-dlp URL extraction failure', async () => {
        mockStreamViaYtDlp.mockRejectedValue(new Error('yt-dlp error'))
        mockStreamViaSoundCloud.mockResolvedValue(fakeStream)
        await createResilientStream(makeTrack())
        // Verify breadcrumb was called for failure with redacted URL (origin only)
        expect(mockAddBreadcrumb).toHaveBeenCalledWith(
            'YouTube extraction failed via yt-dlp URL',
            'music.youtube-extraction',
            'warning',
            expect.objectContaining({
                url: 'https://www.youtube.com', // redacted to origin
            }),
        )
        expect(mockCaptureMessage).not.toHaveBeenCalled()
    })

    it('scrubs a tokenized URL out of the yt-dlp error before it reaches Sentry', async () => {
        mockStreamViaYtDlp.mockRejectedValue(
            new Error(
                'ERROR: unable to download https://rr3---sn-abc.googlevideo.com/videoplayback?sig=SECRETTOKEN&expire=1',
            ),
        )
        mockStreamViaSoundCloud.mockResolvedValue(fakeStream)
        await createResilientStream(makeTrack())

        const bcCall = mockAddBreadcrumb.mock.calls.find(
            (c) => c[0] === 'YouTube extraction failed via yt-dlp URL',
        )
        expect(
            String((bcCall?.[3] as { error?: string })?.error),
        ).not.toContain('SECRETTOKEN')
    })

    it('captures breadcrumb on successful YouTube search stream for Spotify source', async () => {
        searchStreams()
        const track = makeTrack({
            url: 'https://open.spotify.com/track/123',
        })
        mockCleanSearchQuery.mockReturnValue('song name')
        await createResilientStream(track)
        expect(mockAddBreadcrumb).toHaveBeenCalledWith(
            'YouTube search stream resolved for Spotify source',
            'music.youtube-extraction',
            'info',
        )
    })

    it('captures breadcrumb, not a Sentry event, on YouTube search extraction failure for Spotify', async () => {
        mockSearchYtDlpCandidates.mockRejectedValue(new Error('yt-dlp error'))
        mockStreamViaSoundCloud.mockResolvedValue(fakeStream)
        const track = makeTrack({
            url: 'https://open.spotify.com/track/123',
        })
        mockCleanSearchQuery.mockReturnValue('song name')
        await createResilientStream(track)
        expect(mockAddBreadcrumb).toHaveBeenCalledWith(
            'YouTube extraction failed via search',
            'music.youtube-extraction',
            'warning',
            expect.any(Object),
        )
        expect(mockCaptureMessage).not.toHaveBeenCalled()
    })

    it('captures breadcrumb when SoundCloud circuit is open', async () => {
        mockIsAvailable.mockReturnValue(false)
        mockCleanTitle.mockReturnValue('Track Name')
        mockStreamViaYtDlp.mockRejectedValue(new Error('yt-dlp failed'))
        await expect(createResilientStream(makeTrack())).rejects.toThrow(
            'Bridge exhausted',
        )
        expect(mockAddBreadcrumb).toHaveBeenCalledWith(
            'SoundCloud circuit open, skipping fallback',
            'music.youtube-extraction',
            'warning',
        )
    })

    it('captures exactly one message on exhausted all-fallback stages (with parentheticals)', async () => {
        mockStreamViaYtDlp.mockRejectedValue(new Error('yt-dlp failed'))
        mockStreamViaSoundCloud.mockRejectedValue(new Error('no results'))
        mockCleanTitle.mockReturnValue('Song (Official) Mix')
        await expect(
            createResilientStream(makeTrack({ title: 'Song (Official) Mix' })),
        ).rejects.toThrow('Bridge exhausted')
        expect(mockCaptureMessage).toHaveBeenCalledWith(
            'YouTube extraction exhausted all fallback stages',
            'warning',
            expect.any(Object),
            expect.objectContaining({
                category: 'music.youtube-extraction',
                stage: 'all-exhausted',
                failure_class: 'other',
            }),
            ['youtube-extraction-exhausted', 'other'],
        )
        expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
    })

    it('captures exactly one message on exhausted all-fallback stages (no parentheticals)', async () => {
        mockStreamViaYtDlp.mockRejectedValue(new Error('yt-dlp failed'))
        mockStreamViaSoundCloud.mockRejectedValue(new Error('no results'))
        mockCleanTitle.mockReturnValue('Simple Song Name')
        await expect(
            createResilientStream(makeTrack({ title: 'Simple Song Name' })),
        ).rejects.toThrow('Bridge exhausted')
        expect(mockCaptureMessage).toHaveBeenCalledWith(
            'YouTube extraction exhausted all fallback stages',
            'warning',
            expect.any(Object),
            expect.objectContaining({
                category: 'music.youtube-extraction',
                stage: 'all-exhausted',
                failure_class: 'other',
            }),
            ['youtube-extraction-exhausted', 'other'],
        )
        expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
    })
})

describe('Sentry events per play', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockCleanTitle.mockReturnValue('Test Track')
        mockCleanAuthor.mockReturnValue('Test Artist')
        mockCleanSearchQuery.mockReturnValue('Test Track Test Artist')
        mockExtractSongCore.mockReturnValue(null)
        mockIsAvailable.mockReturnValue(true)
        mockIsYtDlpBlocked.mockReturnValue(false)
    })

    it('sends no Sentry event when yt-dlp fails but SoundCloud succeeds', async () => {
        mockStreamViaYtDlp.mockRejectedValue(
            new Error('ERROR: HTTP Error 403: Forbidden'),
        )
        mockStreamViaSoundCloud.mockResolvedValue(fakeStream)
        await createResilientStream(makeTrack())
        expect(mockCaptureMessage).not.toHaveBeenCalled()
    })

    it('does not carry the failure class of a previous play on the same track', async () => {
        const track = makeTrack()
        mockStreamViaYtDlp.mockRejectedValueOnce(
            new Error('ERROR: HTTP Error 403: Forbidden'),
        )
        mockStreamViaSoundCloud.mockRejectedValue(new Error('no results'))
        await expect(createResilientStream(track)).rejects.toThrow(
            'Bridge exhausted',
        )
        mockCaptureMessage.mockClear()
        mockStreamViaYtDlp.mockRejectedValueOnce(
            new Error('yt-dlp exited without output'),
        )
        await expect(createResilientStream(track)).rejects.toThrow(
            'Bridge exhausted',
        )
        expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
        expect(mockCaptureMessage.mock.calls[0][4]).toEqual([
            'youtube-extraction-exhausted',
            'empty',
        ])
    })

    it('does not list yt-dlp as tried when the track has no URL', async () => {
        mockStreamViaSoundCloud.mockRejectedValue(new Error('no results'))
        await expect(
            createResilientStream(makeTrack({ url: '' })),
        ).rejects.toThrow('Bridge exhausted')
        expect(mockStreamViaYtDlp).not.toHaveBeenCalled()
        const tags = mockCaptureMessage.mock.calls[0][3] as {
            stages_tried: string
            failure_class: string
        }
        expect(tags.failure_class).toBe('none')
        expect(tags.stages_tried).not.toMatch(/(^|,)yt-dlp(,|$)/)
        expect(tags.stages_tried).toContain('yt-dlp-not-attempted')
    })

    it('marks the thrown error as reported only when the exhausted event was sent', async () => {
        mockStreamViaYtDlp.mockRejectedValue(new Error('yt-dlp failed'))
        mockStreamViaSoundCloud.mockRejectedValue(new Error('no results'))
        const reported = await createResilientStream(makeTrack()).catch(
            (e) => e,
        )
        expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
        expect(isReportedBridgeExhausted(reported)).toBe(true)

        mockCaptureMessage.mockClear()
        mockCleanTitle.mockReturnValue('')
        const emptyTitle = await createResilientStream(makeTrack()).catch(
            (e) => e,
        )
        expect(mockCaptureMessage).not.toHaveBeenCalled()
        expect(isReportedBridgeExhausted(emptyTitle)).toBe(false)

        mockCleanTitle.mockReturnValue('Test Track')
        mockIsAvailable.mockReturnValue(false)
        const circuitOpen = await createResilientStream(makeTrack()).catch(
            (e) => e,
        )
        expect(mockCaptureMessage).not.toHaveBeenCalled()
        expect(isReportedBridgeExhausted(circuitOpen)).toBe(false)
    })

    it.each([
        ['ERROR: HTTP Error 403: Forbidden', 'forbidden'],
        ['yt-dlp exited without output', 'empty'],
        ['yt-dlp timed out after 10s', 'timeout'],
    ])(
        'sends exactly one event fingerprinted by the first failure (%s)',
        async (message, failureClass) => {
            mockStreamViaYtDlp.mockRejectedValue(new Error(message))
            mockStreamViaSoundCloud.mockRejectedValue(new Error('no results'))
            await expect(createResilientStream(makeTrack())).rejects.toThrow(
                'Bridge exhausted',
            )
            expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
            expect(mockCaptureMessage).toHaveBeenCalledWith(
                'YouTube extraction exhausted all fallback stages',
                'warning',
                expect.any(Object),
                expect.objectContaining({
                    failure_class: failureClass,
                    stages_tried: expect.stringContaining('yt-dlp-url'),
                }),
                ['youtube-extraction-exhausted', failureClass],
            )
        },
    )
})

// ---------------------------------------------------------------------------
// fallback stage stamping — surfaces the resolved stage to the user (#1769)
// ---------------------------------------------------------------------------

describe('fallback stage stamping', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockCleanTitle.mockReturnValue('Test Track')
        mockCleanAuthor.mockReturnValue('Test Artist')
        mockCleanSearchQuery.mockReturnValue('test track test artist')
        mockExtractSongCore.mockReturnValue(null)
        mockIsAvailable.mockReturnValue(true)
    })

    it('does not stamp metadata when the primary yt-dlp URL stage resolves', async () => {
        mockStreamViaYtDlp.mockResolvedValue(fakeStream)
        const track = makeTrack()
        await createResilientStream(track)
        expect(mockStampFallbackStage).not.toHaveBeenCalled()
    })

    it('does not stamp metadata when the yt-dlp search stage resolves a Spotify track', async () => {
        searchStreams()
        const track = makeTrack({ url: 'https://open.spotify.com/track/123' })
        mockCleanSearchQuery.mockReturnValue('song name')
        await createResilientStream(track)
        expect(mockStampFallbackStage).not.toHaveBeenCalled()
    })

    it('stamps soundcloud-full when the full SoundCloud search resolves', async () => {
        mockStreamViaYtDlp.mockRejectedValue(new Error('yt-dlp failed'))
        mockStreamViaSoundCloud.mockResolvedValue(fakeStream)
        const track = makeTrack()
        await createResilientStream(track)
        expect(mockStampFallbackStage).toHaveBeenCalledWith(
            track,
            'soundcloud-full',
        )
    })

    it('stamps soundcloud-title when only the title-only search resolves', async () => {
        mockStreamViaYtDlp.mockRejectedValue(new Error('yt-dlp failed'))
        mockStreamViaSoundCloud
            .mockRejectedValueOnce(new Error('no results'))
            .mockResolvedValueOnce(fakeStream)
        const track = makeTrack()
        await createResilientStream(track)
        expect(mockStampFallbackStage).toHaveBeenCalledWith(
            track,
            'soundcloud-title',
        )
        // #2140: the primary-stage failure must be visible in prod (LOG_LEVEL=2
        // suppresses debugLog), so it is logged at warnLog, not debugLog.
        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message:
                    'Bridge: SoundCloud primary search failed, retrying with title only',
            }),
        )
    })

    it('requires the artist uploader on every SoundCloud stage', async () => {
        mockStreamViaYtDlp.mockRejectedValue(new Error('yt-dlp failed'))
        mockStreamViaSoundCloud
            .mockRejectedValueOnce(new Error('no validated match'))
            .mockResolvedValueOnce(fakeStream)
        mockCleanTitle.mockReturnValue('Flashing Lights')
        mockCleanAuthor.mockReturnValue('Kanye West')
        mockCleanSearchQuery.mockReturnValue('Flashing Lights Kanye West')
        const track = makeTrack({
            title: 'Flashing Lights',
            author: 'Kanye West',
            duration: '03:58',
        })

        await createResilientStream(track)

        expect(mockStreamViaSoundCloud).toHaveBeenNthCalledWith(
            1,
            'Flashing Lights Kanye West',
            '03:58',
            { expectedArtists: ['Kanye West'], sourceTitle: 'Flashing Lights' },
        )
        expect(mockStreamViaSoundCloud).toHaveBeenNthCalledWith(
            2,
            'Flashing Lights',
            '03:58',
            { expectedArtists: ['Kanye West'], sourceTitle: 'Flashing Lights' },
        )
    })

    it('stamps soundcloud-core when only the core-title search resolves', async () => {
        mockStreamViaYtDlp.mockRejectedValue(new Error('yt-dlp failed'))
        mockStreamViaSoundCloud
            .mockRejectedValueOnce(new Error('no results'))
            .mockRejectedValueOnce(new Error('no results'))
            .mockResolvedValueOnce(fakeStream)
        mockCleanTitle.mockReturnValue('Song (Official) Mix')
        const track = makeTrack({ title: 'Song (Official) Mix' })
        await createResilientStream(track)
        expect(mockStampFallbackStage).toHaveBeenCalledWith(
            track,
            'soundcloud-core',
        )
        // #2140: the title-only-stage failure must also be visible in prod.
        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message:
                    'Bridge: title-only SoundCloud failed, retrying without parentheticals',
            }),
        )
    })

    // #2142: the stage used to be gated on "title has a parenthetical to
    // strip", so titles like "Michael Jackson - Human Nature" never got a
    // third attempt. It must now run whenever stage 2 fails, broadening via
    // extractSongCore instead of being skipped outright.
    it('runs the core stage for a title with no parenthetical/suffix', async () => {
        mockStreamViaYtDlp.mockRejectedValue(new Error('yt-dlp failed'))
        mockStreamViaSoundCloud
            .mockRejectedValueOnce(new Error('no results'))
            .mockRejectedValueOnce(new Error('no results'))
            .mockResolvedValueOnce(fakeStream)
        mockCleanTitle.mockReturnValue('Michael Jackson - Human Nature')
        mockExtractSongCore.mockReturnValue('Human Nature')
        const track = makeTrack({ title: 'Michael Jackson - Human Nature' })

        await createResilientStream(track)

        expect(mockStreamViaSoundCloud).toHaveBeenNthCalledWith(
            3,
            'Human Nature',
            track.duration,
            // A channel author ("Test Artist") may not be the artist, so the
            // name in front of "Artist - Song" is accepted too.
            {
                expectedArtists: ['Test Artist', 'Michael Jackson'],
                sourceTitle: track.title,
            },
        )
        expect(mockStampFallbackStage).toHaveBeenCalledWith(
            track,
            'soundcloud-core',
        )
    })

    it('skips the core stage when the broadened query is byte-identical to one already tried', async () => {
        mockStreamViaYtDlp.mockRejectedValue(new Error('yt-dlp failed'))
        mockStreamViaSoundCloud.mockRejectedValue(new Error('no results'))
        mockCleanTitle.mockReturnValue('Simple Song Name')
        // No separator to extract a core from — nothing new to try.
        mockExtractSongCore.mockReturnValue(null)
        const track = makeTrack({ title: 'Simple Song Name' })

        await expect(createResilientStream(track)).rejects.toThrow(
            'Bridge exhausted',
        )

        // Only the two prior stages (full + title-only) were attempted.
        expect(mockStreamViaSoundCloud).toHaveBeenCalledTimes(2)
    })

    it('preserves existing track metadata when stamping the fallback stage', async () => {
        mockStreamViaYtDlp.mockRejectedValue(new Error('yt-dlp failed'))
        mockStreamViaSoundCloud.mockResolvedValue(fakeStream)
        const track = makeTrack()
        track.setMetadata({ isAutoplay: true })
        await createResilientStream(track)
        // Verify stampFallbackStage was called, which will update metadata
        expect(mockStampFallbackStage).toHaveBeenCalledWith(
            track,
            'soundcloud-full',
        )
    })
})

// ---------------------------------------------------------------------------
// yt-dlp block breaker (#2653)
// ---------------------------------------------------------------------------

describe('yt-dlp block breaker wiring (#2653)', () => {
    const spotifyTrack = () =>
        makeTrack({ url: 'https://open.spotify.com/track/123' })

    beforeEach(() => {
        jest.clearAllMocks()
        mockCleanTitle.mockReturnValue('Test Track')
        mockCleanAuthor.mockReturnValue('Test Artist')
        mockCleanSearchQuery.mockReturnValue('test track test artist')
        mockExtractSongCore.mockReturnValue(null)
        mockIsAvailable.mockReturnValue(true)
        mockStreamViaSoundCloud.mockResolvedValue(fakeStream)
    })

    it('skips the yt-dlp search stage while blocked and goes straight to SoundCloud', async () => {
        mockIsYtDlpBlocked.mockReturnValueOnce(true)

        const result = await createResilientStream(spotifyTrack())

        expect(result).toBe(fakeStream)
        expect(mockSearchYtDlpCandidates).not.toHaveBeenCalled()
        expect(mockStreamViaSoundCloud).toHaveBeenCalled()
    })

    it('skips the yt-dlp URL stage while blocked', async () => {
        mockIsYtDlpBlocked.mockReturnValueOnce(true)

        await createResilientStream(makeTrack())

        expect(mockStreamViaYtDlp).not.toHaveBeenCalled()
        expect(mockStreamViaSoundCloud).toHaveBeenCalled()
    })

    it('records a yt-dlp failure with its error', async () => {
        const error = new Error('HTTP Error 403: Forbidden')
        mockSearchYtDlpCandidates.mockRejectedValueOnce(error)

        await createResilientStream(spotifyTrack())

        expect(mockRecordYtDlpFailure).toHaveBeenCalledWith(error)
        expect(mockRecordYtDlpSuccess).not.toHaveBeenCalled()
    })

    it('records a yt-dlp success so the breaker closes', async () => {
        mockStreamViaYtDlp.mockResolvedValueOnce(fakeStream)

        await createResilientStream(makeTrack())

        expect(mockRecordYtDlpSuccess).toHaveBeenCalled()
        expect(mockRecordYtDlpFailure).not.toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// Spotify source cache
// ---------------------------------------------------------------------------

describe('Spotify source cache', () => {
    const spotifyUrl = 'https://open.spotify.com/track/abc'
    const cachedYtUrl = 'https://www.youtube.com/watch?v=cached99'
    const spotifyTrack = () => makeTrack({ url: spotifyUrl })

    beforeEach(() => {
        jest.clearAllMocks()
        mockCleanTitle.mockReturnValue('Test Track')
        mockCleanAuthor.mockReturnValue('Test Artist')
        mockCleanSearchQuery.mockReturnValue('test track test artist')
        mockExtractSongCore.mockReturnValue(null)
        mockIsAvailable.mockReturnValue(true)
    })

    it('streams the cached YouTube URL directly on a cache hit, skipping search', async () => {
        mockGetSpotifySource.mockResolvedValueOnce(cachedYtUrl)
        mockStreamViaYtDlp.mockResolvedValueOnce(fakeStream)

        const result = await createResilientStream(spotifyTrack())

        expect(result).toBe(fakeStream)
        expect(mockStreamViaYtDlp).toHaveBeenCalledWith(cachedYtUrl)
        expect(mockSearchYtDlpCandidates).not.toHaveBeenCalled()
        expect(mockSpotifyCacheInc).toHaveBeenCalledWith({ result: 'hit' })
    })

    it('falls through to search when the cached URL stream fails', async () => {
        mockGetSpotifySource.mockResolvedValueOnce(cachedYtUrl)
        mockStreamViaYtDlp
            .mockRejectedValueOnce(new Error('stale'))
            .mockResolvedValueOnce(fakeStream)
        mockSearchYtDlpCandidates.mockResolvedValueOnce([hit()])

        const result = await createResilientStream(spotifyTrack())

        expect(result).toBe(fakeStream)
        expect(mockSearchYtDlpCandidates).toHaveBeenCalledTimes(1)
        // The stale key is overwritten by the fresh hit, not left behind.
        expect(mockSetSpotifySource).toHaveBeenCalledTimes(1)
        expect(mockSetSpotifySource).toHaveBeenCalledWith(
            spotifyUrl,
            'https://www.youtube.com/watch?v=vid123',
        )
        expect(mockSetSpotifySourceNegative).not.toHaveBeenCalled()
    })

    it('records a stale cached URL failure like the normal path', async () => {
        const error = new Error('HTTP Error 403: Forbidden')
        mockGetSpotifySource.mockResolvedValueOnce(cachedYtUrl)
        mockStreamViaYtDlp
            .mockRejectedValueOnce(error)
            .mockResolvedValueOnce(fakeStream)
        mockSearchYtDlpCandidates.mockResolvedValueOnce([hit()])

        await createResilientStream(spotifyTrack())

        expect(mockRecordYtDlpFailure).toHaveBeenCalledWith(error)
        expect(mockAddBreadcrumb).toHaveBeenCalledWith(
            'YouTube extraction failed via cached Spotify source',
            'music.youtube-extraction',
            'warning',
            expect.objectContaining({ error: 'HTTP Error 403: Forbidden' }),
        )
    })

    it('keeps the cached-URL failure class for the exhausted event', async () => {
        mockGetSpotifySource.mockResolvedValueOnce(cachedYtUrl)
        mockStreamViaYtDlp.mockRejectedValueOnce(
            new Error('HTTP Error 403: Forbidden'),
        )
        mockSearchYtDlpCandidates.mockResolvedValue([])
        mockStreamViaSoundCloud.mockRejectedValue(new Error('sc fail'))

        await expect(createResilientStream(spotifyTrack())).rejects.toThrow(
            'Bridge exhausted',
        )

        expect(mockCaptureMessage).toHaveBeenCalledWith(
            'YouTube extraction exhausted all fallback stages',
            'warning',
            expect.any(Object),
            expect.objectContaining({ failure_class: 'forbidden' }),
            ['youtube-extraction-exhausted', 'forbidden'],
        )
    })

    it('observes a cache hit under the ytdlp_search stage', async () => {
        mockGetSpotifySource.mockResolvedValueOnce(cachedYtUrl)
        mockStreamViaYtDlp.mockResolvedValueOnce(fakeStream)

        await createResilientStream(spotifyTrack())

        expect(mockObserve.mock.calls.map((c) => c[0])).toEqual([
            { stage: 'ytdlp_search', outcome: 'ok' },
            { stage: 'bridge_total', outcome: 'ok' },
        ])
        expect(mockRecordYtDlpSuccess).toHaveBeenCalledTimes(1)
    })

    it('observes a failed cache hit as a ytdlp_search failure', async () => {
        mockGetSpotifySource.mockResolvedValueOnce(cachedYtUrl)
        mockStreamViaYtDlp
            .mockRejectedValueOnce(new Error('stale'))
            .mockResolvedValueOnce(fakeStream)
        mockSearchYtDlpCandidates.mockResolvedValueOnce([hit()])

        await createResilientStream(spotifyTrack())

        expect(mockObserve.mock.calls.map((c) => c[0])).toEqual([
            { stage: 'ytdlp_search', outcome: 'fail' },
            { stage: 'ytdlp_search', outcome: 'ok' },
            { stage: 'bridge_total', outcome: 'ok' },
        ])
    })

    it('writes a negative entry when the stale URL and the fresh search both fail', async () => {
        mockGetSpotifySource.mockResolvedValueOnce(cachedYtUrl)
        mockStreamViaYtDlp.mockRejectedValueOnce(new Error('stale'))
        mockSearchYtDlpCandidates.mockResolvedValue([])
        mockStreamViaSoundCloud.mockResolvedValueOnce(fakeStream)

        const result = await createResilientStream(spotifyTrack())

        expect(result).toBe(fakeStream)
        expect(mockSetSpotifySourceNegative).toHaveBeenCalledTimes(1)
        expect(mockSetSpotifySourceNegative).toHaveBeenCalledWith(spotifyUrl)
        expect(mockSetSpotifySource).not.toHaveBeenCalled()
    })

    it('does not write a negative entry on a plain cache miss that finds nothing', async () => {
        mockSearchYtDlpCandidates.mockResolvedValue([])
        mockStreamViaSoundCloud.mockResolvedValueOnce(fakeStream)

        await createResilientStream(spotifyTrack())

        expect(mockSetSpotifySourceNegative).not.toHaveBeenCalled()
    })

    it('skips the fresh search and keeps the entry when the kill switch rejects the cached URL', async () => {
        mockGetSpotifySource.mockResolvedValueOnce(cachedYtUrl)
        mockStreamViaYtDlp.mockRejectedValueOnce(
            new Error('yt-dlp: YouTube disabled (HOSTED_YOUTUBE_ENABLED)'),
        )
        mockStreamViaSoundCloud.mockResolvedValueOnce(fakeStream)

        const result = await createResilientStream(spotifyTrack())

        expect(result).toBe(fakeStream)
        expect(mockSearchYtDlpCandidates).not.toHaveBeenCalled()
        expect(mockSetSpotifySource).not.toHaveBeenCalled()
        expect(mockSetSpotifySourceNegative).not.toHaveBeenCalled()
        expect(mockStreamViaSoundCloud).toHaveBeenCalledTimes(1)
    })

    it('skips yt-dlp and goes to SoundCloud on a negative cache entry', async () => {
        mockGetSpotifySource.mockResolvedValueOnce(NEGATIVE_SENTINEL)
        mockStreamViaSoundCloud.mockResolvedValueOnce(fakeStream)

        const result = await createResilientStream(spotifyTrack())

        expect(result).toBe(fakeStream)
        expect(mockSearchYtDlpCandidates).not.toHaveBeenCalled()
        expect(mockStreamViaYtDlp).not.toHaveBeenCalled()
        expect(mockSpotifyCacheInc).toHaveBeenCalledWith({ result: 'negative' })
    })

    it('stores the resolved YouTube URL in the cache after a successful search', async () => {
        mockSearchYtDlpCandidates.mockResolvedValueOnce([hit({ id: 'vid123' })])
        mockStreamViaYtDlp.mockResolvedValueOnce(fakeStream)

        await createResilientStream(spotifyTrack())

        expect(mockSetSpotifySource).toHaveBeenCalledWith(
            spotifyUrl,
            'https://www.youtube.com/watch?v=vid123',
        )
    })

    it('does not call setSpotifySource when the search finds no candidate', async () => {
        mockSearchYtDlpCandidates.mockResolvedValueOnce([])
        mockStreamViaSoundCloud.mockResolvedValueOnce(fakeStream)
        mockIsAvailable.mockReturnValue(true)

        await createResilientStream(spotifyTrack())

        expect(mockSetSpotifySource).not.toHaveBeenCalled()
    })

    it('increments the miss counter on a cache miss', async () => {
        mockSearchYtDlpCandidates.mockResolvedValueOnce([hit()])
        mockStreamViaYtDlp.mockResolvedValueOnce(fakeStream)

        await createResilientStream(spotifyTrack())

        expect(mockSpotifyCacheInc).toHaveBeenCalledWith({ result: 'miss' })
    })
})

// ---------------------------------------------------------------------------
// Broad YouTube search retry on an empty result (LUCKY-79)
// ---------------------------------------------------------------------------

describe('empty YouTube search retry', () => {
    const spotifyTrack = () =>
        makeTrack({ url: 'https://open.spotify.com/track/123' })
    const found = (title: string) => [
        hit({ title, channel: 'Nerissima - Topic' }),
    ]

    beforeEach(() => {
        jest.clearAllMocks()
        mockCleanTitle.mockReturnValue('Tempo (Latrelle, Promessa)')
        mockCleanAuthor.mockReturnValue('Nerissima, Serp & Friend')
        mockCleanSearchQuery.mockImplementation(
            (t: unknown, a: unknown) => `${t} ${a}`,
        )
        mockExtractSongCore.mockReturnValue(null)
        mockIsAvailable.mockReturnValue(true)
        mockIsYtDlpBlocked.mockReturnValue(false)
        mockStreamViaSoundCloud.mockResolvedValue(fakeStream)
        mockStreamViaYtDlp.mockResolvedValue(fakeStream)
    })

    it('retries once without the suffix and credits, then streams via yt-dlp', async () => {
        mockSearchYtDlpCandidates
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce(found('Tempo'))

        const result = await createResilientStream(spotifyTrack())

        expect(result).toBe(fakeStream)
        expect(mockSearchYtDlpCandidates).toHaveBeenCalledTimes(2)
        expect(mockSearchYtDlpCandidates.mock.calls[0][0]).toMatch(
            / official audio$/,
        )
        expect(mockSearchYtDlpCandidates.mock.calls[1][0]).toBe(
            'Tempo Nerissima',
        )
        expect(mockStreamViaSoundCloud).not.toHaveBeenCalled()
        expect(mockObserve.mock.calls.map((c) => c[0])).toEqual([
            { stage: 'ytdlp_search', outcome: 'fail' },
            { stage: 'ytdlp_search_broad', outcome: 'ok' },
            { stage: 'bridge_total', outcome: 'ok' },
        ])
    })

    it('caches the broad search hit for the Spotify track', async () => {
        mockSearchYtDlpCandidates
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                hit({
                    id: 'broad77',
                    title: 'Tempo',
                    channel: 'Nerissima - Topic',
                }),
            ])

        await createResilientStream(spotifyTrack())

        expect(mockSetSpotifySource).toHaveBeenCalledTimes(1)
        expect(mockSetSpotifySource).toHaveBeenCalledWith(
            'https://open.spotify.com/track/123',
            'https://www.youtube.com/watch?v=broad77',
        )
    })

    it('caches the broad hit after a validated search that rejected every candidate', async () => {
        mockSearchYtDlpCandidates
            .mockResolvedValueOnce([hit({ title: 'Something Else Entirely' })])
            .mockResolvedValueOnce([
                hit({
                    id: 'broad88',
                    title: 'Tempo',
                    channel: 'Nerissima - Topic',
                }),
            ])

        await createResilientStream(spotifyTrack())

        expect(mockSetSpotifySource).toHaveBeenCalledWith(
            'https://open.spotify.com/track/123',
            'https://www.youtube.com/watch?v=broad88',
        )
    })

    it('caches nothing when the broad retry is empty too', async () => {
        mockSearchYtDlpCandidates.mockResolvedValue([])

        await createResilientStream(spotifyTrack())

        expect(mockSetSpotifySource).not.toHaveBeenCalled()
    })

    it('falls back to SoundCloud when the broad retry is empty too', async () => {
        mockSearchYtDlpCandidates.mockResolvedValue([])

        const result = await createResilientStream(spotifyTrack())

        expect(result).toBe(fakeStream)
        expect(mockSearchYtDlpCandidates).toHaveBeenCalledTimes(2)
        expect(mockStreamViaSoundCloud).toHaveBeenCalled()
        expect(mockObserve.mock.calls.map((c) => c[0].stage)).toEqual([
            'ytdlp_search',
            'ytdlp_search_broad',
            'soundcloud_full',
            'bridge_total',
        ])
    })

    it('keeps a lead artist whose name contains & or a leading x', async () => {
        mockCleanTitle.mockReturnValue('The Boxer')
        mockCleanAuthor.mockReturnValue('Simon & Garfunkel')
        mockSearchYtDlpCandidates
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce(found('The Boxer'))
        await createResilientStream(spotifyTrack())
        expect(mockSearchYtDlpCandidates.mock.calls[1][0]).toBe(
            'The Boxer Simon & Garfunkel',
        )

        mockCleanAuthor.mockReturnValue('X Ambassadors')
        mockSearchYtDlpCandidates
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce(found('The Boxer'))
        await createResilientStream(spotifyTrack())
        expect(mockSearchYtDlpCandidates.mock.calls[3][0]).toBe(
            'The Boxer X Ambassadors',
        )
    })

    it.each([
        ['Nerissima, Serp', 'Nerissima'],
        ['  Nerissima  ; Serp', 'Nerissima'],
        ['Nerissima feat. Serp', 'Nerissima'],
        ['Nerissima ft Serp', 'Nerissima'],
        ['  Simon & Garfunkel  ', 'Simon & Garfunkel'],
        ['X Ambassadors', 'X Ambassadors'],
    ])('uses the lead artist of %j', async (author, lead) => {
        mockCleanTitle.mockReturnValue('Song')
        mockCleanAuthor.mockReturnValue(author)
        mockSearchYtDlpCandidates
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce(found('Song'))
        await createResilientStream(spotifyTrack())
        expect(mockSearchYtDlpCandidates.mock.calls[1][0]).toBe(`Song ${lead}`)
    })

    it('logs the empty search as a retry, not a SoundCloud fallback', async () => {
        mockSearchYtDlpCandidates
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce(found('Tempo'))
        await createResilientStream(spotifyTrack())
        const messages = mockWarnLog.mock.calls.map(
            (c) => (c[0] as { message: string }).message,
        )
        expect(messages).toEqual([
            expect.stringContaining('retrying with a broader query'),
        ])
    })

    it('keeps the first failure class and lists the broad stage when exhausted', async () => {
        mockStreamViaSoundCloud.mockRejectedValue(new Error('sc fail'))
        mockSearchYtDlpCandidates
            .mockResolvedValueOnce([])
            .mockRejectedValueOnce(new Error('HTTP Error 403: Forbidden'))

        await expect(createResilientStream(spotifyTrack())).rejects.toThrow(
            'Bridge exhausted',
        )

        expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
        expect(mockCaptureMessage).toHaveBeenCalledWith(
            'YouTube extraction exhausted all fallback stages',
            'warning',
            expect.any(Object),
            expect.objectContaining({
                failure_class: 'empty',
                stages_tried: expect.stringContaining(
                    'yt-dlp-search,yt-dlp-search-broad',
                ),
            }),
            ['youtube-extraction-exhausted', 'empty'],
        )
    })

    it('does not retry on a 403', async () => {
        mockSearchYtDlpCandidates.mockRejectedValue(
            new Error('HTTP Error 403: Forbidden'),
        )

        await createResilientStream(spotifyTrack())

        expect(mockSearchYtDlpCandidates).toHaveBeenCalledTimes(1)
        expect(mockStreamViaSoundCloud).toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// Once-per-track guarantee (#2740)
// ---------------------------------------------------------------------------

describe('bridge runs once per track', () => {
    // discord-player runs generic stream + fallback stream for one track inside
    // one extractors.context.provide() scope; the extractor exposes it through
    // `ext.context.getContext()`.
    const makeExt = (scope: object | null) => ({
        context: { getContext: () => scope },
    })

    beforeEach(() => {
        jest.clearAllMocks()
        mockCleanTitle.mockReturnValue('Test Track')
        mockCleanAuthor.mockReturnValue('Test Artist')
        mockCleanSearchQuery.mockReturnValue('test track test artist')
        mockExtractSongCore.mockReturnValue(null)
        mockIsAvailable.mockReturnValue(true)
        mockStreamViaYtDlp.mockRejectedValue(new Error('yt fail'))
        mockStreamViaSoundCloud.mockRejectedValue(new Error('sc fail'))
    })

    const stageCount = (stage: string) =>
        mockObserve.mock.calls.filter(
            (c) => (c[0] as { stage: string }).stage === stage,
        ).length

    it('fails fast on the second call of an exhausted pass', async () => {
        const ext = makeExt({ id: 'pass-1' })

        await expect(createResilientStream(makeTrack(), ext)).rejects.toThrow(
            'Bridge exhausted',
        )
        const ytCalls = mockStreamViaYtDlp.mock.calls.length
        const scCalls = mockStreamViaSoundCloud.mock.calls.length
        expect(ytCalls).toBeGreaterThan(0)

        await expect(
            createResilientStream(makeTrack({ title: 'Searched Hit' }), ext),
        ).rejects.toThrow('Bridge exhausted')

        expect(mockStreamViaYtDlp).toHaveBeenCalledTimes(ytCalls)
        expect(mockStreamViaSoundCloud).toHaveBeenCalledTimes(scCalls)
        // One bridge_total observation per track, not per call.
        expect(stageCount('bridge_total')).toBe(1)
    })

    it('keeps the reported marker on the fail-fast second call', async () => {
        const ext = makeExt({ id: 'pass-marker' })
        const first = await createResilientStream(makeTrack(), ext).catch(
            (e) => e,
        )
        const second = await createResilientStream(
            makeTrack({ title: 'Searched Hit' }),
            ext,
        ).catch((e) => e)
        expect(isReportedBridgeExhausted(first)).toBe(true)
        expect(isReportedBridgeExhausted(second)).toBe(true)
    })

    it('lets the fallback hit with a different URL try yt-dlp once', async () => {
        const ext = makeExt({ id: 'pass-rescue' })
        await expect(
            createResilientStream(
                makeTrack({ url: 'https://youtube.com/watch?v=blocked' }),
                ext,
            ),
        ).rejects.toThrow('Bridge exhausted')
        mockObserve.mockClear()
        mockStreamViaYtDlp.mockClear()
        mockSearchYtDlpCandidates.mockClear()
        mockStreamViaSoundCloud.mockClear()

        mockStreamViaYtDlp.mockResolvedValueOnce(fakeStream)
        await expect(
            createResilientStream(
                makeTrack({ url: 'https://youtube.com/watch?v=other' }),
                ext,
            ),
        ).resolves.toBe(fakeStream)

        expect(mockStreamViaYtDlp).toHaveBeenCalledWith(
            'https://youtube.com/watch?v=other',
        )
        expect(mockSearchYtDlpCandidates).not.toHaveBeenCalled()
        expect(mockStreamViaSoundCloud).not.toHaveBeenCalled()
        expect(
            mockObserve.mock.calls.map(
                (c) => (c[0] as { stage: string }).stage,
            ),
        ).toEqual(['ytdlp_url'])
    })

    it('fails fast when the different-URL attempt also fails', async () => {
        const ext = makeExt({ id: 'pass-rescue-fail' })
        await expect(
            createResilientStream(
                makeTrack({ url: 'https://youtube.com/watch?v=a' }),
                ext,
            ),
        ).rejects.toThrow('Bridge exhausted')
        mockStreamViaYtDlp.mockClear()
        mockStreamViaSoundCloud.mockClear()
        mockObserve.mockClear()

        await expect(
            createResilientStream(
                makeTrack({ url: 'https://youtube.com/watch?v=b' }),
                ext,
            ),
        ).rejects.toThrow('Bridge exhausted')

        expect(mockStreamViaYtDlp).toHaveBeenCalledTimes(1)
        expect(mockStreamViaSoundCloud).not.toHaveBeenCalled()
        expect(stageCount('bridge_total')).toBe(0)
    })

    it('does not leak the exhausted state into a new play', async () => {
        await expect(
            createResilientStream(makeTrack(), makeExt({ id: 'pass-1' })),
        ).rejects.toThrow('Bridge exhausted')

        mockStreamViaYtDlp.mockResolvedValueOnce(fakeStream)
        await expect(
            createResilientStream(makeTrack(), makeExt({ id: 'pass-2' })),
        ).resolves.toBe(fakeStream)
    })

    it('does not block a pass that succeeded', async () => {
        const ext = makeExt({ id: 'pass-ok' })
        mockStreamViaYtDlp.mockResolvedValueOnce(fakeStream)
        await createResilientStream(makeTrack(), ext)

        mockStreamViaYtDlp.mockResolvedValueOnce(fakeStream)
        await expect(createResilientStream(makeTrack(), ext)).resolves.toBe(
            fakeStream,
        )
    })

    it('never guards calls without a pass scope', async () => {
        for (const ext of [undefined, makeExt(null), {}]) {
            mockStreamViaYtDlp.mockClear()
            await expect(
                createResilientStream(makeTrack(), ext),
            ).rejects.toThrow('Bridge exhausted')
            await expect(
                createResilientStream(makeTrack(), ext),
            ).rejects.toThrow('Bridge exhausted')
            expect(mockStreamViaYtDlp).toHaveBeenCalledTimes(2)
        }
    })
})

describe('streamSpotifyTrackViaBridge', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockCleanTitle.mockReturnValue('Test Track')
        mockCleanAuthor.mockReturnValue('Test Artist')
        mockCleanSearchQuery.mockReturnValue('test track test artist')
        mockIsAvailable.mockReturnValue(true)
    })

    const spotify = () => ({
        ...makeTrack({ url: 'https://open.spotify.com/track/abc' }),
        source: 'spotify' as const,
    })

    it('sends Spotify tracks straight to the bridge', async () => {
        mockSearchYtDlpCandidates.mockResolvedValueOnce([hit()])
        mockStreamViaYtDlp.mockResolvedValueOnce(fakeStream)

        await expect(streamSpotifyTrackViaBridge(spotify())).resolves.toBe(
            fakeStream,
        )

        expect(mockSearchYtDlpCandidates).toHaveBeenCalledTimes(1)
        expect(mockObserve).toHaveBeenCalledWith(
            { stage: 'bridge_total', outcome: 'ok' },
            expect.any(Number),
        )
    })

    it('rejects when the bridge is exhausted so the track is skipped', async () => {
        mockSearchYtDlpCandidates.mockRejectedValue(new Error('yt fail'))
        mockStreamViaSoundCloud.mockRejectedValue(new Error('sc fail'))

        await expect(streamSpotifyTrackViaBridge(spotify())).rejects.toThrow(
            'Bridge exhausted',
        )
    })

    it.each(['youtube', 'soundcloud', 'arbitrary'] as const)(
        'leaves %s tracks to the normal extractor chain',
        async (source) => {
            await expect(
                streamSpotifyTrackViaBridge({
                    ...makeTrack(),
                    source,
                } as never),
            ).resolves.toBeNull()

            expect(mockStreamViaYtDlp).not.toHaveBeenCalled()
            expect(mockSearchYtDlpCandidates).not.toHaveBeenCalled()
            expect(mockObserve).not.toHaveBeenCalled()
        },
    )
})

// ---------------------------------------------------------------------------
// Validated YouTube search hit for Spotify tracks
// ---------------------------------------------------------------------------

describe('YouTube search hit validation', () => {
    const spotifyTrack = (title = 'Test Track') =>
        makeTrack({ title, url: 'https://open.spotify.com/track/123' })
    const streamedUrls = () => mockStreamViaYtDlp.mock.calls.map((c) => c[0])

    beforeEach(() => {
        jest.clearAllMocks()
        mockCleanTitle.mockImplementation((t: unknown) => t)
        mockCleanAuthor.mockReturnValue('Test Artist')
        mockCleanSearchQuery.mockImplementation(
            (t: unknown, a: unknown) => `${t} ${a}`,
        )
        mockExtractSongCore.mockReturnValue(null)
        mockIsAvailable.mockReturnValue(true)
        mockIsYtDlpBlocked.mockReturnValue(false)
        mockStreamViaYtDlp.mockResolvedValue(fakeStream)
        mockStreamViaSoundCloud.mockResolvedValue(fakeStream)
    })

    it('skips a radio channel rip and streams the next valid hit', async () => {
        mockSearchYtDlpCandidates.mockResolvedValue([
            hit({ id: 'radio1', channel: 'Musicolor Radio' }),
            hit({ id: 'ok1', channel: 'Some Uploader' }),
        ])

        await expect(createResilientStream(spotifyTrack())).resolves.toBe(
            fakeStream,
        )

        expect(streamedUrls()).toEqual(['https://www.youtube.com/watch?v=ok1'])
    })

    it('prefers the Topic channel over an earlier valid upload', async () => {
        mockSearchYtDlpCandidates.mockResolvedValue([
            hit({
                id: 'upload1',
                title: 'Test Artist - Test Track',
                channel: 'Fan Uploads',
            }),
            hit({ id: 'topic1', channel: 'Test Artist - Topic' }),
        ])

        await createResilientStream(spotifyTrack())

        expect(streamedUrls()).toEqual([
            'https://www.youtube.com/watch?v=topic1',
        ])
    })

    it('logs the chosen video id, channel, duration and score', async () => {
        mockSearchYtDlpCandidates.mockResolvedValue([hit({ id: 'topic1' })])

        await createResilientStream(spotifyTrack())

        expect(mockInfoLog).toHaveBeenCalledWith({
            message:
                'Bridge: streamed via yt-dlp YouTube search (Spotify source)',
            data: expect.objectContaining({
                videoId: 'topic1',
                channel: 'Test Artist - Topic',
                videoDurationSec: 210,
                score: expect.any(Number),
            }),
        })
    })

    it('rejects a live version the Spotify title does not ask for', async () => {
        mockSearchYtDlpCandidates.mockResolvedValue([
            hit({ id: 'live1', title: 'Test Track (Ao Vivo)' }),
            hit({ id: 'studio1' }),
        ])

        await createResilientStream(spotifyTrack())

        expect(streamedUrls()).toEqual([
            'https://www.youtube.com/watch?v=studio1',
        ])
    })

    it('accepts a live version when the Spotify title is live too', async () => {
        mockSearchYtDlpCandidates.mockResolvedValue([
            hit({ id: 'live1', title: 'Test Track (Ao Vivo)' }),
        ])

        await createResilientStream(spotifyTrack('Test Track (Ao Vivo)'))

        expect(streamedUrls()).toEqual([
            'https://www.youtube.com/watch?v=live1',
        ])
    })

    it('rejects hits whose duration is far from the Spotify duration', async () => {
        mockSearchYtDlpCandidates.mockResolvedValue([
            hit({ id: 'long1', durationSec: 263 }),
            hit({ id: 'nodur', durationSec: null }),
        ])

        await createResilientStream(spotifyTrack())

        expect(mockStreamViaYtDlp).not.toHaveBeenCalled()
        expect(mockStreamViaSoundCloud).toHaveBeenCalled()
    })

    it('falls through to the broad search, then SoundCloud, logging the rejected hits', async () => {
        mockSearchYtDlpCandidates.mockResolvedValue([
            hit({ id: 'radio1', channel: 'Musicolor Radio' }),
            hit({ id: 'other1', title: 'Another Song' }),
        ])

        await expect(createResilientStream(spotifyTrack())).resolves.toBe(
            fakeStream,
        )

        expect(mockSearchYtDlpCandidates).toHaveBeenCalledTimes(2)
        expect(mockStreamViaYtDlp).not.toHaveBeenCalled()
        expect(mockRecordYtDlpFailure).not.toHaveBeenCalled()
        expect(mockObserve.mock.calls.map((c) => c[0])).toEqual([
            { stage: 'ytdlp_search', outcome: 'fail' },
            { stage: 'ytdlp_search_broad', outcome: 'fail' },
            { stage: 'soundcloud_full', outcome: 'ok' },
            { stage: 'bridge_total', outcome: 'ok' },
        ])
        const noMatch = mockWarnLog.mock.calls.find((c) =>
            (c[0] as { message: string }).message.startsWith(
                'Bridge: no validated YouTube search hit',
            ),
        )
        expect(
            (noMatch?.[0] as { data: { rejected: unknown } }).data.rejected,
        ).toEqual([
            expect.objectContaining({ id: 'radio1', reason: 'channel' }),
            expect.objectContaining({ id: 'other1', reason: 'title' }),
        ])
    })

    it('fingerprints the exhausted event as no_match', async () => {
        mockSearchYtDlpCandidates.mockResolvedValue([
            hit({ id: 'long1', durationSec: 400 }),
        ])
        mockStreamViaSoundCloud.mockRejectedValue(new Error('sc fail'))

        await expect(createResilientStream(spotifyTrack())).rejects.toThrow(
            'Bridge exhausted',
        )

        expect(mockCaptureMessage.mock.calls[0][4]).toEqual([
            'youtube-extraction-exhausted',
            'no_match',
        ])
    })
})

describe('youtubei native stage', () => {
    const spotifyUrl = 'https://open.spotify.com/track/123'
    const spotifyTrack = () => makeTrack({ url: spotifyUrl })
    const youtubeTrack = () =>
        makeTrack({ url: 'https://www.youtube.com/watch?v=abcdefghijk' })
    const nativeStream = new EventEmitter() as any
    const stageCalls = () => mockObserve.mock.calls.map((c) => c[0])
    const exhaustedStages = () =>
        (
            mockWarnLog.mock.calls.find(
                (c) =>
                    (c[0] as { message: string }).message ===
                    'Bridge: all stages exhausted',
            )?.[0] as { data: { stages: string[] } }
        ).data.stages

    beforeEach(() => {
        jest.clearAllMocks()
        mockIsHostedYoutubeEnabled.mockReturnValue(true)
        mockCleanTitle.mockReturnValue('Test Track')
        mockCleanAuthor.mockReturnValue('Test Artist')
        mockCleanSearchQuery.mockReturnValue('test track test artist')
        mockExtractSongCore.mockReturnValue(null)
        mockIsAvailable.mockReturnValue(true)
        mockIsYtDlpBlocked.mockReturnValue(false)
        mockStreamViaYtDlp.mockRejectedValue(
            new Error("Sign in to confirm you're not a bot"),
        )
        mockSearchYtDlpCandidates.mockRejectedValue(
            new Error("Sign in to confirm you're not a bot"),
        )
        mockStreamViaSoundCloud.mockResolvedValue(fakeStream)
    })

    afterAll(() => {
        mockIsHostedYoutubeEnabled.mockReturnValue(false)
    })

    it('streams the YouTube URL video via youtubei when yt-dlp fails', async () => {
        mockStreamViaYoutubei.mockResolvedValue(nativeStream)
        const track = youtubeTrack()

        await expect(createResilientStream(track)).resolves.toBe(nativeStream)

        expect(mockStreamViaYoutubei).toHaveBeenCalledWith('abcdefghijk')
        expect(mockSearchYoutubeiCandidates).not.toHaveBeenCalled()
        expect(mockStreamViaSoundCloud).not.toHaveBeenCalled()
        expect(mockStampBridgeSource).toHaveBeenCalledWith(
            track,
            'youtubei-native',
        )
        expect(stageCalls()).toEqual([
            { stage: 'ytdlp_url', outcome: 'fail' },
            { stage: 'youtubei_native', outcome: 'ok' },
            { stage: 'bridge_total', outcome: 'ok' },
        ])
        expect(mockInfoLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Bridge: streamed via youtubei',
                data: expect.objectContaining({
                    stage: 'youtubei-native',
                    videoId: 'abcdefghijk',
                }),
            }),
        )
    })

    it('streams a validated youtubei search hit for a Spotify track and caches it', async () => {
        mockSearchYoutubeiCandidates.mockResolvedValue([hit({ id: 'yti1' })])
        mockStreamViaYoutubei.mockResolvedValue(nativeStream)

        await expect(createResilientStream(spotifyTrack())).resolves.toBe(
            nativeStream,
        )

        expect(mockSearchYoutubeiCandidates).toHaveBeenCalledWith(
            'test track test artist official audio',
        )
        expect(mockStreamViaYoutubei).toHaveBeenCalledWith('yti1')
        expect(mockSetSpotifySource).toHaveBeenCalledWith(
            spotifyUrl,
            expect.stringContaining('yti1'),
        )
    })

    it('runs while the yt-dlp breaker is open', async () => {
        mockIsYtDlpBlocked.mockReturnValue(true)
        mockSearchYoutubeiCandidates.mockResolvedValue([hit()])
        mockStreamViaYoutubei.mockResolvedValue(nativeStream)

        await expect(createResilientStream(spotifyTrack())).resolves.toBe(
            nativeStream,
        )
        expect(mockSearchYtDlpCandidates).not.toHaveBeenCalled()
    })

    it('falls to SoundCloud when youtubei fails, and lists the stage when all exhaust', async () => {
        mockStreamViaYoutubei.mockRejectedValue(
            new Error('youtubei stream timed out after 8000ms'),
        )
        await expect(createResilientStream(youtubeTrack())).resolves.toBe(
            fakeStream,
        )
        expect(mockStampBridgeSource).not.toHaveBeenCalled()
        expect(mockStampFallbackStage).toHaveBeenCalledWith(
            expect.anything(),
            'soundcloud-full',
        )
        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Bridge: youtubei failed, falling back to SoundCloud',
            }),
        )

        jest.clearAllMocks()
        mockStreamViaSoundCloud.mockRejectedValue(new Error('sc fail'))
        await expect(createResilientStream(youtubeTrack())).rejects.toThrow(
            'Bridge exhausted',
        )
        expect(exhaustedStages()).toEqual([
            'yt-dlp-url',
            'youtubei-native',
            'soundcloud-full',
            'soundcloud-title',
        ])
    })

    it('falls to SoundCloud when no youtubei search hit validates', async () => {
        mockSearchYoutubeiCandidates.mockResolvedValue([
            hit({ id: 'radio1', channel: 'Musicolor Radio' }),
        ])

        await expect(createResilientStream(spotifyTrack())).resolves.toBe(
            fakeStream,
        )
        expect(mockStreamViaYoutubei).not.toHaveBeenCalled()
        expect(mockObserve).toHaveBeenCalledWith(
            { stage: 'youtubei_native', outcome: 'fail' },
            expect.any(Number),
        )
    })

    it('skips the youtubei search when the yt-dlp search found no valid hit', async () => {
        mockSearchYtDlpCandidates.mockResolvedValue([
            hit({ id: 'long1', durationSec: 400 }),
        ])

        await createResilientStream(spotifyTrack())

        expect(mockSearchYoutubeiCandidates).not.toHaveBeenCalled()
        expect(mockStreamViaSoundCloud).toHaveBeenCalled()
    })

    it('is skipped entirely with HOSTED_YOUTUBE_ENABLED off', async () => {
        mockIsHostedYoutubeEnabled.mockReturnValue(false)
        mockStreamViaSoundCloud.mockRejectedValue(new Error('sc fail'))

        await expect(createResilientStream(youtubeTrack())).rejects.toThrow(
            'Bridge exhausted',
        )

        expect(mockStreamViaYoutubei).not.toHaveBeenCalled()
        expect(mockSearchYoutubeiCandidates).not.toHaveBeenCalled()
        expect(exhaustedStages()).not.toContain('youtubei-native')
    })

    it('clears the previous play stamps before resolving', async () => {
        mockStreamViaYtDlp.mockResolvedValue(fakeStream)
        const track = youtubeTrack()

        await createResilientStream(track)

        expect(mockClearBridgeStamps).toHaveBeenCalledWith(track)
    })
})

// ---------------------------------------------------------------------------
// One bridge play counts at most once toward the block breaker
// ---------------------------------------------------------------------------

describe('yt-dlp block breaker counts one failure per play', () => {
    type Breaker = typeof import('./ytdlpBlockBreaker')
    const breaker = jest.requireActual('./ytdlpBlockBreaker') as Breaker
    const forbidden = () => new Error('ERROR: HTTP Error 403: Forbidden')
    const botcheck = () =>
        new Error("ERROR: Sign in to confirm you're not a bot")
    const makeExt = (scope: object) => ({
        context: { getContext: () => scope },
    })
    const failureTypes = () =>
        mockExtractionFailuresInc.mock.calls.map(
            (c) => (c[0] as { type: string }).type,
        )

    beforeEach(() => {
        jest.clearAllMocks()
        mockCleanTitle.mockReturnValue('Test Track')
        mockCleanAuthor.mockReturnValue('Test Artist')
        mockCleanSearchQuery.mockReturnValue('test track test artist')
        mockExtractSongCore.mockReturnValue(null)
        mockIsAvailable.mockReturnValue(true)
        mockStreamViaSoundCloud.mockResolvedValue(fakeStream)
        // The real breaker, so the test sees whether it opens.
        breaker.recordYtDlpSuccess()
        mockIsYtDlpBlocked.mockImplementation(() => breaker.isYtDlpBlocked())
        mockRecordYtDlpFailure.mockImplementation((error) =>
            breaker.recordYtDlpFailure(error),
        )
        mockRecordYtDlpSuccess.mockImplementation(() =>
            breaker.recordYtDlpSuccess(),
        )
        mockCountYtDlpFailure.mockImplementation((error) =>
            breaker.countYtDlpFailure(error),
        )
    })

    afterEach(() => {
        breaker.recordYtDlpSuccess()
        mockIsYtDlpBlocked.mockImplementation(() => false)
        mockRecordYtDlpFailure.mockReset()
        mockRecordYtDlpSuccess.mockReset()
        mockCountYtDlpFailure.mockReset()
        mockStreamViaYtDlp.mockReset()
        mockSearchYtDlpCandidates.mockReset()
    })

    it('does not open on a stale Spotify cache hit and a fresh search of the same video', async () => {
        mockGetSpotifySource.mockResolvedValue(
            'https://www.youtube.com/watch?v=vid123',
        )
        mockSearchYtDlpCandidates.mockResolvedValue([hit()])
        mockStreamViaYtDlp.mockRejectedValue(forbidden())

        await createResilientStream(
            makeTrack({ url: 'https://open.spotify.com/track/stale' }),
        )

        expect(mockStreamViaYtDlp).toHaveBeenCalledTimes(2)
        expect(breaker.isYtDlpBlocked()).toBe(false)
        // The metric still sees both failures.
        expect(failureTypes()).toEqual(['forbidden', 'forbidden'])
    })

    it('does not open on an empty search followed by a failed broad retry', async () => {
        mockSearchYtDlpCandidates
            .mockRejectedValueOnce(new Error('yt-dlp exited without output'))
            .mockRejectedValueOnce(botcheck())

        await createResilientStream(
            makeTrack({ url: 'https://open.spotify.com/track/niche' }),
        )

        expect(mockSearchYtDlpCandidates).toHaveBeenCalledTimes(2)
        expect(breaker.isYtDlpBlocked()).toBe(false)
        expect(failureTypes()).toEqual(['empty', 'botcheck'])
    })

    it("does not open on a URL failure and discord-player's fallback pass", async () => {
        mockStreamViaYtDlp.mockRejectedValue(forbidden())
        mockStreamViaSoundCloud.mockRejectedValue(new Error('sc fail'))
        const ext = makeExt({ id: 'one-play' })

        await expect(
            createResilientStream(
                makeTrack({ url: 'https://youtube.com/watch?v=a' }),
                ext,
            ),
        ).rejects.toThrow('Bridge exhausted')
        await expect(
            createResilientStream(
                makeTrack({ url: 'https://youtube.com/watch?v=b' }),
                ext,
            ),
        ).rejects.toThrow('Bridge exhausted')

        expect(mockStreamViaYtDlp).toHaveBeenCalledTimes(2)
        expect(breaker.isYtDlpBlocked()).toBe(false)
        expect(failureTypes()).toEqual(['forbidden', 'forbidden'])
    })

    it('still counts a later failure when the first one of the play did not count', async () => {
        mockStreamViaYtDlp
            .mockRejectedValueOnce(new Error('Video unavailable'))
            .mockRejectedValue(forbidden())
        mockStreamViaSoundCloud.mockRejectedValue(new Error('sc fail'))
        const ext = makeExt({ id: 'other-then-403' })

        await createResilientStream(
            makeTrack({ url: 'https://youtube.com/watch?v=a' }),
            ext,
        ).catch(() => undefined)
        await createResilientStream(
            makeTrack({ url: 'https://youtube.com/watch?v=b' }),
            ext,
        ).catch(() => undefined)
        expect(breaker.isYtDlpBlocked()).toBe(false)

        await createResilientStream(
            makeTrack({ url: 'https://youtube.com/watch?v=c' }),
        ).catch(() => undefined)

        expect(breaker.isYtDlpBlocked()).toBe(true)
    })

    it('still opens on two separate failing plays', async () => {
        mockSearchYtDlpCandidates.mockResolvedValue([hit()])
        mockStreamViaYtDlp.mockRejectedValue(forbidden())

        await createResilientStream(
            makeTrack({ url: 'https://open.spotify.com/track/one' }),
        )
        expect(breaker.isYtDlpBlocked()).toBe(false)
        await createResilientStream(
            makeTrack({ url: 'https://open.spotify.com/track/two' }),
        )

        expect(breaker.isYtDlpBlocked()).toBe(true)
    })

    it('counts a replay of the same Track instance as a new play', async () => {
        mockSearchYtDlpCandidates.mockResolvedValue([hit()])
        mockStreamViaYtDlp.mockRejectedValue(forbidden())
        const track = makeTrack({ url: 'https://open.spotify.com/track/again' })

        await createResilientStream(track)
        await createResilientStream(track)

        expect(breaker.isYtDlpBlocked()).toBe(true)
    })
})
