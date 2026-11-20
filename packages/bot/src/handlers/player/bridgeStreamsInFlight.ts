// Bridge streams being resolved right now, keyed by the discord-player Track
// object. A bridge resolve takes seconds (yt-dlp, youtubei, SoundCloud), and
// in that window the track is current but not playing. Anything that replays
// the current track then (the watchdog's requeue_current) started a second,
// parallel resolve of the same track (#3064).
const inFlight = new WeakMap<object, Promise<unknown>>()

export function isBridgeStreamInFlight(
    track: object | null | undefined,
): boolean {
    return track != null && inFlight.has(track)
}

/**
 * Runs `start` for `track`, one at a time. A call that arrives while another
 * resolve of the same track is in flight calls `onJoin`, waits for that
 * resolve to settle and only then starts its own, which by then is served by
 * the resolution cache the first one filled. Each caller gets its own stream:
 * a Readable cannot be shared between two players.
 */
export async function runBridgeStreamOnce<T>(
    track: object,
    start: () => Promise<T>,
    onJoin: () => void,
): Promise<T> {
    let pending = inFlight.get(track)
    if (pending) onJoin()
    while (pending) {
        await pending.catch(() => undefined)
        pending = inFlight.get(track)
    }
    const run = start()
    inFlight.set(track, run)
    try {
        return await run
    } finally {
        if (inFlight.get(track) === run) inFlight.delete(track)
    }
}
