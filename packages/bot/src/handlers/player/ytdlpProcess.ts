import { spawn } from 'node:child_process'
import { accessSync, constants, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import type { Readable } from 'node:stream'
import { infoLog, warnLog } from '@lucky/shared/utils'
import { assertDefined } from '@lucky/shared/utils/guards'
import { isHostedYoutubeEnabled } from '../../config/featureFlags'
import { classifyYtDlpFailure, countYtDlpFailure } from './ytdlpBlockBreaker'

// Absolute path, not a bare "yt-dlp" resolved via PATH lookup (CWE-426):
// the Dockerfile symlinks the venv binary to this fixed location. Override
// for local dev where it may live elsewhere (e.g. a pyenv/homebrew path).
const YTDLP_BINARY_PATH =
    process.env.YTDLP_BINARY_PATH || '/usr/local/bin/yt-dlp'

const ALLOWED_YTDLP_DOMAINS = new Set([
    'youtube.com',
    'www.youtube.com',
    'youtu.be',
    'music.youtube.com',
    'soundcloud.com',
    'www.soundcloud.com',
])

// Subset of ALLOWED_YTDLP_DOMAINS the HOSTED_YOUTUBE_ENABLED kill switch
// actually gates. This module also streams the allowlisted SoundCloud
// domains via yt-dlp, and that path has nothing to do with YouTube, so it
// must keep working when YouTube is disabled.
const YOUTUBE_YTDLP_DOMAINS = new Set([
    'youtube.com',
    'www.youtube.com',
    'youtu.be',
    'music.youtube.com',
])

function isYoutubeYtDlpTarget(url: string): boolean {
    // streamViaYtDlpSearch always builds a `ytsearch1:<query>` string, which
    // only ever searches YouTube.
    if (url.startsWith('ytsearch')) return true
    try {
        const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, '')
        return YOUTUBE_YTDLP_DOMAINS.has(hostname)
    } catch {
        // Not a parseable URL: validateYtDlpUrl below will reject it on its
        // own terms, independent of the flag.
        return false
    }
}

function validateYtDlpUrl(url: string): void {
    if (url.startsWith('ytsearch')) return
    let parsed: URL
    try {
        parsed = new URL(url)
    } catch (error) {
        throw new Error(`yt-dlp: invalid URL`, { cause: error })
    }
    if (parsed.protocol !== 'https:') {
        throw new Error(`yt-dlp: only https URLs are allowed`)
    }
    if (
        !ALLOWED_YTDLP_DOMAINS.has(
            parsed.hostname.toLowerCase().replace(/\.$/, ''),
        )
    ) {
        throw new Error(`yt-dlp: domain not in allowlist: ${parsed.hostname}`)
    }
}

// ADR 2026-06-18 (youtube-extraction-reliability): YouTube's velocity-based
// bot detection returns 403 on cookie-less requests. Point YTDLP_COOKIES_FILE
// at a Netscape-format cookies.txt (exported from a logged-in browser
// session) to authenticate yt-dlp's requests. Optional - falls back to the
// prior cookie-less behavior when unset or the file isn't there.
let loggedCookiesMissing = false
let loggedCookiesApplied = false
let cookiesRejectedWarnedAt = 0

// "cookies file applied" only proves the file is readable. When the cookies
// retry gets the same sign-in challenge, the session in the file is logged
// out or expired, and every YouTube play falls to SoundCloud until someone
// re-exports it (2026-10-19). Warn about that, at most once an hour.
const COOKIES_REJECTED_WARN_COOLDOWN_MS = 60 * 60_000

// Test-only: the log-once dedup above is module-level state, so tests that
// assert on it must reset between cases instead of relying on run order.
export function __resetYtdlpCookiesLogStateForTests(): void {
    loggedCookiesMissing = false
    loggedCookiesApplied = false
    cookiesRejectedWarnedAt = 0
}

function warnCookiesRejected(cookiesFile: string | undefined): void {
    const now = Date.now()
    if (now - cookiesRejectedWarnedAt < COOKIES_REJECTED_WARN_COOLDOWN_MS)
        return
    cookiesRejectedWarnedAt = now
    warnLog({
        message:
            'Bridge: yt-dlp still got the sign-in check with cookies, re-export the cookies file (secrets/README.md)',
        data: { cookiesFile },
    })
}

function isReadableFile(cookiesFile: string): boolean {
    try {
        if (!statSync(cookiesFile).isFile()) return false
        accessSync(cookiesFile, constants.R_OK)
        return true
    } catch {
        return false
    }
}

