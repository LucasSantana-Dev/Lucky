import type { GuildQueue } from 'discord-player'
import { debugLog, warnLog } from '@lucky/shared/utils'
import {
    cleanTitle,
    cleanAuthor,
    cleanSearchQuery,
} from '../../utils/music/searchQueryCleaner'
import { isHost } from '../../utils/general/urlHost'
import { isYtDlpBlocked } from './ytdlpBlockBreaker'
import { searchYtDlpCandidates } from './ytdlpProcess'
import { pickYouTubeCandidate, youtubeWatchUrl } from './youtubeSearchMatcher'
import {
    getSpotifySource,
    isNegativeEntry,
    normalizeCacheKey,
    setSpotifySource,
} from './spotifySourceCache'

// Cache key (Spotify URL without `?si=`) -> in-flight prefetch. playerStart can fire for the same next
// track more than once (replays, quick skips), and each prefetch spawns
// yt-dlp, so a concurrent call for the same track joins the running one.
const inFlight = new Map<string, Promise<void>>()

/**
 * When a track starts playing, peek at the next track in queue. If it is a
 * Spotify track that is not yet cached, resolve its YouTube URL in the
 * background so the cache is warm before playback reaches it.
 *
 * Called fire-and-forget from the `playerStart` event handler; every error is
 * swallowed so a prefetch failure never affects the current track and never
 * becomes an unhandled rejection.
 *
 * Prefetch only ever writes positive entries. A failure here (timeout,
 * sign-in wall, kill switch) says nothing about whether the track can be
 * played, so it must not poison the cache with a negative entry that makes
 * playback skip YouTube for 5 minutes.
 */
export async function prefetchNextSpotifyTrack(
    queue: GuildQueue,
): Promise<void> {
    try {
        if (isYtDlpBlocked()) return

        const nextTrack = queue.tracks.at(0)
        if (!nextTrack) return

        const spotifyUrl = nextTrack.url
        if (!spotifyUrl || !isHost(spotifyUrl, 'open.spotify.com')) return

        // Same key the cache uses, so share links that differ only in `?si=`
        // join one prefetch.
        const key = normalizeCacheKey(spotifyUrl)
        const running = inFlight.get(key)
        // Awaited inside the try so a rejection of the shared task is logged
        // here instead of escaping to the fire-and-forget caller.
        if (running) return await running

        const task = resolveAndCache(spotifyUrl, nextTrack).finally(() => {
            inFlight.delete(key)
        })
        inFlight.set(key, task)
        await task
    } catch (error) {
        warnLog({
            message: 'Prefetch: unexpected failure',
            data: { error: (error as Error).message },
        })
    }
}

async function resolveAndCache(
    spotifyUrl: string,
    nextTrack: { title: string; author: string; duration?: string },
): Promise<void> {
    const already = await getSpotifySource(spotifyUrl).catch(() => null)
    if (already !== null) return // already cached (positive or negative)

    const cleanedTitle = cleanTitle(nextTrack.title)
    const cleanedAuthor = cleanAuthor(nextTrack.author)
    const ytQuery = `${cleanSearchQuery(cleanedTitle, cleanedAuthor)} official audio`

    try {
        const candidates = await searchYtDlpCandidates(ytQuery)
        const { pick } = pickYouTubeCandidate(
            {
                title: cleanedTitle,
                author: cleanedAuthor,
                sourceTitle: nextTrack.title,
                duration: nextTrack.duration,
            },
            candidates,
        )
        if (!pick) {
            debugLog({
                message: 'Prefetch: no validated YouTube hit for next track',
                data: { title: nextTrack.title, cleanedTitle },
            })
            return
        }

        // Playback may have cached a result while the search ran.
        const current = await getSpotifySource(spotifyUrl).catch(() => null)
        if (current !== null && !isNegativeEntry(current)) return

        await setSpotifySource(spotifyUrl, youtubeWatchUrl(pick.id))
        debugLog({
            message: 'Prefetch: cached YouTube URL for next Spotify track',
            data: { title: nextTrack.title, cleanedTitle, videoId: pick.id },
        })
    } catch (error) {
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
