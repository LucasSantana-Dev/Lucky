import type { Readable } from 'node:stream'
import type { Track } from 'discord-player'
import { debugLog, infoLog, warnLog } from '@lucky/shared/utils'
import {
    cleanTitle,
    cleanAuthor,
    cleanSearchQuery,
    extractSongCore,
} from '../../utils/music/searchQueryCleaner'
import { providerHealthService } from '../../services/musicManagement/search/providerHealth'
import { streamViaSoundCloud } from './soundcloudMatcher'
import {
    addBreadcrumb,
    captureMessage,
    safeUrlOrigin,
    scrubUrls,
} from '../../utils/monitoring/sentry'
import { isHost } from '../../utils/general/urlHost'
import { playStageSeconds } from '../../utils/monitoring/prometheus'
import { streamViaYtDlp, streamViaYtDlpSearch } from './ytdlpProcess'
import {
    isYtDlpBlocked,
    recordYtDlpFailure,
    recordYtDlpSuccess,
} from './ytdlpBlockBreaker'
import {
    stampFallbackStage,
    type StreamBridgeFallbackStage,
} from './streamFallbackState'

type BridgeTrack = Pick<
    Track,
    'title' | 'author' | 'duration' | 'url' | 'metadata' | 'setMetadata'
>

type BridgeStage =
    | 'ytdlp_url'
    | 'ytdlp_search'
    | 'soundcloud_full'
    | 'soundcloud_title'
    | 'soundcloud_core'
    | 'bridge_total'

function observeStage(
    stage: BridgeStage,
    startedAt: number,
    outcome: 'ok' | 'fail',
): number {
    const durationMs = Date.now() - startedAt
    try {
        playStageSeconds.observe({ stage, outcome }, durationMs / 1000)
    } catch {
        // Telemetry must never break stream resolution
    }
    return durationMs
}

async function attemptYtDlpUrl(
    track: BridgeTrack,
    cleanedTitle: string,
): Promise<Readable | null> {
    const startedAt = Date.now()
    try {
        const stream = await streamViaYtDlp(track.url as string)
        const durationMs = observeStage('ytdlp_url', startedAt, 'ok')
        recordYtDlpSuccess()
        addBreadcrumb(
            'YouTube stream resolved via yt-dlp',
            'music.youtube-extraction',
            'info',
        )
        infoLog({
            message: 'Bridge: streamed via yt-dlp',
            data: {
                url: track.url,
                title: cleanedTitle || track.title,
                durationMs,
            },
        })
        return stream
    } catch (ytdlpError) {
        const durationMs = observeStage('ytdlp_url', startedAt, 'fail')
        recordYtDlpFailure(ytdlpError)
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
            { url: safeUrlOrigin(track.url) },
            { category: 'music.youtube-extraction', stage: 'yt-dlp-url' },
        )
        warnLog({
            message: 'Bridge: yt-dlp failed, falling back to SoundCloud',
            data: {
                error: (ytdlpError as Error).message,
                url: track.url,
                cleanedTitle,
                durationMs,
            },
        })
        return null
    }
}

async function attemptYtDlpSearch(
    cleanedTitle: string,
    cleanedAuthor: string,
): Promise<Readable | null> {
    const ytQuery = `${cleanSearchQuery(cleanedTitle, cleanedAuthor)} official audio`
    const startedAt = Date.now()
    try {
        const stream = await streamViaYtDlpSearch(ytQuery)
        const durationMs = observeStage('ytdlp_search', startedAt, 'ok')
        recordYtDlpSuccess()
        addBreadcrumb(
            'YouTube search stream resolved for Spotify source',
            'music.youtube-extraction',
            'info',
        )
        infoLog({
            message:
                'Bridge: streamed via yt-dlp YouTube search (Spotify source)',
            data: {
                query: ytQuery,
                title: cleanedTitle,
                durationMs,
            },
        })
        return stream
    } catch (ytSearchError) {
        const durationMs = observeStage('ytdlp_search', startedAt, 'fail')
        recordYtDlpFailure(ytSearchError)
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
            { searchText: ytQuery },
            { category: 'music.youtube-extraction', stage: 'yt-dlp-search' },
        )
        warnLog({
            message:
                'Bridge: yt-dlp YouTube search failed, falling back to SoundCloud',
            data: {
                error: (ytSearchError as Error).message,
                query: ytQuery,
                cleanedTitle,
                durationMs,
            },
        })
        return null
    }
}

async function attemptSoundCloud(
    query: string,
    track: BridgeTrack,
    stageLabel: StreamBridgeFallbackStage,
    failureMessage: string,
    cleanedTitle: string,
): Promise<Readable | null> {
    const startedAt = Date.now()
    try {
        const stream = await streamViaSoundCloud(query, track.duration)
        const durationMs = observeStage(
            stageLabel === 'soundcloud-title'
                ? 'soundcloud_title'
                : 'soundcloud_full',
            startedAt,
            'ok',
        )
        stampFallbackStage(track, stageLabel)
        infoLog({
            message: 'Bridge: streamed via SoundCloud',
            data: { stage: stageLabel, cleanedTitle, durationMs },
        })
        return stream
    } catch (error) {
        const durationMs = observeStage(
            stageLabel === 'soundcloud-title'
                ? 'soundcloud_title'
                : 'soundcloud_full',
            startedAt,
            'fail',
        )
        warnLog({
            message: failureMessage,
            data: {
                error: (error as Error).message,
                cleanedTitle,
                durationMs,
            },
        })
        return null
    }
}

