import { spawn } from 'child_process'
import { accessSync, constants, statSync } from 'fs'
import { PassThrough } from 'stream'
import type { Readable } from 'stream'
import type { Track } from 'discord-player'
import { infoLog, warnLog, debugLog } from '@lucky/shared/utils'
import { assertDefined } from '@lucky/shared/utils/guards'
import {
    cleanTitle,
    cleanAuthor,
    cleanSearchQuery,
    extractSongCore,
} from '../../utils/music/searchQueryCleaner'
import { providerHealthService } from '../../utils/music/search/providerHealth'
import { streamViaSoundCloud } from './soundcloudMatcher'
import {
    addBreadcrumb,
    captureMessage,
    safeUrlOrigin,
    scrubUrls,
} from '../../utils/monitoring/sentry'

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
    if (!ALLOWED_YTDLP_DOMAINS.has(parsed.hostname.toLowerCase())) {
        throw new Error(`yt-dlp: domain not in allowlist: ${parsed.hostname}`)
    }
}

// ADR 2026-06-18 (youtube-extraction-reliability): YouTube's velocity-based
// bot detection returns 403 on cookie-less requests. Point YTDLP_COOKIES_FILE
// at a Netscape-format cookies.txt (exported from a logged-in browser
// session) to authenticate yt-dlp's requests. Optional — falls back to the
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
            // NOSONAR: S4036 — command is hardcoded, URL is validated by validateYtDlpUrl before this point
            'yt-dlp',
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
            if (code && code !== 0) {
                const stderr = Buffer.concat(stderrChunks).toString().trim()
                const reason = stderr ? ` — ${stderr.split('\n')[0]}` : ''
                reject(new Error(`yt-dlp exited with code ${code}${reason}`))
            }
        })
    })
}

export function streamViaYtDlpSearch(query: string): Promise<Readable> {
    if (!query.trim())
        return Promise.reject(new Error('yt-dlp search: empty query'))
    return streamViaYtDlp(`ytsearch1:${query}`)
}

/**
 * SoundCloud fallback stages that can resolve a track when the primary
 * yt-dlp paths fail. When one of these resolves, the stage is stamped onto
 * the track's metadata so the Now Playing embed can tell the user a fallback
 * happened. Primary yt-dlp resolutions leave the metadata untouched.
 */
export type StreamBridgeFallbackStage =
    'soundcloud-full' | 'soundcloud-title' | 'soundcloud-core'

export const STREAM_BRIDGE_FALLBACK_METADATA_KEY = 'streamBridgeFallbackStage'

const FALLBACK_STAGE_LABELS: Record<StreamBridgeFallbackStage, string> = {
    'soundcloud-full': 'SoundCloud search',
    'soundcloud-title': 'SoundCloud title-only search',
    'soundcloud-core': 'SoundCloud simplified-title search',
}

/**
 * Human-readable label of the fallback stage that resolved this track, or
 * undefined when the primary yt-dlp source resolved it (or no stream was
 * bridged at all). Used to render a subtle footnote in the Now Playing embed.
 */
export function getStreamBridgeFallbackLabel(track: {
    metadata?: unknown
}): string | undefined {
    const stage = (track.metadata as Record<string, unknown> | undefined)?.[
        STREAM_BRIDGE_FALLBACK_METADATA_KEY
    ]
    if (typeof stage !== 'string') return undefined
    return FALLBACK_STAGE_LABELS[stage as StreamBridgeFallbackStage]
}

function stampFallbackStage(
    track: Pick<
        Track,
        'title' | 'author' | 'duration' | 'url' | 'metadata' | 'setMetadata'
    >,
    stage: StreamBridgeFallbackStage,
): void {
    const existing =
        typeof track.metadata === 'object' && track.metadata !== null
            ? (track.metadata as Record<string, unknown>)
            : {}
    track.setMetadata({
        ...existing,
        [STREAM_BRIDGE_FALLBACK_METADATA_KEY]: stage,
    })
}

