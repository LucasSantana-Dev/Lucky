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
const mockMkdtempSync = jest.fn((prefix: string) => `${prefix}XXXXXX`)
const mockRmSync = jest.fn()
jest.mock('node:fs', () => ({
    statSync: (...args: unknown[]) => mockStatSync(...args),
    accessSync: (...args: unknown[]) => mockAccessSync(...args),
    mkdtempSync: (prefix: string) => mockMkdtempSync(prefix),
    rmSync: (...args: unknown[]) => mockRmSync(...args),
    constants: { R_OK: 4 },
}))
jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => mockInfoLog(...args),
    warnLog: (...args: unknown[]) => mockWarnLog(...args),
}))

import {
    searchYtDlpCandidates,
    streamViaYtDlp,
    streamViaYtDlpSearch,
    YTDLP_SEARCH_RESOLVE_TIMEOUT_MS,
    YTDLP_STREAM_START_TIMEOUT_MS,
    __resetYtdlpCookiesLogStateForTests,
} from './ytdlpProcess'
import {
    isYtDlpBlocked,
    recordYtDlpFailure,
    recordYtDlpSuccess,
} from './ytdlpBlockBreaker'
import { extractionFailuresTotal } from '../../utils/monitoring/prometheus'

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
        mockMkdtempSync.mockClear()
        mockRmSync.mockClear()
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

    it('runs each yt-dlp in its own temp dir and removes it on close', async () => {
        script(FORBIDDEN, 'ok')

        await streamViaYtDlp(validUrl)

        const cwdOf = (call: number) =>
            (mockSpawn.mock.calls[call]?.[2] as { cwd?: string }).cwd
        expect(mockMkdtempSync).toHaveBeenCalledTimes(2)
        expect(cwdOf(0)).toBe(mockMkdtempSync.mock.results[0]?.value)
        expect(cwdOf(1)).toBe(mockMkdtempSync.mock.results[1]?.value)
        // The first run failed and closed; the second is still streaming.
        expect(mockRmSync).toHaveBeenCalledTimes(1)
        expect(mockRmSync).toHaveBeenCalledWith(cwdOf(0), {
            recursive: true,
            force: true,
        })
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

    it('retries a 403 once without cookies, even when cookies are configured', async () => {
        readableCookies()
        script(FORBIDDEN, 'ok')

        await expect(streamViaYtDlp(validUrl)).resolves.toBeDefined()
        expect(mockSpawn).toHaveBeenCalledTimes(2)
        expect(spawnArgs(1)).not.toContain('--cookies')
    })

    it('gives up after a second 403 (one retry, no loop)', async () => {
        readableCookies()
        script(FORBIDDEN, FORBIDDEN, 'ok')

        await expect(streamViaYtDlp(validUrl)).rejects.toThrow('HTTP Error 403')
        expect(mockSpawn).toHaveBeenCalledTimes(2)
    })

    it('does not retry a 403 on the cookies attempt (no chained retries)', async () => {
        readableCookies()
        script(SIGN_IN, FORBIDDEN, 'ok')

        await expect(streamViaYtDlp(validUrl)).rejects.toThrow('HTTP Error 403')
        expect(mockSpawn).toHaveBeenCalledTimes(2)
    })

    it.each([
        ['an unavailable video', 'ERROR: Video unavailable\n'],
        ['an empty download', ''],
        ['an HTTP 429', 'ERROR: HTTP Error 429: Too Many Requests\n'],
    ])('does not retry %s', async (_label, outcome) => {
        readableCookies()
        script(outcome, 'ok')

        await expect(streamViaYtDlp(validUrl)).rejects.toThrow()
        expect(mockSpawn).toHaveBeenCalledTimes(1)
    })

    describe('with the real block breaker', () => {
        beforeEach(() => recordYtDlpSuccess())
        afterEach(() => recordYtDlpSuccess())

        // Mirrors resilientStreamBridge: success -> recordYtDlpSuccess,
        // rejection -> recordYtDlpFailure.
        async function playLikeBridge(): Promise<void> {
            try {
                await streamViaYtDlp(validUrl)
                recordYtDlpSuccess()
            } catch (error) {
                recordYtDlpFailure(error)
            }
        }

        it('a recovered 403 never reaches the breaker', async () => {
            const incSpy = jest.spyOn(extractionFailuresTotal, 'inc')
            for (let i = 0; i < 3; i++) {
                script(FORBIDDEN, 'ok')
                await playLikeBridge()
            }
            expect(isYtDlpBlocked()).toBe(false)
            // recordYtDlpSuccess clears the streak, so also prove the failure
            // recorder (metric + streak) was never reached.
            expect(incSpy).not.toHaveBeenCalled()
            incSpy.mockRestore()
        })

        it('403 on both attempts counts once, and two such plays open it', async () => {
            script(FORBIDDEN, FORBIDDEN)
            await playLikeBridge()
            expect(isYtDlpBlocked()).toBe(false)

            script(FORBIDDEN, FORBIDDEN)
            await playLikeBridge()
            expect(isYtDlpBlocked()).toBe(true)
        })
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
// searchYtDlpCandidates
// ---------------------------------------------------------------------------

describe('searchYtDlpCandidates', () => {
    function procPrinting(stdout: string, code = 0, stderr = '') {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValueOnce(proc)
        setImmediate(() => {
            if (stdout) proc.stdout.emit('data', Buffer.from(stdout))
            if (stderr) proc.stderr.emit('data', Buffer.from(stderr))
            proc.emit('close', code)
        })
        return proc
    }

    beforeEach(() => {
        mockSpawn.mockReset()
    })

    it.each(['', '   '])('rejects on empty/whitespace: %p', async (query) => {
        await expect(searchYtDlpCandidates(query)).rejects.toThrow(
            'yt-dlp search: empty query',
        )
        expect(mockSpawn).not.toHaveBeenCalled()
    })

    it('runs a flat ytsearch5 that prints one JSON line per hit', async () => {
        procPrinting('')
        await searchYtDlpCandidates('some song')
        const args = mockSpawn.mock.calls[0][1] as string[]
        expect(args).toContain('--flat-playlist')
        expect(args).not.toContain('-o')
        expect(args.at(-1)).toBe('ytsearch5:some song')
    })

    it('parses id, title, channel and duration of each hit', async () => {
        procPrinting(
            [
                '{"id": "a1", "title": "Song", "channel": "Artist - Topic", "duration": 201}',
                '{"id": "b2", "title": "Song (Live)", "channel": "Radio X", "duration": null}',
                'not json',
                '{"title": "no id"}',
                '',
            ].join('\n'),
        )
        await expect(searchYtDlpCandidates('song')).resolves.toEqual([
            {
                id: 'a1',
                title: 'Song',
                channel: 'Artist - Topic',
                durationSec: 201,
            },
            {
                id: 'b2',
                title: 'Song (Live)',
                channel: 'Radio X',
                durationSec: null,
            },
        ])
    })

    it('resolves [] when the search has no hits', async () => {
        procPrinting('')
        await expect(searchYtDlpCandidates('nothing')).resolves.toEqual([])
    })

    it('rejects with the first stderr line on a non-zero exit', async () => {
        procPrinting('', 1, 'ERROR: HTTP Error 403: Forbidden\nmore')
        await expect(searchYtDlpCandidates('song')).rejects.toThrow(
            'yt-dlp exited with code 1 - ERROR: HTTP Error 403: Forbidden',
        )
    })

    it('kills the process and rejects as a timeout past its budget', async () => {
        jest.useFakeTimers()
        try {
            const proc = makeFakeProc()
            mockSpawn.mockReturnValueOnce(proc)
            const pending = searchYtDlpCandidates('slow')
            jest.advanceTimersByTime(YTDLP_SEARCH_RESOLVE_TIMEOUT_MS)
            await expect(pending).rejects.toThrow('timed out')
            expect(proc.kill).toHaveBeenCalled()
        } finally {
            jest.useRealTimers()
        }
    })

    it('keeps the search inside the stream-start budget', () => {
        expect(YTDLP_SEARCH_RESOLVE_TIMEOUT_MS).toBeLessThan(
            YTDLP_STREAM_START_TIMEOUT_MS,
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

    it('searchYtDlpCandidates rejects without spawning yt-dlp', async () => {
        mockSpawn.mockClear()
        await expect(searchYtDlpCandidates('some song')).rejects.toThrow(
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
