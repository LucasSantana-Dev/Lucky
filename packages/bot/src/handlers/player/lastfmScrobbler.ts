import type { Track, GuildQueue } from 'discord-player'
import { LRUCache } from 'lru-cache'
import { debugLog, errorLog } from '@lucky/shared/utils'
import type { QueueMetadata } from '../../types/QueueMetadata'
import {
    isLastFmConfigured,
    getSessionKeyForUser,
    getTrackMetadata,
    isLastFmInvalidSessionError,
    handleDeadLastFmSession,
    updateNowPlaying as lastFmUpdateNowPlaying,
    scrobble as lastFmScrobble,
} from '../../lastfm'

/**
 * Module-level state for Last.fm track timing (when a track started playing).
 * Used to calculate the scrobble timestamp and lifetime.
 */
const lastFmTrackStartTime = new LRUCache<string, number>({
    max: 5000,
    ttl: 30 * 60 * 1000,
})

/**
 * Clear the Last.fm track start time for a guild (called by nowPlayingDisplay cleanup).
 */
export function clearLastFmTrackTiming(guildId: string): void {
    lastFmTrackStartTime.delete(guildId)
}

/**
 * Test hook: set the Last.fm track start time for a guild (used by tests only).
 */
export function __setLastFmTrackStartTime(guildId: string, timestamp: number): void {
    lastFmTrackStartTime.set(guildId, timestamp)
}

/**
 * Get the Last.fm requester ID from track or queue metadata.
 * Falls back through metadata.requestedById, queue.requestedBy, or undefined.
 */
function getLastFmRequesterId(
    queue: GuildQueue,
    track: Track,
): string | undefined {
    const metadataRequester = (
        track.metadata as { requestedById?: unknown } | undefined
    )?.requestedById
    const queueRequester = (queue.metadata as QueueMetadata | undefined)
        ?.requestedBy?.id
    const fallbackRequester =
        typeof metadataRequester === 'string' ? metadataRequester : undefined
    return track.requestedBy?.id ?? fallbackRequester ?? queueRequester
}

/**
 * Update Last.fm "now playing" status for a currently-playing track.
 * Stores the track's start timestamp for later scrobbling.
 */
export async function updateLastFmNowPlaying(
    queue: GuildQueue,
    track: Track,
): Promise<void> {
    if (!isLastFmConfigured()) return
    const requesterId = getLastFmRequesterId(queue, track)
    // Env fallback only for requester-less (autoplay/radio) tracks — an
    // identified-but-unlinked requester must not scrobble to the env
    // account. See decisions/2026-08-03-lastfm-dead-session-handling.md
    const sessionKey = await getSessionKeyForUser(requesterId, {
        allowEnvFallback: requesterId === undefined,
    })
    if (!sessionKey) return
    const durationSec =
        track.durationMS > 0 ? Math.round(track.durationMS / 1000) : undefined
    const meta = await getTrackMetadata(track.author, track.title)
    if (!meta) {
        debugLog({
            message:
                'Last.fm metadata not found, updating now-playing without metadata',
            data: { artist: track.author, title: track.title },
        })
    }
    // Capture the start time before the async call to avoid timing races if the
    // track changes during the request. This ensures we record when THIS track
    // started, not when the request completes.
    const trackStartTime = Math.floor(Date.now() / 1000)
    try {
        await lastFmUpdateNowPlaying(
            track.author,
            track.title,
            durationSec,
            sessionKey,
            meta ?? undefined,
        )
        lastFmTrackStartTime.set(queue.guild.id, trackStartTime)
    } catch (err) {
        if (isLastFmInvalidSessionError(err)) {
            await handleDeadLastFmSession(
                requesterId,
                sessionKey,
                queue.player.client,
                {
                    envFallbackUsed: requesterId === undefined,
                    via: 'updateNowPlaying',
                },
            )
        } else {
            errorLog({ message: 'Last.fm updateNowPlaying failed', error: err })
        }
    }
}

/**
 * Scrobble the currently-playing (or specified) track to Last.fm.
 * Uses the stored track start timestamp if available, otherwise uses current time.
 */
export async function scrobbleCurrentTrackIfLastFm(
    queue: GuildQueue,
    track?: Track,
): Promise<void> {
    const trackToScrobble = track ?? queue.currentTrack
    if (!trackToScrobble || !isLastFmConfigured()) return
    const requesterId = getLastFmRequesterId(queue, trackToScrobble)
    const sessionKey = await getSessionKeyForUser(requesterId, {
        allowEnvFallback: requesterId === undefined,
    })
    if (!sessionKey) return
    const startedAt = lastFmTrackStartTime.get(queue.guild.id)
    lastFmTrackStartTime.delete(queue.guild.id)
    const timestamp = startedAt ?? Math.floor(Date.now() / 1000)
    const durationSec =
        trackToScrobble.durationMS > 0
            ? Math.round(trackToScrobble.durationMS / 1000)
            : undefined
    const meta = await getTrackMetadata(
        trackToScrobble.author,
        trackToScrobble.title,
    )
    if (!meta) {
        debugLog({
            message: 'Last.fm metadata not found, scrobbling without metadata',
            data: {
                artist: trackToScrobble.author,
                title: trackToScrobble.title,
            },
        })
    }
    try {
        await lastFmScrobble(
            trackToScrobble.author,
            trackToScrobble.title,
            timestamp,
            durationSec,
            sessionKey,
            meta ?? undefined,
        )
    } catch (err) {
        if (isLastFmInvalidSessionError(err)) {
            await handleDeadLastFmSession(
                requesterId,
                sessionKey,
                queue.player.client,
                {
                    envFallbackUsed: requesterId === undefined,
                    via: 'scrobble',
                },
            )
        } else {
            errorLog({ message: 'Last.fm scrobble failed', error: err })
        }
    }
}
