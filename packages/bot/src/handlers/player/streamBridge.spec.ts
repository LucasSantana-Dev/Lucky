import { jest } from '@jest/globals'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'

// --- mocks (declared before imports) ---
const mockSpawn = jest.fn()
const mockStreamViaSoundCloud = jest.fn()
const mockCleanTitle = jest.fn()
const mockCleanAuthor = jest.fn()
const mockCleanSearchQuery = jest.fn()
const mockIsAvailable = jest.fn()
const mockDebugLog = jest.fn()
const mockInfoLog = jest.fn()
const mockWarnLog = jest.fn()
const mockErrorLog = jest.fn()
const mockAddBreadcrumb = jest.fn()
const mockCaptureMessage = jest.fn()

jest.mock('child_process', () => ({
    spawn: (...args: unknown[]) => mockSpawn(...args),
}))
jest.mock('./soundcloudMatcher', () => ({
    streamViaSoundCloud: (...args: unknown[]) =>
        mockStreamViaSoundCloud(...args),
}))
jest.mock('../../utils/music/searchQueryCleaner', () => ({
    cleanTitle: (...args: unknown[]) => mockCleanTitle(...args),
    cleanAuthor: (...args: unknown[]) => mockCleanAuthor(...args),
    cleanSearchQuery: (...args: unknown[]) => mockCleanSearchQuery(...args),
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
    errorLog: (...args: unknown[]) => mockErrorLog(...args),
}))
jest.mock('../../utils/monitoring/sentry', () => ({
    addBreadcrumb: (...args: unknown[]) => mockAddBreadcrumb(...args),
    captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
}))

import {
    streamViaYtDlp,
    streamViaYtDlpSearch,
    createResilientStream,
} from './streamBridge.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FakeProc = EventEmitter & {
    stdout: PassThrough
    stderr: PassThrough
    kill: jest.Mock
}

function makeFakeProc(): FakeProc {
    const proc = new EventEmitter() as FakeProc
    proc.stdout = new PassThrough()
    proc.stderr = new PassThrough()
    proc.kill = jest.fn()
    return proc
}

function makeTrack(
    overrides: {
        title?: string
        author?: string
        duration?: string
        url?: string
    } = {},
) {
    return {
        title: overrides.title ?? 'Test Track',
        author: overrides.author ?? 'Test Artist',
        duration: overrides.duration ?? '3:30',
        url: overrides.url ?? 'https://www.youtube.com/watch?v=abc123',
    }
}

const fakeStream = new EventEmitter() as any

// ---------------------------------------------------------------------------
// streamViaYtDlp — URL validation
// ---------------------------------------------------------------------------

describe('streamViaYtDlp – URL validation', () => {
    it.each([
        ['not-a-url', 'yt-dlp: invalid URL'],
        [
            'http://www.youtube.com/watch?v=abc',
            'yt-dlp: only https URLs are allowed',
        ],
        ['https://evil.example.com/video', 'yt-dlp: domain not in allowlist'],
    ])('rejects on validation error: %s', async (url, expectedError) => {
        await expect(streamViaYtDlp(url)).rejects.toThrow(expectedError)
    })

    it.each([
        'https://www.youtube.com/watch?v=x',
        'https://youtu.be/x',
        'https://soundcloud.com/artist/track',
    ])('accepts allowed domain: %s', async (url) => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => proc.stdout.emit('data', Buffer.from('bytes')))
        await expect(streamViaYtDlp(url)).resolves.toBeDefined()
    })
})

// ---------------------------------------------------------------------------
// streamViaYtDlp — process lifecycle
// ---------------------------------------------------------------------------

describe('streamViaYtDlp – process lifecycle', () => {
    const validUrl = 'https://www.youtube.com/watch?v=abc123'

    it.each([
        [
            (proc: FakeProc) => proc.emit('error', new Error('ENOENT yt-dlp')),
            'ENOENT yt-dlp',
        ],
        [
            (proc: FakeProc) => {
                proc.stderr.emit('data', Buffer.from('Video unavailable'))
                proc.emit('close', 1)
            },
            'yt-dlp exited with code 1 — Video unavailable',
        ],
        [
            (proc: FakeProc) => proc.emit('close', 2),
            'yt-dlp exited with code 2',
        ],
    ])('rejects on process error', async (emitFn, expectedError) => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => emitFn(proc))
        await expect(streamViaYtDlp(validUrl)).rejects.toThrow(expectedError)
    })

    it('kills proc and rejects on timeout', async () => {
        jest.useFakeTimers()
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        // never emit stdout data — let the timeout fire
        const promise = streamViaYtDlp(validUrl)
        jest.advanceTimersByTime(15_000)
        await expect(promise).rejects.toThrow('yt-dlp: timed out')
        expect(proc.kill).toHaveBeenCalled()
        jest.useRealTimers()
    })
})

// ---------------------------------------------------------------------------
// streamViaYtDlpSearch
// ---------------------------------------------------------------------------

