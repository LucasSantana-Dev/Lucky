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
jest.mock('../../utils/music/search/providerHealth', () => ({
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

import { createResilientStream } from './resilientStreamBridge'
import { STREAM_BRIDGE_FALLBACK_METADATA_KEY } from './streamFallbackState'

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
