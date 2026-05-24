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
    it.each([
        ['not-a-url', 'yt-dlp: invalid URL'],
        ['http://www.youtube.com/watch?v=abc', 'yt-dlp: only https URLs are allowed'],
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
        [(proc: FakeProc) => proc.emit('error', new Error('ENOENT yt-dlp')), 'ENOENT yt-dlp'],
        [(proc: FakeProc) => {
            proc.stderr.emit('data', Buffer.from('Video unavailable'))
            proc.emit('close', 1)
        }, 'yt-dlp exited with code 1 — Video unavailable'],
        [(proc: FakeProc) => proc.emit('close', 2), 'yt-dlp exited with code 2'],
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
        await expect(streamViaYtDlpSearch(query)).rejects.toThrow('yt-dlp search: empty query')
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
    })
})