function ytdlpCookiesArgs(): string[] {
    const cookiesFile = process.env.YTDLP_COOKIES_FILE
    if (!cookiesFile) return []

    if (!isReadableFile(cookiesFile)) {
        if (!loggedCookiesMissing) {
            loggedCookiesMissing = true
            warnLog({
                message:
                    'Bridge: YTDLP_COOKIES_FILE is set but not a readable file — running cookie-less',
                data: { cookiesFile },
            })
        }
        return []
    }

    if (!loggedCookiesApplied) {
        loggedCookiesApplied = true
        infoLog({
            message: 'Bridge: yt-dlp cookies file applied',
            data: { cookiesFile },
        })
    }
    return ['--cookies', cookiesFile]
}

// ADR 2026-06-18, step 2 of the escalation ladder (amendment 2026-10-21):
// a bgutil po_token provider. The plugin sits in its own plugin dir (see the
// Dockerfile), outside yt-dlp's default search path, so it only loads when
// YTDLP_POT_PROVIDER_URL is set and nothing changes while it is unset. If the
// sidecar is down, the plugin's /ping fails fast and yt-dlp extracts without a
// PO token, exactly as it does with the provider unset.
const YTDLP_POT_PLUGIN_DIR =
    process.env.YTDLP_POT_PLUGIN_DIR || '/opt/ytdlp-plugins'
let loggedPotProvider = false

export function __resetYtdlpPotLogStateForTests(): void {
    loggedPotProvider = false
}

function ytdlpPotProviderArgs(url: string): string[] {
    const baseUrl = process.env.YTDLP_POT_PROVIDER_URL
    if (!baseUrl || !isYoutubeYtDlpTarget(url)) return []

    let parsed: URL | undefined
    try {
        parsed = new URL(baseUrl)
    } catch {
        // Falls through to the warning below.
    }
    // `;` separates extractor args, so it must not reach the arg value.
    const valid =
        (parsed?.protocol === 'http:' || parsed?.protocol === 'https:') &&
        !baseUrl.includes(';')
    if (!loggedPotProvider) {
        loggedPotProvider = true
        if (valid) {
            infoLog({
                message: 'Bridge: yt-dlp po_token provider configured',
                data: { origin: parsed?.origin },
            })
        } else {
            warnLog({
                message:
                    'Bridge: YTDLP_POT_PROVIDER_URL is not an http(s) URL, running without a po_token provider',
            })
        }
    }
    if (!valid) return []
    return [
        '--plugin-dirs',
        YTDLP_POT_PLUGIN_DIR,
        '--extractor-args',
        `youtubepot-bgutilhttp:base_url=${baseUrl}`,
    ]
}

// #2141: the prior 6s budget (set by #2044) sat inside the normal latency
// distribution rather than above it. Prod measurement with --cookies (the
// live path then; since #2653 cookies only apply on a sign-in retry) gave a
// p100 of 7673ms, and the
// 6s budget was killing 16.8% of otherwise-healthy resolutions. Set just
// above that measured p100.
export const YTDLP_STREAM_START_TIMEOUT_MS = 8_000

// ytsearch adds a YouTube search round-trip on top of the audio stream start.
// Its total observed p95 sits below the direct-URL p100, so a shorter budget
// lets the bridge fail faster on degraded YouTube without cutting healthy
// resolutions (#2742).
export const YTDLP_SEARCH_STREAM_TIMEOUT_MS = 7_000

