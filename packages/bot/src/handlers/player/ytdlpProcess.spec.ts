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

describe('streamViaYtDlp – cookies only on a sign-in challenge (#2653)', () => {
    const validUrl = 'https://www.youtube.com/watch?v=abc123'
    const cookiesPath = '/app/secrets/youtube-cookies.txt'
    const originalEnv = process.env.YTDLP_COOKIES_FILE
    const SIGN_IN =
        "ERROR: [youtube] abc123: Sign in to confirm you're not a bot\n"
    const AGE_GATE =
        'ERROR: [youtube] abc123: Sign in to confirm your age. This video may be inappropriate for some users.\n'
    const FORBIDDEN =
        'ERROR: unable to download video data: HTTP Error 403: Forbidden\n'

    // Each spawn returns a process that either streams or fails with the
    // given stderr line, so a test can script the first and the retry.
    function procThat(outcome: 'ok' | string) {
        const proc = makeFakeProc()
        setImmediate(() => {
            if (outcome === 'ok') {
                proc.stdout.emit('data', Buffer.from('bytes'))
                return
            }
            proc.stderr.emit('data', Buffer.from(outcome))
            proc.emit('close', 1)
        })
        return proc
    }

    function script(...outcomes: Array<'ok' | string>) {
        for (const outcome of outcomes) {
            mockSpawn.mockImplementationOnce(() => procThat(outcome))
        }
    }

    const spawnArgs = (call: number) =>
        mockSpawn.mock.calls[call]?.[1] as string[]

    function readableCookies() {
        process.env.YTDLP_COOKIES_FILE = cookiesPath
        mockStatSync.mockReturnValue({ isFile: () => true })
        mockAccessSync.mockReturnValue(undefined)
    }

    beforeEach(() => {
        __resetYtdlpCookiesLogStateForTests()
        mockSpawn.mockReset()
        mockStatSync.mockReset()
        mockAccessSync.mockReset()
        mockInfoLog.mockReset()
        mockWarnLog.mockReset()
    })

    afterEach(() => {
        if (originalEnv === undefined) delete process.env.YTDLP_COOKIES_FILE
        else process.env.YTDLP_COOKIES_FILE = originalEnv
    })

    it('never passes --cookies on the first attempt, even when configured', async () => {
        readableCookies()
        script('ok')

        await streamViaYtDlp(validUrl)

        expect(mockSpawn).toHaveBeenCalledTimes(1)
        expect(spawnArgs(0)).not.toContain('--cookies')
    })

    // Both sign-in challenges retry with cookies on purpose: a logged-in
    // session is what an age-gated video needs. The block breaker matches
    // only the bot-check (#2779), so the two must not be narrowed together.
    it.each([
        ['the bot-check', SIGN_IN],
        ['the age gate', AGE_GATE],
    ])(
        'retries once with --cookies <file> on %s',
        async (_label, challenge) => {
            readableCookies()
            script(challenge, 'ok')

            await streamViaYtDlp(validUrl)

            expect(mockSpawn).toHaveBeenCalledTimes(2)
            const args = spawnArgs(1)
            expect(args[args.indexOf('--cookies') + 1]).toBe(cookiesPath)
        },
    )

    it('does not retry with cookies on a 403 (cookies cause it)', async () => {
        readableCookies()
        script(FORBIDDEN)

        await expect(streamViaYtDlp(validUrl)).rejects.toThrow('HTTP Error 403')
        expect(mockSpawn).toHaveBeenCalledTimes(1)
    })

    it.each([
        ['unset', () => delete process.env.YTDLP_COOKIES_FILE],
        [
            'missing',
            () => {
                process.env.YTDLP_COOKIES_FILE = cookiesPath
                mockStatSync.mockImplementation(() => {
                    throw new Error('ENOENT')
                })
            },
        ],
        [
            'a directory',
            () => {
                process.env.YTDLP_COOKIES_FILE = cookiesPath
                mockStatSync.mockReturnValue({ isFile: () => false })
            },
        ],
        [
            'unreadable',
            () => {
                process.env.YTDLP_COOKIES_FILE = cookiesPath
                mockStatSync.mockReturnValue({ isFile: () => true })
                mockAccessSync.mockImplementation(() => {
                    throw new Error('EACCES: permission denied')
                })
            },
        ],
    ])('does not retry when the cookies file is %s', async (_label, setup) => {
        setup()
        script(SIGN_IN)

        await expect(streamViaYtDlp(validUrl)).rejects.toThrow('Sign in')
        expect(mockSpawn).toHaveBeenCalledTimes(1)
    })

    it('logs the missing/applied transition once each, not per retry', async () => {
        process.env.YTDLP_COOKIES_FILE = cookiesPath
        mockStatSync.mockImplementation(() => {
            throw new Error('ENOENT')
        })
        script(SIGN_IN, SIGN_IN)
        await expect(streamViaYtDlp(validUrl)).rejects.toThrow()
        await expect(streamViaYtDlp(validUrl)).rejects.toThrow()
        expect(mockWarnLog).toHaveBeenCalledTimes(1)
        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('not a readable file'),
            }),
        )

        readableCookies()
        script(SIGN_IN, 'ok', SIGN_IN, 'ok')
        await streamViaYtDlp(validUrl)
        await streamViaYtDlp(validUrl)
        expect(mockInfoLog).toHaveBeenCalledTimes(1)
        expect(mockInfoLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Bridge: yt-dlp cookies file applied',
            }),
        )
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

// ---------------------------------------------------------------------------
// HOSTED_YOUTUBE_ENABLED = false (#2475 follow-up)
// ---------------------------------------------------------------------------

describe('HOSTED_YOUTUBE_ENABLED = false', () => {
    const originalEnv = process.env.HOSTED_YOUTUBE_ENABLED
    const validUrl = 'https://www.youtube.com/watch?v=abc123'

    beforeEach(() => {
        process.env.HOSTED_YOUTUBE_ENABLED = 'false'
    })

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.HOSTED_YOUTUBE_ENABLED
        } else {
            process.env.HOSTED_YOUTUBE_ENABLED = originalEnv
        }
    })

    it('streamViaYtDlp rejects without spawning yt-dlp', async () => {
        await expect(streamViaYtDlp(validUrl)).rejects.toThrow(
            'YouTube disabled',
        )
        expect(mockSpawn).not.toHaveBeenCalled()
    })

    it('streamViaYtDlpSearch rejects without spawning yt-dlp', async () => {
        await expect(streamViaYtDlpSearch('some song')).rejects.toThrow(
            'YouTube disabled',
        )
        expect(mockSpawn).not.toHaveBeenCalled()
    })

    // The kill switch is YouTube-only: this function also streams the
    // allowlisted SoundCloud domains via yt-dlp, and that has nothing to do
    // with YouTube being disabled.
    it('still spawns yt-dlp for a SoundCloud URL', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValue(proc)
        setImmediate(() => proc.stdout.emit('data', Buffer.from('bytes')))
        await expect(
            streamViaYtDlp('https://soundcloud.com/artist/track'),
        ).resolves.toBeDefined()
        expect(mockSpawn).toHaveBeenCalled()
    })
})
