import { randomInt } from 'node:crypto'
import { QueryType, type GuildQueue, type Track } from 'discord-player'
import type { User } from 'discord.js'
import type { TrackHistoryEntry } from '@lucky/shared/services'
import { normalizeTrackKey } from '../../../utils/music/trackNormalization'
import { isHostedYoutubeEnabled } from '../../../config/featureFlags'
import { isHost } from '../../../utils/general/urlHost'
import {
    buildExcludedKeys,
    buildExcludedUrls,
    isDuplicateCandidate,
} from './diversitySelector'

// Budget for resolving persisted history URLs. Same order as the broad
// fallback so the refill cycle stays bounded when a source stalls (#2870).
const PERSISTENT_REPLAY_TIMEOUT_MS = 4_000

type ReplayItem = { url: string; title: string; author: string }

/**
 * Keep items with a url that is not playing or queued, and only one item per
 * url and per normalized title/artist key: history holds a song once per play,
 * so without this one song could fill every replay slot (#3077).
 */
export function dedupeReplayPool<T extends ReplayItem>(
    items: T[],
    excludedUrls: Set<string>,
    excludedKeys: Set<string>,
): T[] {
    const seenUrls = new Set<string>()
    const seenKeys = new Set<string>()
    return items.filter((item) => {
        if (!item.url || excludedUrls.has(item.url)) return false
        if (seenUrls.has(item.url)) return false
        seenUrls.add(item.url)
        const key = normalizeTrackKey(item.title, item.author)
        if (excludedKeys.has(key) || seenKeys.has(key)) return false
        seenKeys.add(key)
        return true
    })
}

/** Fisher-Yates shuffle in place, so successive passes vary the replay. */
export function shuffleInPlace<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
        const j = randomInt(i + 1)
        const picked = items[j] as T
        items[j] = items[i] as T
        items[i] = picked
    }
    return items
}

async function resolveEntry(
    queue: GuildQueue,
    entry: TrackHistoryEntry,
    requestedBy: User | null,
): Promise<Track | null> {
    try {
        const result = await queue.player.search(entry.url, {
            searchEngine: QueryType.AUTO,
            ...(requestedBy ? { requestedBy } : {}),
        })
        return result.tracks[0] ?? null
    } catch {
        return null
    }
}

/**
 * Last-resort autoplay source when the session has no history to replay, as
 * after a restart restores a queue (#3277): resolve a few shuffled, non-skipped
 * URLs from the guild history persisted across restarts. What is playing or
 * queued is excluded with the same url, video id and song identity keys as
 * queue duplicate detection, before and after search. Searches run in parallel
 * under one deadline; on timeout nothing is returned, so a stalled source
 * cannot enqueue into a later pass.
 */
export async function resolvePersistentHistoryReplay(
    queue: GuildQueue,
    currentTrack: Track,
    persistentHistory: TrackHistoryEntry[],
    limit: number,
    requestedBy: User | null,
    timeoutMs = PERSISTENT_REPLAY_TIMEOUT_MS,
): Promise<Track[]> {
    // Only playing/queued state: passing persistentHistory here would
    // exclude every entry this replay could pick.
    const excludedUrls = buildExcludedUrls(queue, currentTrack, [])
    const excludedKeys = buildExcludedKeys(queue, currentTrack, [])
    // No YouTube extractor is registered when hosted YouTube is off, so
    // those entries are guaranteed misses (#2486).
    const youtubeOff = !isHostedYoutubeEnabled()
    const playable = persistentHistory.filter(
        (e) =>
            !e.skipped &&
            !(youtubeOff && isHost(e.url, 'youtube.com', 'youtu.be')) &&
            !isDuplicateCandidate(
                { url: e.url, title: e.title, author: e.author } as Track,
                excludedUrls,
                excludedKeys,
            ),
    )
    // Over-fetch once: a search can miss or resolve to something queued.
    const picks = shuffleInPlace(
        dedupeReplayPool(playable, excludedUrls, excludedKeys),
    ).slice(0, limit * 2)
    if (picks.length === 0) return []

    let timer: ReturnType<typeof setTimeout> | undefined
    const resolved = await Promise.race([
        Promise.all(picks.map((e) => resolveEntry(queue, e, requestedBy))),
        new Promise<null>((resolve) => {
            timer = setTimeout(() => resolve(null), timeoutMs)
        }),
    ])
    clearTimeout(timer)
    if (!resolved) return []

    const found = resolved.filter(
        (t): t is Track =>
            t !== null && !isDuplicateCandidate(t, excludedUrls, excludedKeys),
    )
    return dedupeReplayPool(found, excludedUrls, excludedKeys).slice(0, limit)
}