// #2142: this stage used to be gated on "the title had a parenthetical to
// strip", so titles without one (most tracks) silently never got a third
// attempt. It now always runs after stage 2 fails, broadening via
// extractSongCore (e.g. "Artist - Song" -> "Song") when there is no
// parenthetical to strip. The only reason to skip is a query that would
// be byte-identical to one already tried.
function computeCoreTitleCandidate(
    cleanedTitle: string,
    cleanedAuthor: string,
): string {
    const openParen = cleanedTitle.indexOf('(')
    const parenStrippedTitle =
        openParen > 0 ? cleanedTitle.slice(0, openParen).trim() : cleanedTitle
    return parenStrippedTitle !== cleanedTitle
        ? parenStrippedTitle
        : (extractSongCore(cleanedTitle, cleanedAuthor) ?? parenStrippedTitle)
}

async function attemptCoreStageOrLogExhausted(
    track: BridgeTrack,
    cleanedTitle: string,
    cleanedAuthor: string,
    youtubeStage: string | undefined,
): Promise<Readable | null> {
    const coreTitle = computeCoreTitleCandidate(cleanedTitle, cleanedAuthor)
    const alreadyTriedQueries = new Set([
        cleanSearchQuery(cleanedTitle, cleanedAuthor),
        cleanedTitle,
    ])

    if (!coreTitle || alreadyTriedQueries.has(coreTitle)) {
        logAllStagesExhausted(track, cleanedTitle, [
            youtubeStage || 'yt-dlp',
            'soundcloud-full',
            'soundcloud-title',
        ])
        return null
    }

    const startedAt = Date.now()
    try {
        const stream = await streamViaSoundCloud(coreTitle, track.duration)
        const durationMs = observeStage('soundcloud_core', startedAt, 'ok')
        stampFallbackStage(track, 'soundcloud-core')
        infoLog({
            message: 'Bridge: streamed via SoundCloud',
            data: { stage: 'soundcloud-core', cleanedTitle, durationMs },
        })
        return stream
    } catch (coreError) {
        const coreDurationMs = observeStage(
            'soundcloud_core',
            startedAt,
            'fail',
        )
        logAllStagesExhausted(
            track,
            cleanedTitle,
            [
                youtubeStage || 'yt-dlp',
                'soundcloud-full',
                'soundcloud-title',
                'soundcloud-core',
            ],
            { coreTitle, error: coreError, durationMs: coreDurationMs },
        )
        return null
    }
}

function logAllStagesExhausted(
    track: BridgeTrack,
    cleanedTitle: string,
    stages: string[],
    extra: {
        coreTitle?: string
        error?: unknown
        durationMs?: number
    } = {},
): void {
    captureMessage(
        'YouTube extraction exhausted all fallback stages',
        'warning',
        { title: track.title, url: safeUrlOrigin(track.url), stages },
        { category: 'music.youtube-extraction', stage: 'all-exhausted' },
    )
    warnLog({
        message: 'Bridge: all stages exhausted',
        error: extra.error,
        data: {
            title: track.title,
            cleanedTitle,
            coreTitle: extra.coreTitle,
            durationMs: extra.durationMs,
            url: track.url,
            stages,
        },
    })
}

export async function createResilientStream(
    track: BridgeTrack,
    _ext?: unknown,
): Promise<Readable> {
    const startedAt = Date.now()
    try {
        const stream = await resolveResilientStream(track)
        const durationMs = observeStage('bridge_total', startedAt, 'ok')
        debugLog({
            message: 'Bridge: resolved',
            data: { title: track.title, durationMs },
        })
        return stream
    } catch (error) {
        const durationMs = observeStage('bridge_total', startedAt, 'fail')
        debugLog({
            message: 'Bridge: failed',
            data: {
                title: track.title,
                error: (error as Error).message,
                durationMs,
            },
        })
        throw error
    }
}

async function resolveResilientStream(track: BridgeTrack): Promise<Readable> {
    const cleanedTitle = cleanTitle(track.title)
    const cleanedAuthor = cleanAuthor(track.author)
    const isSpotifyUrl = track.url
        ? isHost(track.url, 'open.spotify.com')
        : false

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

    // YouTube is answering media downloads with 403: skip yt-dlp instead of
    // paying 4-10 s per play for a known failure (#2653).
    const ytDlpBlocked = isYtDlpBlocked()
    if (ytDlpBlocked) {
        youtubeStage = 'yt-dlp-blocked'
        debugLog({
            message:
                'Bridge: yt-dlp blocked (YouTube 403), skipping to SoundCloud',
            data: { title: track.title },
        })
    }

    if (!ytDlpBlocked && track.url && !isSpotifyUrl) {
        const stream = await attemptYtDlpUrl(track, cleanedTitle)
        if (stream) return stream
        youtubeStage = 'yt-dlp-url'
    }

    if (!ytDlpBlocked && isSpotifyUrl) {
        const stream = await attemptYtDlpSearch(cleanedTitle, cleanedAuthor)
        if (stream) return stream
        youtubeStage = 'yt-dlp-search'
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

    const fullSearchStream = await attemptSoundCloud(
        cleanSearchQuery(cleanedTitle, cleanedAuthor),
        track,
        'soundcloud-full',
        'Bridge: SoundCloud primary search failed, retrying with title only',
        cleanedTitle,
    )
    if (fullSearchStream) return fullSearchStream

    const titleOnlyStream = await attemptSoundCloud(
        cleanedTitle,
        track,
        'soundcloud-title',
        'Bridge: title-only SoundCloud failed, retrying without parentheticals',
        cleanedTitle,
    )
    if (titleOnlyStream) return titleOnlyStream

    const coreStream = await attemptCoreStageOrLogExhausted(
        track,
        cleanedTitle,
        cleanedAuthor,
        youtubeStage,
    )
    if (coreStream) return coreStream

    throw new Error(`Bridge exhausted: no stream for "${track.title}"`)
}