describe('streamViaYtDlpSearch', () => {
    it.each(['', '   '])('rejects on empty/whitespace: %p', async (query) => {
        await expect(streamViaYtDlpSearch(query)).rejects.toThrow(
            'yt-dlp search: empty query',
        )
    })
})

// ---------------------------------------------------------------------------
// createResilientStream — fallback chain + Sentry instrumentation
// ---------------------------------------------------------------------------

describe('createResilientStream', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockCleanTitle.mockReturnValue('Test Track')
        mockCleanAuthor.mockReturnValue('Test Artist')
        mockCleanSearchQuery.mockReturnValue('test track test artist')
        mockIsAvailable.mockReturnValue(true)
    })

    it('falls back to SoundCloud when yt-dlp fails', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        mockStreamViaSoundCloud.mockResolvedValue(fakeStream)
        setImmediate(() => proc.emit('close', 1))
        const result = await createResilientStream(makeTrack())
        expect(result).toBe(fakeStream)
        expect(mockStreamViaSoundCloud).toHaveBeenCalled()
    })

    it('throws Bridge exhausted when all stages fail', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => proc.emit('close', 1))
        mockStreamViaSoundCloud.mockRejectedValue(new Error('no results'))
        await expect(
            createResilientStream(makeTrack({ title: 'Some Song' })),
        ).rejects.toThrow('Bridge exhausted')
        // #1500: an unplayable track is an expected outcome → WARN, not
        // error→Sentry (which produced false "regression" alerts, LUCKY-2T).
        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Bridge: all stages exhausted',
            }),
        )
        expect(mockErrorLog).not.toHaveBeenCalled()
    })

    it('throws immediately when cleanedTitle is empty after yt-dlp fails', async () => {
        mockCleanTitle.mockReturnValue('')
        mockCleanAuthor.mockReturnValue('')
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => proc.emit('close', 1))
        await expect(
            createResilientStream(makeTrack({ title: '' })),
        ).rejects.toThrow('Bridge exhausted: no stream for empty title')
        expect(mockStreamViaSoundCloud).not.toHaveBeenCalled()
    })

    it('captures breadcrumb on successful YouTube yt-dlp URL stream', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => {
            proc.stdout.emit('data', Buffer.from('stream data'))
        })
        await createResilientStream(makeTrack())
        expect(mockAddBreadcrumb).toHaveBeenCalledWith(
            'YouTube stream resolved via yt-dlp',
            'music.youtube-extraction',
            'info',
        )
    })

    it('captures breadcrumb and message on yt-dlp URL extraction failure', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        mockStreamViaSoundCloud.mockResolvedValue(fakeStream)
        setImmediate(() => proc.emit('close', 1))
        await createResilientStream(makeTrack())
        // Verify breadcrumb was called for failure
        expect(mockAddBreadcrumb).toHaveBeenCalledWith(
            'YouTube extraction failed via yt-dlp URL',
            'music.youtube-extraction',
            'warning',
            expect.any(Object),
        )
        // Verify captureMessage was called with correct stage as tag
        expect(mockCaptureMessage).toHaveBeenCalledWith(
            expect.stringContaining('YouTube extraction failed'),
            'warning',
            expect.any(Object),
            expect.objectContaining({
                category: 'music.youtube-extraction',
                stage: 'yt-dlp-url',
            }),
        )
    })

    it('captures breadcrumb on successful YouTube search stream for Spotify source', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => {
            proc.stdout.emit('data', Buffer.from('stream data'))
        })
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
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        mockStreamViaSoundCloud.mockResolvedValue(fakeStream)
        setImmediate(() => proc.emit('close', 1))
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
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => proc.emit('close', 1))
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
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => proc.emit('close', 1))
        mockStreamViaSoundCloud.mockRejectedValue(new Error('no results'))
        mockCleanTitle.mockReturnValue('Song (Official) Mix')
        await expect(
            createResilientStream(makeTrack({ title: 'Song (Official) Mix' })),
        ).rejects.toThrow('Bridge exhausted')
        expect(mockCaptureMessage).toHaveBeenCalledWith(
            'YouTube extraction exhausted all fallback stages',
            'error',
            expect.any(Object),
            expect.objectContaining({
                category: 'music.youtube-extraction',
                stage: 'all-exhausted',
            }),
        )
    })

    it('captures message on exhausted all-fallback stages (no parentheticals)', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => proc.emit('close', 1))
        mockStreamViaSoundCloud.mockRejectedValue(new Error('no results'))
        mockCleanTitle.mockReturnValue('Simple Song Name')
        await expect(
            createResilientStream(makeTrack({ title: 'Simple Song Name' })),
        ).rejects.toThrow('Bridge exhausted')
        expect(mockCaptureMessage).toHaveBeenCalledWith(
            'YouTube extraction exhausted all fallback stages',
            'error',
            expect.any(Object),
            expect.objectContaining({
                category: 'music.youtube-extraction',
                stage: 'all-exhausted',
            }),
        )
    })
})
