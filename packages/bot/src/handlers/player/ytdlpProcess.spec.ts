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
    PLAIN_BOTCHECK_SKIP_WINDOW_MS,
    YTDLP_COOKIES_STREAM_START_TIMEOUT_MS,
    YTDLP_SEARCH_RESOLVE_TIMEOUT_MS,
    YTDLP_STREAM_START_TIMEOUT_MS,
    __resetPlainBotCheckStateForTests,
    __resetYtdlpCookiesLogStateForTests,
    __resetYtdlpPotLogStateForTests,
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
        __resetPlainBotCheckStateForTests()
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

    it('counts a recovered bot-check once as botcheck (#2864)', async () => {
        readableCookies()
        script(SIGN_IN, 'ok')
        const incSpy = jest.spyOn(extractionFailuresTotal, 'inc')

        await streamViaYtDlp(validUrl)

        expect(incSpy).toHaveBeenCalledTimes(1)
        expect(incSpy).toHaveBeenCalledWith({ type: 'botcheck' })
        incSpy.mockRestore()
    })

    it('does not count a SoundCloud 403 as a YouTube failure (#2864)', async () => {
        script(FORBIDDEN, 'ok')
        const incSpy = jest.spyOn(extractionFailuresTotal, 'inc')

        await streamViaYtDlp('https://soundcloud.com/artist/track')

        expect(mockSpawn).toHaveBeenCalledTimes(2)
        expect(incSpy).not.toHaveBeenCalled()
        incSpy.mockRestore()
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

    const cookiesRejectedWarns = () =>
        mockWarnLog.mock.calls.filter((call) =>
            String(
                (call[0] as { message?: string } | undefined)?.message,
            ).includes('still got the sign-in check with cookies'),
        )

    it('warns once that the cookies are rejected when the cookies retry hits the sign-in check again', async () => {
        readableCookies()
        // Play 1: plain → sign-in → cookies → sign-in (warns, records bot-check).
        // Play 2: fast-path shortcut → cookies → sign-in (cooldown suppresses warn).
        script(SIGN_IN, SIGN_IN, SIGN_IN)

        await expect(streamViaYtDlp(validUrl)).rejects.toThrow(
            'Sign in to confirm',
        )
        await expect(streamViaYtDlp(validUrl)).rejects.toThrow(
            'Sign in to confirm',
        )

        expect(mockSpawn).toHaveBeenCalledTimes(3)
        expect(cookiesRejectedWarns()).toHaveLength(1)
        expect(cookiesRejectedWarns()[0]?.[0]).toMatchObject({
            data: { cookiesFile: cookiesPath },
        })
    })

    it('does not blame the cookies when the fast-path cookies attempt fails with 403', async () => {
        readableCookies()
        // Play 1 activates the shortcut; play 2 uses fast-path → 403 (not a sign-in, no warn).
        script(SIGN_IN, 'ok', FORBIDDEN)

        await streamViaYtDlp(validUrl)
        await expect(streamViaYtDlp(validUrl)).rejects.toThrow('HTTP Error 403')

        expect(cookiesRejectedWarns()).toHaveLength(0)
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
            // recorder was never reached: each first 403 is counted once by
            // countYtDlpFailure (#2864); recordYtDlpFailure would add a second.
            expect(incSpy).toHaveBeenCalledTimes(3)
            for (const call of incSpy.mock.calls) {
                expect(call[0]).toEqual({ type: 'forbidden' })
            }
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
        // Second call uses the fast-path (shortcut activated by first call).
        script(SIGN_IN, 'ok', 'ok')
        await streamViaYtDlp(validUrl)
        await streamViaYtDlp(validUrl)
        const applied = mockInfoLog.mock.calls.filter(
            (call) =>
                (call[0] as { message?: string }).message ===
                'Bridge: yt-dlp cookies file applied',
        )
        expect(applied).toHaveLength(1)
    })

    const attemptLogs = () =>
        mockInfoLog.mock.calls
            .map((call) => call[0] as { message?: string; data?: unknown })
            .filter((entry) => entry.message === 'Bridge: yt-dlp attempt')
            .map((entry) => entry.data)

    it('logs one timing line per YouTube attempt, with its kind and outcome', async () => {
        readableCookies()
        // Play 1: plain:botcheck → cookies:ok (activates fast-path shortcut).
        // Play 2: fast-path cookies:forbidden (clears shortcut).
        // Play 3: plain:forbidden → forbidden_retry:forbidden.
        script(SIGN_IN, 'ok', FORBIDDEN, FORBIDDEN, FORBIDDEN)

        await streamViaYtDlp(validUrl)
        await expect(streamViaYtDlp(validUrl)).rejects.toThrow('HTTP Error 403')
        await expect(streamViaYtDlp(validUrl)).rejects.toThrow('HTTP Error 403')

        const ms = expect.any(Number)
        expect(attemptLogs()).toEqual([
            {
                attempt: 'plain',
                outcome: 'botcheck',
                ms,
                timeoutMs: YTDLP_STREAM_START_TIMEOUT_MS,
            },
            {
                attempt: 'cookies',
                outcome: 'ok',
                ms,
                timeoutMs: YTDLP_COOKIES_STREAM_START_TIMEOUT_MS,
            },
            {
                attempt: 'cookies',
                outcome: 'forbidden',
                ms,
                timeoutMs: YTDLP_COOKIES_STREAM_START_TIMEOUT_MS,
            },
            {
                attempt: 'plain',
                outcome: 'forbidden',
                ms,
                timeoutMs: YTDLP_STREAM_START_TIMEOUT_MS,
            },
            {
                attempt: 'forbidden_retry',
                outcome: 'forbidden',
                ms,
                timeoutMs: YTDLP_STREAM_START_TIMEOUT_MS,
            },
        ])
    })

    it('does not log attempt timings for SoundCloud', async () => {
        script('ok')

        await streamViaYtDlp('https://soundcloud.com/artist/track')

        expect(attemptLogs()).toEqual([])
    })

    // ---------------------------------------------------------------------------
    // Fast-path: skip plain while bot-check is active (#2921)
    // ---------------------------------------------------------------------------

    it('skips the plain attempt while bot-check is active within the window', async () => {
        readableCookies()
        // First play activates the shortcut via plain → bot-check → cookies → ok.
        script(SIGN_IN, 'ok')
        await streamViaYtDlp(validUrl)

        // Second play: shortcut active → only one spawn (cookies), no plain.
        script('ok')
        await streamViaYtDlp(validUrl)

        expect(mockSpawn).toHaveBeenCalledTimes(3)
        expect(spawnArgs(2)).toContain('--cookies')
    })

    it('a 403 from the fast-path cookies clears the shortcut and reverts to plain', async () => {
        readableCookies()
        // Play 1: plain → bot-check → cookies → ok (shortcut activated).
        script(SIGN_IN, 'ok')
        await streamViaYtDlp(validUrl)

        // Play 2: fast-path → cookies → 403 (clears shortcut).
        script(FORBIDDEN)
        await expect(streamViaYtDlp(validUrl)).rejects.toThrow('HTTP Error 403')

        // Play 3: shortcut cleared → tries plain again (no --cookies on first spawn).
        script('ok')
        await streamViaYtDlp(validUrl)

        expect(mockSpawn).toHaveBeenCalledTimes(4)
        expect(spawnArgs(3)).not.toContain('--cookies')
    })

    it('reverts to plain after the bot-check window expires', async () => {
        readableCookies()
        jest.useFakeTimers({ doNotFake: ['setImmediate'] })
        try {
            script(SIGN_IN, 'ok')
            await streamViaYtDlp(validUrl)

            // Advance past the 15-minute window.
            jest.advanceTimersByTime(PLAIN_BOTCHECK_SKIP_WINDOW_MS)

            script('ok')
            await streamViaYtDlp(validUrl)

            expect(mockSpawn).toHaveBeenCalledTimes(3)
            expect(spawnArgs(2)).not.toContain('--cookies')
        } finally {
            jest.useRealTimers()
        }
    })

    it('fast-path uses the cookies budget and does not open the block breaker on timeout', async () => {
        readableCookies()
        // Activate the shortcut.
        script(SIGN_IN, 'ok')
        await streamViaYtDlp(validUrl)

        const fastPathProc = makeFakeProc()
        mockSpawn.mockImplementationOnce(() => fastPathProc)
        jest.useFakeTimers({ doNotFake: ['setImmediate'] })
        try {
            recordYtDlpSuccess()
            const promise = streamViaYtDlp(validUrl)
            jest.advanceTimersByTime(YTDLP_COOKIES_STREAM_START_TIMEOUT_MS)
            const err = await promise.catch((e: unknown) => e)
            expect(String(err)).toContain('timed out')

            recordYtDlpFailure(err, 1_000)
            recordYtDlpFailure(err, 2_000)
            expect(isYtDlpBlocked(2_000)).toBe(false)
            recordYtDlpSuccess()
        } finally {
            jest.useRealTimers()
        }
    })

    // 9 of 14 cookie retries timed out at 8s (2026-10-19 to 10-21): the
    // logged-in stream start needs its own, longer budget.
    it('gives the cookies retry its own budget, longer than the plain one', async () => {
        try {
            const { promise, cookiesProc, isSettled } =
                await startCookiesRetry()
            jest.advanceTimersByTime(YTDLP_STREAM_START_TIMEOUT_MS)
            await Promise.resolve()
            expect(isSettled()).toBe(false)
            expect(cookiesProc.kill).not.toHaveBeenCalled()

            jest.advanceTimersByTime(
                YTDLP_COOKIES_STREAM_START_TIMEOUT_MS -
                    YTDLP_STREAM_START_TIMEOUT_MS,
            )
            await expect(promise).rejects.toThrow('yt-dlp: timed out')
            expect(cookiesProc.kill).toHaveBeenCalled()
        } finally {
            jest.useRealTimers()
        }
    })

    // A cookies-retry timeout fed the breaker and switched YouTube off for
    // everyone on slow logged-in starts (52 exhausted vs 3 plays, 10-19/20).
    it('does not let a cookies-retry timeout open the block breaker', async () => {
        recordYtDlpSuccess()
        let error: unknown
        try {
            const { promise } = await startCookiesRetry()
            jest.advanceTimersByTime(YTDLP_COOKIES_STREAM_START_TIMEOUT_MS)
            error = await promise.catch((e: unknown) => e)
        } finally {
            jest.useRealTimers()
        }
        expect(String(error)).toContain('timed out')

        recordYtDlpFailure(error, 1_000)
        recordYtDlpFailure(error, 2_000)

        expect(isYtDlpBlocked(2_000)).toBe(false)
        recordYtDlpSuccess()
    })

    // Runs up to the spawn of the cookies retry. Leaves fake timers on
    // (except setImmediate, so the scripted sign-in failure still fires);
    // the caller restores real timers.
    it('keeps a caller budget longer than the cookies one on the retry', async () => {
        const longer = YTDLP_COOKIES_STREAM_START_TIMEOUT_MS + 5_000
        try {
            const { promise, isSettled } = await startCookiesRetry(longer)
            jest.advanceTimersByTime(YTDLP_COOKIES_STREAM_START_TIMEOUT_MS)
            await Promise.resolve()
            expect(isSettled()).toBe(false)

            jest.advanceTimersByTime(5_000)
            await expect(promise).rejects.toThrow('yt-dlp: timed out')
        } finally {
            jest.useRealTimers()
        }
    })

    // Prod 2026-10-21 to 10-24 (n=13 cookies retries, 0 timeouts at the 15s
    // ceiling): p99 10.6s, max 10.7s. Pins the budget above that max so a
    // regression to the 8s plain budget, or below the measured tail, fails.
    it('keeps the cookies budget above the measured p100 of a logged-in start', () => {
        expect(YTDLP_COOKIES_STREAM_START_TIMEOUT_MS).toBeGreaterThan(10_732)
    })

    async function startCookiesRetry(timeoutMs?: number) {
        readableCookies()
        script(SIGN_IN)
        const cookiesProc = makeFakeProc()
        mockSpawn.mockImplementationOnce(() => cookiesProc)
        jest.useFakeTimers({ doNotFake: ['setImmediate'] })
        const promise = streamViaYtDlp(validUrl, timeoutMs)
        let settled = false
        promise.catch(() => undefined).finally(() => (settled = true))
        await new Promise((resolve) => setImmediate(resolve))
        await new Promise((resolve) => setImmediate(resolve))
        expect(mockSpawn).toHaveBeenCalledTimes(2)
        return { promise, cookiesProc, isSettled: () => settled }
    }
})