// HOSTED_YOUTUBE_ENABLED (decisions/2026-09-27-music-first-positioning.md
// point 3): this is the layer that actually spawns yt-dlp against YouTube, so
// the kill switch is enforced here rather than only at the extractor
// registration in playerFactory.ts. Registration is normally the only path
// in, but this module is exported (re-exported at playerFactory.ts) and
// callers reaching it directly must not be able to bypass the flag.
// streamViaYtDlpSearch delegates to this function for every call, so this
// single check covers both the URL and search entry points. Scoped to actual
// YouTube targets (isYoutubeYtDlpTarget) so the allowlisted SoundCloud path
// through this same function keeps working when YouTube is disabled.
export function streamViaYtDlp(
    url: string,
    timeoutMs = YTDLP_STREAM_START_TIMEOUT_MS,
): Promise<Readable> {
    if (isYoutubeYtDlpTarget(url) && !isHostedYoutubeEnabled()) {
        return Promise.reject(
            new Error('yt-dlp: YouTube disabled (HOSTED_YOUTUBE_ENABLED)'),
        )
    }
    try {
        validateYtDlpUrl(url)
    } catch (err) {
        return Promise.reject(err)
    }
    // Cookies only answer a sign-in challenge (#2653). Since 2026-10-06 a
    // logged-in session makes yt-dlp use web clients that need a GVS PO
    // token, so every cookie-backed download got HTTP 403, while the same
    // download without cookies streams. The bot-check that cookies were added
    // for (#2036) logged 0 times in the 30 days before.
    //
    // A per-request 403 is intermittent (measured 2026-10-13: 2 of 12 runs of
    // the same command, other runs of the same query succeeded). Re-running
    // gets a freshly signed URL and usually works, so a 403 is retried once,
    // cookie-less like the first attempt. Each cause gets at most one extra
    // attempt and only the first failure is inspected, so the paths never
    // chain: sign-in -> cookies retry, 403 -> plain retry, anything else ->
    // throw. A failure of the retry itself propagates as is. The retry runs
    // inside this function, so the block breaker (recordYtDlpFailure in the
    // bridge) only sees a 403 that also failed the retry.
    return spawnYtDlp(url, [], timeoutMs).catch((error: unknown) => {
        if (classifyYtDlpFailure(error) === 'forbidden') {
            // Count the first 403 so Prometheus reflects every attempt, even
            // those the retry recovers. The block breaker (recordYtDlpFailure
            // in the bridge) only fires when the retry also fails (#2864).
            // YouTube only: the metric and its alert describe YouTube blocks.
            if (isYoutubeYtDlpTarget(url)) countYtDlpFailure(error)
            infoLog({
                message: 'Bridge: yt-dlp got HTTP 403, retrying once',
                data: { retry: 'forbidden' },
            })
            return spawnYtDlp(url, [], timeoutMs)
        }
        const cookiesArgs = needsSignIn(error) ? ytdlpCookiesArgs() : []
        if (cookiesArgs.length === 0) throw error
        // Count the first sign-in challenge too: the cookies retry may
        // recover it, and the breaker only sees a failed retry (#2864).
        if (isYoutubeYtDlpTarget(url)) countYtDlpFailure(error)
        return spawnYtDlp(url, cookiesArgs, timeoutMs).catch(
            (retryError: unknown) => {
                if (needsSignIn(retryError))
                    warnCookiesRejected(process.env.YTDLP_COOKIES_FILE)
                throw retryError
            },
        )
    })
}

// Deliberately broad: matches both the bot-check ("Sign in to confirm you're
// not a bot") and the age gate ("Sign in to confirm your age"), since a
// logged-in cookies session is what an age-gated video needs. Not the same as
// classifyYtDlpFailure in ytdlpBlockBreaker.ts, which matches only the
// bot-check (#2779) so age-gate failures never open a YouTube-wide block.
function needsSignIn(error: unknown): boolean {
    return (
        error instanceof Error && error.message.includes('Sign in to confirm')
    )
}

function spawnYtDlp(
    url: string,
    cookiesArgs: string[],
    timeoutMs = YTDLP_STREAM_START_TIMEOUT_MS,
): Promise<Readable> {
    return new Promise<Readable>((resolve, reject) => {
        // HLS sources (SoundCloud AAC) make yt-dlp write fragment .part
        // files (`--Frag1.part`) to the cwd even with `-o -`. The container's
        // cwd (/app) is root-owned, and concurrent streams would clobber each
        // other's fragments in a shared dir, so each run gets its own.
        const workDir = mkdtempSync(join(tmpdir(), 'ytdlp-'))
        const removeWorkDir = () =>
            rmSync(workDir, { recursive: true, force: true })
        const proc = spawn(
            YTDLP_BINARY_PATH,
            [
                '--no-playlist',
                '-f',
                'bestaudio/best',
                '-o',
                '-',
                '--quiet',
                '--no-warnings',
                '--no-progress',
                '--js-runtimes',
                `node:${process.execPath}`,
                ...ytdlpPotProviderArgs(url),
                ...cookiesArgs,
                url,
            ],
            { stdio: ['ignore', 'pipe', 'pipe'], cwd: workDir },
        )
        proc.once('close', removeWorkDir)

        // On every attempt this fires, the caller still has to wait out the
        // full duration before falling back to SoundCloud, so a long timeout
        // directly taxes perceived playback latency whenever yt-dlp is
        // degraded (rate-limited/blocked) rather than erroring fast. See the
        // constant above for why this isn't shorter. The 403 retry adds one
        // more attempt only after a fast failure, never after a timeout.
        const timeout = setTimeout(() => {
            proc.kill()
            reject(new Error('yt-dlp: timed out waiting for stream start'))
        }, timeoutMs)

        const stderrChunks: Buffer[] = []
        assertDefined(proc.stderr, 'stderr guaranteed by stdio config').on(
            'data',
            (chunk: Buffer) => stderrChunks.push(chunk),
        )

        let settled = false

        assertDefined(proc.stdout, 'stdout guaranteed by stdio config').once(
            'data',
            (firstChunk: Buffer) => {
                if (settled) return
                settled = true
                clearTimeout(timeout)
                const through = new PassThrough()
                through.write(firstChunk)
                assertDefined(
                    proc.stdout,
                    'stdout guaranteed by stdio config',
                ).pipe(through)
                resolve(through)
            },
        )

        proc.once('error', (err) => {
            removeWorkDir()
            if (settled) return
            settled = true
            clearTimeout(timeout)
            proc.kill()
            reject(err)
        })

        proc.once('close', (code) => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            const stderr = Buffer.concat(stderrChunks).toString().trim()
            const reason = stderr ? ` - ${stderr.split('\n')[0]}` : ''
            if (code && code !== 0) {
                reject(new Error(`yt-dlp exited with code ${code}${reason}`))
            } else {
                reject(
                    new Error(
                        `yt-dlp exited without output (code ${code})${reason}`,
                    ),
                )
            }
        })
    })
}

