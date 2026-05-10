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

jest.mock('child_process', () => ({ spawn: (...args: unknown[]) => mockSpawn(...args) }))
jest.mock('./soundcloudMatcher', () => ({
    streamViaSoundCloud: (...args: unknown[]) => mockStreamViaSoundCloud(...args),
}))
jest.mock('../../utils/music/searchQueryCleaner', () => ({
    cleanTitle: (...args: unknown[]) => mockCleanTitle(...args),
    cleanAuthor: (...args: unknown[]) => mockCleanAuthor(...args),
    cleanSearchQuery: (...args: unknown[]) => mockCleanSearchQuery(...args),
}))
jest.mock('../../utils/music/search/providerHealth', () => ({
    providerHealthService: { isAvailable: (...args: unknown[]) => mockIsAvailable(...args) },
}))
jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => mockDebugLog(...args),
    infoLog: (...args: unknown[]) => mockInfoLog(...args),
    warnLog: (...args: unknown[]) => mockWarnLog(...args),
    errorLog: (...args: unknown[]) => mockErrorLog(...args),
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

function makeTrack(overrides: {
    title?: string
    author?: string
    duration?: string
    url?: string
} = {}) {
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
    it('rejects on an invalid (unparseable) URL', async () => {
        await expect(streamViaYtDlp('not-a-url')).rejects.toThrow('yt-dlp: invalid URL')
    })

    it('rejects on a non-https URL', async () => {
        await expect(
            streamViaYtDlp('http://www.youtube.com/watch?v=abc'),
        ).rejects.toThrow('yt-dlp: only https URLs are allowed')
    })

    it('rejects on a domain not in the allowlist', async () => {
        await expect(
            streamViaYtDlp('https://evil.example.com/video'),
        ).rejects.toThrow('yt-dlp: domain not in allowlist')
    })

    it('passes validation for a ytsearch prefix without spawning URL check', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        // Let the proc emit data immediately so the promise resolves
        setImmediate(() => proc.stdout.emit('data', Buffer.from('bytes')))
        const stream = await streamViaYtDlp('ytsearch1:some query')
        expect(stream).toBeDefined()
    })

    it.each([
        'https://youtube.com/watch?v=x',
        'https://www.youtube.com/watch?v=x',
        'https://youtu.be/x',
        'https://music.youtube.com/watch?v=x',
        'https://soundcloud.com/artist/track',
        'https://www.soundcloud.com/artist/track',
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

    afterEach(() => {
        jest.useRealTimers()
    })

    it('resolves with a PassThrough stream when stdout emits first chunk', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        const data = Buffer.from('audio-bytes')
        setImmediate(() => proc.stdout.emit('data', data))
        const stream = await streamViaYtDlp(validUrl)
        expect(stream).toBeDefined()
    })

    it('rejects and kills proc when process emits an error', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        const promise = streamViaYtDlp(validUrl)
        proc.emit('error', new Error('ENOENT yt-dlp'))
        await expect(promise).rejects.toThrow('ENOENT yt-dlp')
        expect(proc.kill).toHaveBeenCalled()
    })

    it('rejects with exit code and stderr when process closes with non-zero code', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => {
            proc.stderr.emit('data', Buffer.from('Video unavailable'))
            proc.emit('close', 1)
        })
        await expect(streamViaYtDlp(validUrl)).rejects.toThrow(
            'yt-dlp exited with code 1 — Video unavailable',
        )
    })

    it('rejects with just the exit code when stderr is empty', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => proc.emit('close', 2))
        await expect(streamViaYtDlp(validUrl)).rejects.toThrow(
            'yt-dlp exited with code 2',
        )
    })

    it('does not reject after stdout resolves even if close fires later', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => {
            proc.stdout.emit('data', Buffer.from('bytes'))
            // close fires after stdout — should be ignored
            proc.emit('close', 1)
        })
        await expect(streamViaYtDlp(validUrl)).resolves.toBeDefined()
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
    it('rejects on empty query', async () => {
        await expect(streamViaYtDlpSearch('')).rejects.toThrow('yt-dlp search: empty query')
    })

    it('rejects on whitespace-only query', async () => {
        await expect(streamViaYtDlpSearch('   ')).rejects.toThrow('yt-dlp search: empty query')
    })

    it('prepends ytsearch1: and delegates to streamViaYtDlp', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => proc.stdout.emit('data', Buffer.from('bytes')))
        await streamViaYtDlpSearch('some song')
        const [, args] = mockSpawn.mock.calls[0] as [string, string[]]
        expect(args).toContain('ytsearch1:some song')
    })
})

