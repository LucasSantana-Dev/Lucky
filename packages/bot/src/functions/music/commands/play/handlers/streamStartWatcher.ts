import type { Player, Track } from 'discord-player'

// discord-player's own value for a skip caused by a missing stream. Kept as a
// literal: the enum is not worth importing (and mocking) for one comparison.
const NO_STREAM_SKIP_REASON = 'ERR_NO_STREAM'

type QueueEventArgs = { guild?: { id?: string } }
type Listener = (...args: never[]) => void
type EventSource = {
    on: (event: string, listener: Listener) => unknown
    off: (event: string, listener: Listener) => unknown
}

export interface StreamStartWatcher {
    /** True when the stream for `track` could not be created in this window. */
    hasFailed: (track: Track | undefined | null) => boolean
    /** Detaches both listeners. Idempotent. */
    dispose: () => void
}

function sameTrack(a: Track, b: Track): boolean {
    return a === b || (Boolean(b.id) && a.id === b.id)
}

/**
 * discord-player never throws to the caller of `player.play()` when every
 * stream source fails: `throw_fn` emits `playerSkip` (ERR_NO_STREAM) and
 * `playerError` for the track and moves on, so `play()` resolves as if the
 * track had started. This records those events for one guild so the /play
 * handler can tell the difference.
 *
 * It lives only for the awaited `play()` call (the caller disposes it in a
 * finally), so there is no per-track map to leak. Failures of a track that
 * start later in the queue are out of its window by design and keep going
 * through the regular playerError handler.
 */
export function watchStreamStartFailures(
    player: Player,
    guildId: string,
): StreamStartWatcher {
    const events = player.events as unknown as EventSource
    const failed: Track[] = []

    const record = (queue: QueueEventArgs | undefined, track?: Track) => {
        if (queue?.guild?.id !== guildId || !track) return
        failed.push(track)
    }
    const onSkip = (
        queue: QueueEventArgs | undefined,
        track?: Track,
        reason?: string,
    ): void => {
        if (reason === NO_STREAM_SKIP_REASON) record(queue, track)
    }
    const onError = (
        queue: QueueEventArgs | undefined,
        _error: Error,
        track?: Track,
    ): void => record(queue, track)

    events.on('playerSkip', onSkip)
    events.on('playerError', onError)

    let disposed = false
    return {
        hasFailed: (track) =>
            Boolean(track) && failed.some((f) => sameTrack(f, track as Track)),
        dispose: () => {
            if (disposed) return
            disposed = true
            events.off('playerSkip', onSkip)
            events.off('playerError', onError)
        },
    }
}
