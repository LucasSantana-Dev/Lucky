import type { GuildQueue } from 'discord-player'
import { debugLog, warnLog } from '@lucky/shared/utils'
import {
    cleanTitle,
    cleanAuthor,
    cleanSearchQuery,
} from '../../utils/music/searchQueryCleaner'
import { isHost } from '../../utils/general/urlHost'
import { isYtDlpBlocked } from './ytdlpBlockBreaker'
import { resolveYtDlpSearchUrl } from './ytdlpProcess'
import {
    getSpotifySource,
    setSpotifySource,
    setSpotifySourceNegative,
} from './spotifySourceCache'

/**
 * When a track starts playing, peek at the next track in queue. If it is a
 * Spotify track that is not yet cached, resolve its YouTube URL in the
 * background so the cache is warm before playback reaches it.
 *
 * Called fire-and-forget from the `playerStart` event handler; all errors are
 * swallowed so a prefetch failure never affects the current track.
 */
export async function prefetchNextSpotifyTrack(
    queue: GuildQueue,
): Promise<void> {
    if (isYtDlpBlocked()) return

    let nextTrack
    try {
        nextTrack = queue.tracks.at(0)
    } catch {
        return
    }
    if (!nextTrack) return

    const spotifyUrl = nextTrack.url
    if (!spotifyUrl || !isHost(spotifyUrl, 'open.spotify.com')) return

    const already = await getSpotifySource(spotifyUrl).catch(() => null)
    if (already !== null) return // already cached (positive or negative)

    const cleanedTitle = cleanTitle(nextTrack.title)
    const cleanedAuthor = cleanAuthor(nextTrack.author)
    const ytQuery = `${cleanSearchQuery(cleanedTitle, cleanedAuthor)} official audio`

    try {
        const youtubeUrl = await resolveYtDlpSearchUrl(ytQuery)
        await setSpotifySource(spotifyUrl, youtubeUrl)
        debugLog({
            message: 'Prefetch: cached YouTube URL for next Spotify track',
            data: { title: nextTrack.title, cleanedTitle },
        })
    } catch (error) {
        await setSpotifySourceNegative(spotifyUrl).catch(() => undefined)
        warnLog({
            message: 'Prefetch: failed to resolve next Spotify track',
            data: {
                title: nextTrack.title,
                query: ytQuery,
                error: (error as Error).message,
            },
        })
    }
}
