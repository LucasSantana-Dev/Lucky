import type { SearchResult, Track } from 'discord-player'
import { escapeMarkdown } from 'discord.js'
import { warnLog } from '@lucky/shared/utils'
import { isHost } from '../../../../../utils/general/urlHost'

// discord-player-youtubei 3.1.0 builds a direct-URL track from innertube
// getBasicInfo() with no fallback. When YouTube answers that call without
// video details (bot check on the server IP), the track comes back with an
// empty title and author while yt-dlp, which has cookies, still streams it.
// Before this guard the song played under a blank now-playing card and the
// handler only failed after playback had started (2026-10-21, XxnUy3MKHoM).

const OEMBED_TIMEOUT_MS = 4_000

export class TrackMetadataUnavailableError extends Error {
    constructor() {
        super(
            "Could not load this video's details from YouTube. Please try again in a moment.",
        )
        this.name = 'TrackMetadataUnavailableError'
    }
}

type OEmbedResponse = {
    title?: unknown
    author_name?: unknown
    thumbnail_url?: unknown
}

function nonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

async function fetchYoutubeOEmbed(url: string): Promise<OEmbedResponse | null> {
    try {
        const endpoint = new URL('https://www.youtube.com/oembed')
        endpoint.searchParams.set('url', url)
        endpoint.searchParams.set('format', 'json')
        const response = await fetch(endpoint, {
            signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS),
        })
        if (!response.ok) return null
        return (await response.json()) as OEmbedResponse
    } catch {
        return null
    }
}

async function hydrateFromOEmbed(track: Track): Promise<boolean> {
    if (!isHost(track.url, 'youtube.com', 'youtu.be')) return false
    const data = await fetchYoutubeOEmbed(track.url)
    const title = nonEmptyString(data?.title)
    if (!title) return false

    // Same escaping the Track constructor applies to extractor titles.
    track.title = escapeMarkdown(title)
    track.cleanTitle = title
    if (!track.author) track.author = nonEmptyString(data?.author_name) ?? ''
    const thumbnail = nonEmptyString(data?.thumbnail_url)
    if (thumbnail) track.thumbnail = thumbnail
    track.description = `${track.title} by ${track.author}`
    return true
}

/**
 * Runs inside player.play()'s afterSearch, before the voice connection and
 * the stream. A single track that resolved without a title is filled from
 * YouTube oEmbed; when that is not possible the play is rejected here, so
 * nothing starts playing under a blank card. Playlists are left alone.
 */
export async function ensureTrackMetadata(
    result: SearchResult,
): Promise<SearchResult> {
    if (result.hasPlaylist()) return result
    const track = result.tracks[0]
    if (!track || track.title) return result

    if (await hydrateFromOEmbed(track)) {
        warnLog({
            message: 'Play: extractor returned no title, filled from oEmbed',
            data: { url: track.url, title: track.title },
        })
        return result
    }

    warnLog({
        message: 'Play: extractor returned no title, rejecting before play',
        data: { url: track.url },
    })
    throw new TrackMetadataUnavailableError()
}