export async function createResilientStream(
    track: Pick<
        Track,
        'title' | 'author' | 'duration' | 'url' | 'metadata' | 'setMetadata'
    >,
    _ext?: unknown,
): Promise<Readable> {
    const cleanedTitle = cleanTitle(track.title)
    const cleanedAuthor = cleanAuthor(track.author)
    const isSpotifyUrl = track.url?.includes('open.spotify.com') ?? false

    debugLog({
        message: 'Bridge: resolving stream',
        data: {
            title: track.title,
            author: track.author,
            cleanedTitle,
            cleanedAuthor,
            hasUrl: Boolean(track.url),
            isSpotifyUrl,
        },
    })

    let youtubeStage: string | undefined

    if (track.url && !isSpotifyUrl) {
        try {
            const stream = await streamViaYtDlp(track.url)
            addBreadcrumb(
                'YouTube stream resolved via yt-dlp',
                'music.youtube-extraction',
                'info',
            )
            infoLog({
                message: 'Bridge: streamed via yt-dlp',
                data: { url: track.url, title: cleanedTitle || track.title },
            })
            return stream
        } catch (ytdlpError) {
            youtubeStage = 'yt-dlp-url'
            addBreadcrumb(
                'YouTube extraction failed via yt-dlp URL',
                'music.youtube-extraction',
                'warning',
                {
                    error: scrubUrls((ytdlpError as Error).message),
                    url: safeUrlOrigin(track.url),
                },
            )
            captureMessage(
                `YouTube extraction failed: ${scrubUrls((ytdlpError as Error).message)}`,
                'warning',
                {
                    url: safeUrlOrigin(track.url),
                },
                {
                    category: 'music.youtube-extraction',
                    stage: 'yt-dlp-url',
                },
            )
            warnLog({
                message: 'Bridge: yt-dlp failed, falling back to SoundCloud',
                data: {
                    error: (ytdlpError as Error).message,
                    url: track.url,
                    cleanedTitle,
                },
            })
        }
    }

    if (isSpotifyUrl) {
        const ytQuery = `${cleanSearchQuery(cleanedTitle, cleanedAuthor)} official audio`
        try {
            const stream = await streamViaYtDlpSearch(ytQuery)
            addBreadcrumb(
                'YouTube search stream resolved for Spotify source',
                'music.youtube-extraction',
                'info',
            )
            infoLog({
                message:
                    'Bridge: streamed via yt-dlp YouTube search (Spotify source)',
                data: { query: ytQuery, title: cleanedTitle },
            })
            return stream
        } catch (ytSearchError) {
            youtubeStage = 'yt-dlp-search'
            addBreadcrumb(
                'YouTube extraction failed via search',
                'music.youtube-extraction',
                'warning',
                {
                    error: scrubUrls((ytSearchError as Error).message),
                    searchText: ytQuery,
                },
            )
            captureMessage(
                `YouTube search extraction failed: ${scrubUrls((ytSearchError as Error).message)}`,
                'warning',
                {
                    searchText: ytQuery,
                },
                {
                    category: 'music.youtube-extraction',
                    stage: 'yt-dlp-search',
                },
            )
            warnLog({
                message:
                    'Bridge: yt-dlp YouTube search failed, falling back to SoundCloud',
                data: {
                    error: (ytSearchError as Error).message,
                    query: ytQuery,
                    cleanedTitle,
                },
            })
        }
    }

    if (!cleanedTitle) {
        warnLog({
            message:
                'Bridge: yt-dlp failed and title is empty, cannot fallback',
            data: { url: track.url },
        })
        throw new Error('Bridge exhausted: no stream for empty title')
    }

    if (!providerHealthService.isAvailable('soundcloud')) {
        addBreadcrumb(
            'SoundCloud circuit open, skipping fallback',
            'music.youtube-extraction',
            'warning',
        )
        warnLog({
            message:
                'Bridge: SoundCloud circuit open, skipping fallback stages',
            data: {
                title: track.title,
                cleanedTitle,
                url: track.url,
            },
        })
        throw new Error(`Bridge exhausted: no stream for "${track.title}"`)
    }

    try {
        const stream = await streamViaSoundCloud(
            cleanSearchQuery(cleanedTitle, cleanedAuthor),
            track.duration,
        )
        stampFallbackStage(track, 'soundcloud-full')
        return stream
    } catch (primaryError) {
        warnLog({
            message:
                'Bridge: SoundCloud primary search failed, retrying with title only',
            data: {
                error: (primaryError as Error).message,
                cleanedTitle,
            },
        })
    }

    try {
        const stream = await streamViaSoundCloud(cleanedTitle, track.duration)
        stampFallbackStage(track, 'soundcloud-title')
        return stream
    } catch (titleOnlyError) {
        warnLog({
            message:
                'Bridge: title-only SoundCloud failed, retrying without parentheticals',
            data: {
                error: (titleOnlyError as Error).message,
                cleanedTitle,
            },
        })
    }

    // #2142: this stage used to be gated on "the title had a parenthetical to
    // strip", so titles without one (most tracks) silently never got a third
    // attempt. It now always runs after stage 2 fails, broadening via
    // extractSongCore (e.g. "Artist - Song" -> "Song") when there is no
    // parenthetical to strip. The only reason to skip is a query that would
    // be byte-identical to one already tried.
    const openParen = cleanedTitle.indexOf('(')
    const parenStrippedTitle =
        openParen > 0 ? cleanedTitle.slice(0, openParen).trim() : cleanedTitle
    const coreTitle =
        parenStrippedTitle !== cleanedTitle
            ? parenStrippedTitle
            : (extractSongCore(cleanedTitle, cleanedAuthor) ??
              parenStrippedTitle)
    const alreadyTriedQueries = new Set([
        cleanSearchQuery(cleanedTitle, cleanedAuthor),
        cleanedTitle,
    ])
    if (coreTitle && !alreadyTriedQueries.has(coreTitle)) {
        try {
            const stream = await streamViaSoundCloud(coreTitle, track.duration)
            stampFallbackStage(track, 'soundcloud-core')
            return stream
        } catch (coreError) {
            const attemptedStages = [
                youtubeStage || 'yt-dlp',
                'soundcloud-full',
                'soundcloud-title',
                'soundcloud-core',
            ]
            captureMessage(
                'YouTube extraction exhausted all fallback stages',
                'warning',
                {
                    title: track.title,
                    url: safeUrlOrigin(track.url),
                    stages: attemptedStages,
                },
                {
                    category: 'music.youtube-extraction',
                    stage: 'all-exhausted',
                },
            )
            warnLog({
                message: 'Bridge: all stages exhausted',
                error: coreError,
                data: {
                    title: track.title,
                    cleanedTitle,
                    coreTitle,
                    url: track.url,
                    stages: attemptedStages,
                },
            })
        }
    } else {
        const attemptedStages = [
            youtubeStage || 'yt-dlp',
            'soundcloud-full',
            'soundcloud-title',
        ]
        captureMessage(
            'YouTube extraction exhausted all fallback stages',
            'warning',
            {
                title: track.title,
                url: safeUrlOrigin(track.url),
                stages: attemptedStages,
            },
            {
                category: 'music.youtube-extraction',
                stage: 'all-exhausted',
            },
        )
        warnLog({
            message: 'Bridge: all stages exhausted',
            data: {
                title: track.title,
                cleanedTitle,
                url: track.url,
                stages: attemptedStages,
            },
        })
    }

    throw new Error(`Bridge exhausted: no stream for "${track.title}"`)
}
