import type { GuildQueue, Track } from 'discord-player'

/**
 * Every track in the queue history, NEWEST FIRST (discord-player order).
 * Index 0 is the most recently played track, so "the last N played" is
 * `slice(0, N)`. Never use `slice(-N)` on the result: that reads the oldest.
 */
export function getAllHistoryTracks(queue: GuildQueue): Track[] {
    const history = queue.history as
        { tracks?: { toArray?: () => Track[]; data?: Track[] } } | undefined

    if (!history?.tracks) return []
    if (typeof history.tracks.toArray === 'function')
        return history.tracks.toArray()
    if (Array.isArray(history.tracks.data)) return history.tracks.data
    return []
}
