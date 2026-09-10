import type { Readable } from 'node:stream'
import type { Track } from 'discord-player'
import { debugLog, infoLog, warnLog } from '@lucky/shared/utils'
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
import { isHost } from '../../utils/general/urlHost'
import { streamViaYtDlp, streamViaYtDlpSearch } from './ytdlpProcess'
import {
    stampFallbackStage,
    type StreamBridgeFallbackStage,
} from './streamFallbackState'

type BridgeTrack = Pick<
    Track,
    'title' | 'author' | 'duration' | 'url' | 'metadata' | 'setMetadata'
>

async function attemptYtDlpUrl(
    track: BridgeTrack,
    cleanedTitle: string,
): Promise<Readable | null> {
    try {
        const stream = await streamViaYtDlp(track.url as string)
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
    try {
        const stream = await streamViaSoundCloud(query, track.duration)
        stampFallbackStage(track, stageLabel)
        return stream
    } catch (error) {
        warnLog({
            message: failureMessage,
            data: { error: (error as Error).message, cleanedTitle },
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

    try {
        const stream = await streamViaSoundCloud(coreTitle, track.duration)
        stampFallbackStage(track, 'soundcloud-core')
        return stream
    } catch (coreError) {
        logAllStagesExhausted(
            track,
            cleanedTitle,
            [
                youtubeStage || 'yt-dlp',
                'soundcloud-full',
                'soundcloud-title',
                'soundcloud-core',
            ],
            { coreTitle, error: coreError },
        )
        return null
    }
}

function logAllStagesExhausted(
    track: BridgeTrack,
    cleanedTitle: string,
    stages: string[],
    extra: { coreTitle?: string; error?: unknown } = {},
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
            url: track.url,
            stages,
        },
    })
}

export async function createResilientStream(
    track: BridgeTrack,
    _ext?: unknown,
): Promise<Readable> {
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

    if (track.url && !isSpotifyUrl) {
        const stream = await attemptYtDlpUrl(track, cleanedTitle)
        if (stream) return stream
        youtubeStage = 'yt-dlp-url'
    }

    if (isSpotifyUrl) {
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