// ---------------------------------------------------------------------------
// createResilientStream — fallback chain
// ---------------------------------------------------------------------------

describe('createResilientStream', () => {
    beforeEach(() => {
        mockCleanTitle.mockReturnValue('Test Track')
        mockCleanAuthor.mockReturnValue('Test Artist')
        mockCleanSearchQuery.mockReturnValue('test track test artist')
        mockIsAvailable.mockReturnValue(true)
    })

    it('streams via yt-dlp directly for a YouTube URL', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => proc.stdout.emit('data', Buffer.from('bytes')))
        const result = await createResilientStream(makeTrack())
        expect(result).toBeDefined()
        expect(mockStreamViaSoundCloud).not.toHaveBeenCalled()
    })

    it('falls back to SoundCloud when yt-dlp fails for a YouTube URL', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        mockStreamViaSoundCloud.mockResolvedValue(fakeStream)
        setImmediate(() => proc.emit('close', 1))
        const result = await createResilientStream(makeTrack())
        expect(result).toBe(fakeStream)
        expect(mockStreamViaSoundCloud).toHaveBeenCalled()
    })

    it('tries yt-dlp YouTube search for a Spotify URL', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => proc.stdout.emit('data', Buffer.from('bytes')))
        const track = makeTrack({ url: 'https://open.spotify.com/track/abc' })
        await createResilientStream(track)
        const [, args] = mockSpawn.mock.calls[0] as [string, string[]]
        expect(args.some((a: string) => a.startsWith('ytsearch1:'))).toBe(true)
    })

    it('falls through to SoundCloud when Spotify yt-dlp search fails', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        mockStreamViaSoundCloud.mockResolvedValue(fakeStream)
        setImmediate(() => proc.emit('close', 1))
        const track = makeTrack({ url: 'https://open.spotify.com/track/abc' })
        const result = await createResilientStream(track)
        expect(result).toBe(fakeStream)
        expect(mockStreamViaSoundCloud).toHaveBeenCalled()
    })

    it('throws immediately when circuit breaker is open', async () => {
        mockIsAvailable.mockReturnValue(false)
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => proc.emit('close', 1))
        await expect(createResilientStream(makeTrack())).rejects.toThrow(
            'Bridge exhausted',
        )
        expect(mockStreamViaSoundCloud).not.toHaveBeenCalled()
    })

    it('retries SoundCloud with title-only when primary query fails', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => proc.emit('close', 1))
        mockStreamViaSoundCloud
            .mockRejectedValueOnce(new Error('no results'))
            .mockResolvedValueOnce(fakeStream)
        const result = await createResilientStream(makeTrack())
        expect(mockStreamViaSoundCloud).toHaveBeenCalledTimes(2)
        expect(result).toBe(fakeStream)
    })

    it('retries SoundCloud with core title (strips parentheticals) when title-only fails', async () => {
        mockCleanTitle.mockReturnValue('Song Name (Official Audio)')
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => proc.emit('close', 1))
        mockStreamViaSoundCloud
            .mockRejectedValueOnce(new Error('no results'))
            .mockRejectedValueOnce(new Error('no results'))
            .mockResolvedValueOnce(fakeStream)
        const result = await createResilientStream(
            makeTrack({ title: 'Song Name (Official Audio)' }),
        )
        expect(mockStreamViaSoundCloud).toHaveBeenCalledTimes(3)
        const thirdCallQuery = (mockStreamViaSoundCloud.mock.calls[2] as string[])[0]
        expect(thirdCallQuery).toBe('Song Name')
        expect(result).toBe(fakeStream)
    })

    it('throws Bridge exhausted when all stages fail', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => proc.emit('close', 1))
        mockStreamViaSoundCloud.mockRejectedValue(new Error('no results'))
        await expect(
            createResilientStream(makeTrack({ title: 'Song Name (Remix)' })),
        ).rejects.toThrow('Bridge exhausted: no stream for "Song Name (Remix)"')
    })

    it('skips core-title retry when core title equals cleaned title', async () => {
        // no parentheticals → coreTitle === cleanedTitle → no 3rd SoundCloud call
        mockCleanTitle.mockReturnValue('Song Name')
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => proc.emit('close', 1))
        mockStreamViaSoundCloud.mockRejectedValue(new Error('no results'))
        await expect(
            createResilientStream(makeTrack({ title: 'Song Name' })),
        ).rejects.toThrow('Bridge exhausted')
        expect(mockStreamViaSoundCloud).toHaveBeenCalledTimes(2)
    })
})