export function streamViaYtDlpSearch(query: string): Promise<Readable> {
    if (!query.trim())
        return Promise.reject(new Error('yt-dlp search: empty query'))
    return streamViaYtDlp(`ytsearch1:${query}`, YTDLP_SEARCH_STREAM_TIMEOUT_MS)
}

export type YtSearchCandidate = {
    id: string
    title: string
    channel: string
    durationSec: number | null
}

// A flat search only fetches the results page (no player JS, no formats):
// measured 1-2 s. The stream of the chosen video then gets its own
// YTDLP_STREAM_START_TIMEOUT_MS, the same budget a direct URL play has.
export const YTDLP_SEARCH_RESOLVE_TIMEOUT_MS = 5_000
const YTDLP_SEARCH_MAX_OUTPUT_BYTES = 64 * 1024

/**
 * Lists the top YouTube search hits without streaming any of them, so the
 * caller can validate title, channel and duration before playing one.
 * Resolves [] when the search has no results.
 */
export function searchYtDlpCandidates(
    query: string,
    limit = 5,
): Promise<YtSearchCandidate[]> {
    if (!query.trim())
        return Promise.reject(new Error('yt-dlp search: empty query'))
    if (!isHostedYoutubeEnabled()) {
        return Promise.reject(
            new Error('yt-dlp: YouTube disabled (HOSTED_YOUTUBE_ENABLED)'),
        )
    }
    return new Promise<YtSearchCandidate[]>((resolve, reject) => {
        const proc = spawn(
            YTDLP_BINARY_PATH,
            [
                '--flat-playlist',
                '--no-warnings',
                '--print',
                '%(.{id,title,channel,duration})j',
                `ytsearch${limit}:${query}`,
            ],
            { stdio: ['ignore', 'pipe', 'pipe'], cwd: tmpdir() },
        )

        let settled = false
        const finish = (error: Error | null, result?: YtSearchCandidate[]) => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            if (error) reject(error)
            else resolve(result ?? [])
        }

        const timeout = setTimeout(() => {
            proc.kill()
            finish(new Error('yt-dlp: timed out resolving search results'))
        }, YTDLP_SEARCH_RESOLVE_TIMEOUT_MS)

        const stdoutChunks: Buffer[] = []
        let stdoutBytes = 0
        const stderrChunks: Buffer[] = []
        assertDefined(proc.stdout, 'stdout guaranteed by stdio config').on(
            'data',
            (chunk: Buffer) => {
                stdoutBytes += chunk.length
                if (stdoutBytes <= YTDLP_SEARCH_MAX_OUTPUT_BYTES) {
                    stdoutChunks.push(chunk)
                }
            },
        )
        assertDefined(proc.stderr, 'stderr guaranteed by stdio config').on(
            'data',
            (chunk: Buffer) => stderrChunks.push(chunk),
        )

        proc.once('error', (err) => {
            proc.kill()
            finish(err)
        })

        proc.once('close', (code, signal) => {
            // A signal kill reports code null: that output is partial, so only
            // a clean exit counts as a search result.
            if (code !== 0) {
                const stderr = Buffer.concat(stderrChunks).toString().trim()
                const reason = stderr ? ` - ${stderr.split('\n')[0]}` : ''
                const exit = code === null ? `signal ${signal}` : `code ${code}`
                finish(new Error(`yt-dlp exited with ${exit}${reason}`))
                return
            }
            finish(
                null,
                parseSearchCandidates(Buffer.concat(stdoutChunks).toString()),
            )
        })
    })
}

function parseSearchCandidates(output: string): YtSearchCandidate[] {
    const candidates: YtSearchCandidate[] = []
    for (const line of output.split('\n')) {
        if (!line.trim()) continue
        try {
            const entry = JSON.parse(line) as Record<string, unknown>
            if (typeof entry.id !== 'string' || !entry.id) continue
            candidates.push({
                id: entry.id,
                title: typeof entry.title === 'string' ? entry.title : '',
                channel: typeof entry.channel === 'string' ? entry.channel : '',
                durationSec:
                    typeof entry.duration === 'number' && entry.duration > 0
                        ? entry.duration
                        : null,
            })
        } catch {
            // A truncated or non-JSON line is skipped, not fatal.
        }
    }
    return candidates
}
