import type { Track, TrackSource } from 'discord-player'

/**
 * Typed accessors for discord-player {@link Track} fields the library leaves
 * loosely typed (`Track.source`'s getter and `Track.raw` are both `any`).
 *
 * Narrowing those `any` values here, at a single boundary, keeps every call
 * site type-safe instead of scattering casts — and gives one place to adjust
 * if the underlying extractor payloads change.
 */

/**
 * The track's playback source (youtube/spotify/soundcloud/…).
 *
 * `Track.source` is typed `any` by discord-player; assert it back to the real
 * {@link TrackSource} union. Returns `undefined` when the source is absent at
 * runtime so callers keep their existing fallbacks.
 */
export function trackSource(track: Track): TrackSource | undefined {
    return track.source as TrackSource | undefined
}

/**
 * The album name from the extractor's raw payload, when present.
 *
 * `Track.raw` is `any` and its shape varies by extractor; read `album.name`
 * defensively and hand callers a plain `string | undefined`.
 */
export function trackAlbumName(track: Track): string | undefined {
    const raw = track.raw as { album?: { name?: string } } | undefined
    const name = raw?.album?.name
    return typeof name === 'string' ? name : undefined
}
