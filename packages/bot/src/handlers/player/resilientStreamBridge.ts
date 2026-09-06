import type { Readable } from 'stream'
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
import { stampFallbackStage } from './streamFallbackState'

export async function createResilientStream(
    track: Pick<
        Track,
        'title' | 'author' | 'duration' | 'url' | 'metadata' | 'setMetadata'
    >,
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
