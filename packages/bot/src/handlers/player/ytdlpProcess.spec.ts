import { jest } from '@jest/globals'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'

// --- mocks (declared before imports) ---
const mockSpawn = jest.fn()
const mockInfoLog = jest.fn()
const mockWarnLog = jest.fn()

jest.mock('node:child_process', () => ({
    spawn: (...args: unknown[]) => mockSpawn(...args),
}))
const mockStatSync = jest.fn()
const mockAccessSync = jest.fn()
jest.mock('node:fs', () => ({
    statSync: (...args: unknown[]) => mockStatSync(...args),
    accessSync: (...args: unknown[]) => mockAccessSync(...args),
    constants: { R_OK: 4 },
}))
jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => mockInfoLog(...args),
    warnLog: (...args: unknown[]) => mockWarnLog(...args),
}))

import {
    streamViaYtDlp,
    streamViaYtDlpSearch,
    YTDLP_STREAM_START_TIMEOUT_MS,
    __resetYtdlpCookiesLogStateForTests,
} from './ytdlpProcess'

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
// streamViaYtDlp — cookies (#2034 / ADR 2026-06-18)
// ---------------------------------------------------------------------------

describe('streamViaYtDlp – cookies file', () => {
    const validUrl = 'https://www.youtube.com/watch?v=abc123'
    const cookiesPath = '/app/secrets/youtube-cookies.txt'
    const originalEnv = process.env.YTDLP_COOKIES_FILE

    async function runOnce() {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => proc.stdout.emit('data', Buffer.from('bytes')))
        await streamViaYtDlp(validUrl)
        return mockSpawn.mock.calls.at(-1)?.[1] as string[]
    }

    beforeEach(() => {
        __resetYtdlpCookiesLogStateForTests()
        mockAccessSync.mockReset()
    })

    afterEach(() => {
        if (originalEnv === undefined) delete process.env.YTDLP_COOKIES_FILE
        else process.env.YTDLP_COOKIES_FILE = originalEnv
    })

    it('logs the missing/applied transition once each, not per call', async () => {
        process.env.YTDLP_COOKIES_FILE = cookiesPath
        mockStatSync.mockImplementation(() => {
            throw new Error('ENOENT')
        })
        await runOnce()
        await runOnce()
        expect(mockWarnLog).toHaveBeenCalledTimes(1)
        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('not a readable file'),
            }),
        )

        mockStatSync.mockReturnValue({ isFile: () => true })
        await runOnce()
        await runOnce()
        expect(mockInfoLog).toHaveBeenCalledTimes(1)
        expect(mockInfoLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Bridge: yt-dlp cookies file applied',
            }),
        )
    })

    it('does not pass --cookies when YTDLP_COOKIES_FILE is unset', async () => {
        delete process.env.YTDLP_COOKIES_FILE
        expect(await runOnce()).not.toContain('--cookies')
    })

    it('does not pass --cookies when the configured file does not exist', async () => {
        process.env.YTDLP_COOKIES_FILE = cookiesPath
        mockStatSync.mockImplementation(() => {
            throw new Error('ENOENT')
        })
        expect(await runOnce()).not.toContain('--cookies')
    })

    it('does not pass --cookies when the path is a directory', async () => {
        process.env.YTDLP_COOKIES_FILE = cookiesPath
        mockStatSync.mockReturnValue({ isFile: () => false })
        expect(await runOnce()).not.toContain('--cookies')
    })

    it('does not pass --cookies when the file exists but is not readable', async () => {
        process.env.YTDLP_COOKIES_FILE = cookiesPath
        mockStatSync.mockReturnValue({ isFile: () => true })
        mockAccessSync.mockImplementation(() => {
            throw new Error('EACCES: permission denied')
        })
        expect(await runOnce()).not.toContain('--cookies')
    })

    it('passes --cookies <file> when YTDLP_COOKIES_FILE is a readable regular file', async () => {
        process.env.YTDLP_COOKIES_FILE = cookiesPath
        mockStatSync.mockReturnValue({ isFile: () => true })
        mockAccessSync.mockReturnValue(undefined)
        const args = await runOnce()
        const idx = args.indexOf('--cookies')
        expect(idx).toBeGreaterThan(-1)
        expect(args[idx + 1]).toBe(cookiesPath)
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
            'yt-dlp exited with code 1 - Video unavailable',
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
        jest.advanceTimersByTime(YTDLP_STREAM_START_TIMEOUT_MS)
        await expect(promise).rejects.toThrow('yt-dlp: timed out')
        expect(proc.kill).toHaveBeenCalled()
        jest.useRealTimers()
    })

    // #2141: the prior 6s budget was below the measured p100 with cookies
    // (the live prod path), killing 16.8% of healthy resolutions. Pins the
    // raised constant so a future regression back to a too-short value fails.
    it('uses the raised #2141 timeout constant, not the old 6s budget', () => {
        expect(YTDLP_STREAM_START_TIMEOUT_MS).toBeGreaterThan(6_000)
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
