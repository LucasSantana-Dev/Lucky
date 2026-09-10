import { spawn } from 'node:child_process'
import { accessSync, constants, statSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import type { Readable } from 'node:stream'
import { infoLog, warnLog } from '@lucky/shared/utils'
import { assertDefined } from '@lucky/shared/utils/guards'

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

// Test-only: the log-once dedup above is module-level state, so tests that
// assert on it must reset between cases instead of relying on run order.
export function __resetYtdlpCookiesLogStateForTests(): void {
    loggedCookiesMissing = false
    loggedCookiesApplied = false
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

// #2141: the prior 6s budget (set by #2044) sat inside the normal latency
// distribution rather than above it. Prod measurement with --cookies (the
// live path, since YTDLP_COOKIES_FILE is set) gave a p100 of 7673ms, and the
// 6s budget was killing 16.8% of otherwise-healthy resolutions. Set just
// above that measured p100.
export const YTDLP_STREAM_START_TIMEOUT_MS = 8_000

export function streamViaYtDlp(url: string): Promise<Readable> {
    try {
        validateYtDlpUrl(url)
    } catch (err) {
        return Promise.reject(err)
    }
    return new Promise<Readable>((resolve, reject) => {
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
                ...ytdlpCookiesArgs(),
                url,
            ],
            { stdio: ['ignore', 'pipe', 'pipe'] },
        )

        // On every attempt this fires, the caller still has to wait out the
        // full duration before falling back to SoundCloud, so a long timeout
        // directly taxes perceived playback latency whenever yt-dlp is
        // degraded (rate-limited/blocked) rather than erroring fast. See the
        // constant above for why this isn't shorter.
        const timeout = setTimeout(() => {
            proc.kill()
            reject(new Error('yt-dlp: timed out waiting for stream start'))
        }, YTDLP_STREAM_START_TIMEOUT_MS)

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
                    new Error(`yt-dlp exited without output (code ${code})${reason}`),
                )
            }
        })
    })
}

export function streamViaYtDlpSearch(query: string): Promise<Readable> {
    if (!query.trim())
        return Promise.reject(new Error('yt-dlp search: empty query'))
    return streamViaYtDlp(`ytsearch1:${query}`)
}