// ---------------------------------------------------------------------------
// streamViaYtDlp: po_token provider (ADR 2026-06-18 amendment 2026-10-21)
// ---------------------------------------------------------------------------

describe('streamViaYtDlp: po_token provider', () => {
    const youtubeUrl = 'https://www.youtube.com/watch?v=abc123'
    const providerUrl = 'http://bgutil-pot:4416'
    const originalEnv = process.env.YTDLP_POT_PROVIDER_URL
    const SIGN_IN =
        "ERROR: [youtube] abc123: Sign in to confirm you're not a bot\n"

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

    const potArgs = [
        '--plugin-dirs',
        '/opt/ytdlp-plugins',
        '--extractor-args',
        `youtubepot-bgutilhttp:base_url=${providerUrl}`,
    ]

    beforeEach(() => {
        __resetYtdlpPotLogStateForTests()
        __resetYtdlpCookiesLogStateForTests()
        __resetPlainBotCheckStateForTests()
        mockSpawn.mockReset()
        mockStatSync.mockReset()
        mockAccessSync.mockReset()
        mockInfoLog.mockReset()
        mockWarnLog.mockReset()
    })

    afterEach(() => {
        if (originalEnv === undefined) delete process.env.YTDLP_POT_PROVIDER_URL
        else process.env.YTDLP_POT_PROVIDER_URL = originalEnv
    })

    it('adds no plugin dir or extractor args when unset', async () => {
        delete process.env.YTDLP_POT_PROVIDER_URL
        script('ok')

        await streamViaYtDlp(youtubeUrl)

        expect(spawnArgs(0)).not.toContain('--plugin-dirs')
        expect(spawnArgs(0)).not.toContain('--extractor-args')
    })

    it('loads the plugin and passes the provider URL on a YouTube target', async () => {
        process.env.YTDLP_POT_PROVIDER_URL = providerUrl
        script('ok')

        await streamViaYtDlp(youtubeUrl)

        const args = spawnArgs(0)
        const at = args.indexOf('--plugin-dirs')
        expect(args.slice(at, at + potArgs.length)).toEqual(potArgs)
        // The URL stays the last argument.
        expect(args[args.length - 1]).toBe(youtubeUrl)
    })

    it('keeps the provider on the cookies retry too', async () => {
        process.env.YTDLP_POT_PROVIDER_URL = providerUrl
        process.env.YTDLP_COOKIES_FILE = '/app/secrets/youtube-cookies.txt'
        mockStatSync.mockReturnValue({ isFile: () => true })
        mockAccessSync.mockReturnValue(undefined)
        script(SIGN_IN, 'ok')

        await streamViaYtDlp(youtubeUrl)

        expect(spawnArgs(0)).toEqual(expect.arrayContaining(potArgs))
        expect(spawnArgs(1)).toEqual(expect.arrayContaining(potArgs))
        expect(spawnArgs(1)).toContain('--cookies')
        delete process.env.YTDLP_COOKIES_FILE
    })

    it('leaves SoundCloud through yt-dlp untouched', async () => {
        process.env.YTDLP_POT_PROVIDER_URL = providerUrl
        script('ok')

        await streamViaYtDlp('https://soundcloud.com/artist/track')

        expect(spawnArgs(0)).not.toContain('--plugin-dirs')
    })

    it.each([
        'bgutil-pot:4416',
        'file:///etc/passwd',
        'http://bgutil-pot:4416;other=1',
    ])('ignores a malformed provider URL (%s) and warns once', async (bad) => {
        process.env.YTDLP_POT_PROVIDER_URL = bad
        script('ok', 'ok')

        await streamViaYtDlp(youtubeUrl)
        await streamViaYtDlp(youtubeUrl)

        expect(spawnArgs(0)).not.toContain('--plugin-dirs')
        expect(spawnArgs(1)).not.toContain('--plugin-dirs')
        expect(mockWarnLog).toHaveBeenCalledTimes(1)
    })

    it('logs the configured provider once, by origin only', async () => {
        process.env.YTDLP_POT_PROVIDER_URL =
            'http://user:secret@bgutil-pot:4416'
        script('ok', 'ok')

        await streamViaYtDlp(youtubeUrl)
        await streamViaYtDlp(youtubeUrl)

        const potLogs = mockInfoLog.mock.calls.filter(
            ([entry]) =>
                (entry as { message: string }).message ===
                'Bridge: yt-dlp po_token provider configured',
        )
        expect(potLogs).toHaveLength(1)
        expect(JSON.stringify(potLogs[0])).not.toContain('secret')
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

    it('rejects instead of resolving partial output when killed by a signal', async () => {
        const proc = makeFakeProc()
        mockSpawn.mockReturnValueOnce(proc)
        setImmediate(() => {
            proc.stdout.emit(
                'data',
                Buffer.from('{"id": "a1", "title": "Song", "duration": 201}\n'),
            )
            proc.emit('close', null, 'SIGKILL')
        })
        await expect(searchYtDlpCandidates('song')).rejects.toThrow(
            'yt-dlp exited with signal SIGKILL',
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
