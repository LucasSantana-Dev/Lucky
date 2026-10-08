import type { Track } from 'discord-player'

/**
 * Hand-off between a /play that is waiting on a track to start and the
 * stream-failure recovery that runs when that start fails.
 *
 * When the first stream cannot be created discord-player skips the track and
 * `recoverFromStreamExtractionError` runs on its own: it may start a
 * replacement track, or give up and tell the channel. /play also wants to tell
 * the user. Without a hand-off the user could see a failure for a track that
 * then plays, or two failure messages. With a watch open for the guild and
 * track, recovery reports its outcome here instead of messaging the channel,
 * and /play (which owns the original reply) says it once.
 *
 * The watch is opened by /play and closed by /play, so it only lives while that
 * command is waiting; a track that fails later (queue advance, autoplay) finds
 * no watch and keeps the old channel notification.
 */
export type PlayStartOutcome = 'recovered' | 'gave_up'

export interface PlayStartWatch {
    readonly guildId: string
    /** Updated if a later search arm resolves a different track. */
    track: Track
    readonly settled: Promise<PlayStartOutcome>
}

type Entry = PlayStartWatch & { settle: (outcome: PlayStartOutcome) => void }

const watches = new Map<string, Entry>()

function sameTrack(a: Track, b: Track): boolean {
    return a === b || (Boolean(b.id) && a.id === b.id)
}

export function openPlayStartWatch(
    guildId: string,
    track: Track,
): PlayStartWatch {
    let settle!: (outcome: PlayStartOutcome) => void
    const settled = new Promise<PlayStartOutcome>((resolve) => {
        settle = resolve
    })
    const entry: Entry = { guildId, track, settled, settle }
    watches.set(guildId, entry)
    return entry
}

/** Removes the watch. Safe to call twice or after a newer watch replaced it. */
export function closePlayStartWatch(watch: PlayStartWatch): void {
    if (watches.get(watch.guildId) === watch) watches.delete(watch.guildId)
}

/**
 * Called by stream recovery. Returns true when a /play is watching this track,
 * in which case the caller must not notify the channel itself.
 */
export function settlePlayStartWatch(
    guildId: string,
    track: Track | null | undefined,
    outcome: PlayStartOutcome,
): boolean {
    const entry = watches.get(guildId)
    if (!entry || !track || !sameTrack(entry.track, track)) return false
    entry.settle(outcome)
    return true
}

export function waitForPlayStartOutcome(
    watch: PlayStartWatch,
    timeoutMs: number,
): Promise<PlayStartOutcome | 'timeout'> {
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs)
        timer.unref()
    })
    return Promise.race([watch.settled, timeout]).finally(() => {
        if (timer !== undefined) clearTimeout(timer)
    })
}
