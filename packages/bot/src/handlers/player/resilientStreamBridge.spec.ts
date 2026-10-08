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
const mockStreamViaYtDlpSearch = jest.fn()
const mockStampFallbackStage = jest.fn()
const mockObserve = jest.fn()

jest.mock('../../utils/monitoring/prometheus', () => ({
    playStageSeconds: { observe: (...args: unknown[]) => mockObserve(...args) },
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
    streamViaYtDlpSearch: (...args: unknown[]) =>
        mockStreamViaYtDlpSearch(...args),
}))
jest.mock('./streamFallbackState', () => ({
    stampFallbackStage: (...args: unknown[]) => mockStampFallbackStage(...args),
}))
const mockIsYtDlpBlocked = jest.fn(() => false)
const mockRecordYtDlpFailure = jest.fn()
const mockRecordYtDlpSuccess = jest.fn()
jest.mock('./ytdlpBlockBreaker', () => ({
    isYtDlpBlocked: () => mockIsYtDlpBlocked(),
    recordYtDlpFailure: (...args: unknown[]) => mockRecordYtDlpFailure(...args),
    recordYtDlpSuccess: () => mockRecordYtDlpSuccess(),
}))

import {
    createResilientStream,
    streamSpotifyTrackViaBridge,
} from './resilientStreamBridge'

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
            mockStreamViaYtDlpSearch.mockResolvedValue(fakeStream)
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

    it('captures breadcrumb and message on yt-dlp URL extraction failure', async () => {
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
        // Verify captureMessage was called with correct stage as tag and redacted URL
        expect(mockCaptureMessage).toHaveBeenCalledWith(
            expect.stringContaining('YouTube extraction failed'),
            'warning',
            expect.objectContaining({
                url: 'https://www.youtube.com', // redacted to origin
            }),
            expect.objectContaining({
                category: 'music.youtube-extraction',
                stage: 'yt-dlp-url',
            }),
        )
    })

    it('scrubs a tokenized URL out of the yt-dlp error before it reaches Sentry', async () => {
        mockStreamViaYtDlp.mockRejectedValue(
            new Error(
                'ERROR: unable to download https://rr3---sn-abc.googlevideo.com/videoplayback?sig=SECRETTOKEN&expire=1',
            ),
        )
        mockStreamViaSoundCloud.mockResolvedValue(fakeStream)
        await createResilientStream(makeTrack())

        const msgCall = mockCaptureMessage.mock.calls.find((c) =>
            String(c[0]).includes('YouTube extraction failed'),
        )
        expect(msgCall).toBeDefined()
        expect(String(msgCall?.[0])).not.toContain('SECRETTOKEN')
        expect(String(msgCall?.[0])).not.toContain('sig=')
        expect(String(msgCall?.[0])).toContain(
            'https://rr3---sn-abc.googlevideo.com',
        )

        const bcCall = mockAddBreadcrumb.mock.calls.find(
            (c) => c[0] === 'YouTube extraction failed via yt-dlp URL',
        )
        expect(
            String((bcCall?.[3] as { error?: string })?.error),
        ).not.toContain('SECRETTOKEN')
    })

    it('captures breadcrumb on successful YouTube search stream for Spotify source', async () => {
        mockStreamViaYtDlpSearch.mockResolvedValue(fakeStream)
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

    it('captures breadcrumb and message on YouTube search extraction failure for Spotify', async () => {
        mockStreamViaYtDlpSearch.mockRejectedValue(new Error('yt-dlp error'))
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
        expect(mockCaptureMessage).toHaveBeenCalledWith(
            expect.stringContaining('YouTube search extraction failed'),
            'warning',
            expect.any(Object),
            expect.objectContaining({
                category: 'music.youtube-extraction',
                stage: 'yt-dlp-search',
            }),
        )
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

    it('captures message on exhausted all-fallback stages (with parentheticals)', async () => {
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
            }),
        )
    })

    it('captures message on exhausted all-fallback stages (no parentheticals)', async () => {
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
            }),
        )
    })
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
        mockStreamViaYtDlpSearch.mockResolvedValue(fakeStream)
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
        expect(mockStreamViaYtDlpSearch).not.toHaveBeenCalled()
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
        mockStreamViaYtDlpSearch.mockRejectedValueOnce(error)

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
        mockStreamViaYtDlpSearch.mockResolvedValueOnce(fakeStream)

        await expect(streamSpotifyTrackViaBridge(spotify())).resolves.toBe(
            fakeStream,
        )

        expect(mockStreamViaYtDlpSearch).toHaveBeenCalledTimes(1)
        expect(mockObserve).toHaveBeenCalledWith(
            { stage: 'bridge_total', outcome: 'ok' },
            expect.any(Number),
        )
    })

    it('rejects when the bridge is exhausted so the track is skipped', async () => {
        mockStreamViaYtDlpSearch.mockRejectedValue(new Error('yt fail'))
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
            expect(mockStreamViaYtDlpSearch).not.toHaveBeenCalled()
            expect(mockObserve).not.toHaveBeenCalled()
        },
    )
})
