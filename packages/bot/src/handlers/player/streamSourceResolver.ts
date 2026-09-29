import { getStreamBridgeFallbackLabel } from './streamFallbackState'

// Hardcoded rather than imported from '@discord-player/extractor' /
// 'discord-player-spotify' / 'discord-player-youtubei': those packages ship
// TS/ESM sources that ts-jest's CommonJS transform can't load (see
// playerFactory.spec.ts, which avoids importing playerFactory.ts itself for
// the same reason), and this file only needs three constant strings, not the
// extractor classes. Each is the package's own stable `.identifier` static,
// verified against the installed version — not expected to change across
// patch/minor releases.
const YOUTUBE_EXTRACTOR_IDENTIFIER =
    'com.retrouser955.discord-player.discord-player-youtubei'
const SPOTIFY_EXTRACTOR_IDENTIFIER =
    'com.discord-player.itsmaat.spotifyextractor'
const SOUNDCLOUD_EXTRACTOR_IDENTIFIER = 'com.discord-player.soundcloudextractor'

export type ActualStreamSource =
    'youtube' | 'soundcloud-bridge' | 'soundcloud' | 'other'

type ResolvableTrack = {
    metadata?: unknown
    extractor?: { identifier: string } | null
}

/**
 * The extractor that actually produced the audio for a played track — not
 * the search source `TrackHistory.source` records (e.g. "spotify" for
 * metadata matched via Spotify, even though Spotify has no audio of its own
 * and every Spotify track streams through the bridge below). See #2471.
 *
 * - `soundcloud-bridge`: resolved via play-dl's SoundCloud fallback inside
 *   `createResilientStream` (yt-dlp failed, or was skipped for a Spotify
 *   source) — stamped on the track by `stampFallbackStage`.
 * - `youtube`: resolved via yt-dlp inside `createResilientStream` — whether
 *   the query matched YouTube directly or was bridged there from Spotify
 *   (`SpotifyExtractor.stream()` always bridges, since Spotify gives
 *   metadata only). No fallback stamp means yt-dlp succeeded.
 * - `soundcloud`: the dedicated `SoundCloudExtractor` handled the track
 *   itself (a soundcloud.com URL/search), never touching the bridge.
 * - `other`: Apple Music, Vimeo, Attachment, or any other extractor.
 */
export function resolveActualStreamSource(
    track: ResolvableTrack,
): ActualStreamSource {
    if (getStreamBridgeFallbackLabel(track)) return 'soundcloud-bridge'

    const identifier = track.extractor?.identifier
    if (identifier === SOUNDCLOUD_EXTRACTOR_IDENTIFIER) return 'soundcloud'
    if (
        identifier === YOUTUBE_EXTRACTOR_IDENTIFIER ||
        identifier === SPOTIFY_EXTRACTOR_IDENTIFIER
    ) {
        return 'youtube'
    }

    return 'other'
}
