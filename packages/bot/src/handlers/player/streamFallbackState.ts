import type { Track } from 'discord-player'

/**
 * SoundCloud fallback stages that can resolve a track when the primary
 * yt-dlp paths fail. When one of these resolves, the stage is stamped onto
 * the track's metadata so the Now Playing embed can tell the user a fallback
 * happened. Primary yt-dlp resolutions leave the metadata untouched.
 */
export type StreamBridgeFallbackStage =
    'soundcloud-full' | 'soundcloud-title' | 'soundcloud-core'

export const STREAM_BRIDGE_FALLBACK_METADATA_KEY = 'streamBridgeFallbackStage'

const FALLBACK_STAGE_LABELS: Record<StreamBridgeFallbackStage, string> = {
    'soundcloud-full': 'SoundCloud search',
    'soundcloud-title': 'SoundCloud title-only search',
    'soundcloud-core': 'SoundCloud simplified-title search',
}

/**
 * Human-readable label of the fallback stage that resolved this track, or
 * undefined when the primary yt-dlp source resolved it (or no stream was
 * bridged at all). Used to render a subtle footnote in the Now Playing embed.
 */
export function getStreamBridgeFallbackLabel(track: {
    metadata?: unknown
}): string | undefined {
    const stage = (track.metadata as Record<string, unknown> | undefined)?.[
        STREAM_BRIDGE_FALLBACK_METADATA_KEY
    ]
    if (typeof stage !== 'string') return undefined
    return FALLBACK_STAGE_LABELS[stage as StreamBridgeFallbackStage]
}

export function stampFallbackStage(
    track: Pick<
        Track,
        'title' | 'author' | 'duration' | 'url' | 'metadata' | 'setMetadata'
    >,
    stage: StreamBridgeFallbackStage,
): void {
    const existing =
        typeof track.metadata === 'object' && track.metadata !== null
            ? (track.metadata as Record<string, unknown>)
            : {}
    track.setMetadata({
        ...existing,
        [STREAM_BRIDGE_FALLBACK_METADATA_KEY]: stage,
    })
}

/**
 * Bridge stages that resolve a track from YouTube without yt-dlp. Unlike the
 * SoundCloud stages the audio is still the YouTube upload, so the Now Playing
 * embed shows no footnote; the stamp only feeds track_stream_source.
 */
export type StreamBridgeSource = 'youtubei-native'

export const STREAM_BRIDGE_SOURCE_METADATA_KEY = 'streamBridgeSource'

export function getStreamBridgeSource(track: {
    metadata?: unknown
}): StreamBridgeSource | undefined {
    const source = (track.metadata as Record<string, unknown> | undefined)?.[
        STREAM_BRIDGE_SOURCE_METADATA_KEY
    ]
    return source === 'youtubei-native' ? source : undefined
}

export function stampBridgeSource(
    track: Pick<Track, 'metadata' | 'setMetadata'>,
    source: StreamBridgeSource,
): void {
    const existing =
        typeof track.metadata === 'object' && track.metadata !== null
            ? (track.metadata as Record<string, unknown>)
            : {}
    track.setMetadata({
        ...existing,
        [STREAM_BRIDGE_SOURCE_METADATA_KEY]: source,
    })
}

/**
 * Drops the stamps a previous play of the same Track left behind, so a
 * replay resolved by yt-dlp is not reported as the earlier fallback.
 */
export function clearBridgeStamps(
    track: Pick<Track, 'metadata' | 'setMetadata'>,
): void {
    if (typeof track.metadata !== 'object' || track.metadata === null) return
    const existing = track.metadata as Record<string, unknown>
    if (
        !(STREAM_BRIDGE_FALLBACK_METADATA_KEY in existing) &&
        !(STREAM_BRIDGE_SOURCE_METADATA_KEY in existing)
    ) {
        return
    }
    const {
        [STREAM_BRIDGE_FALLBACK_METADATA_KEY]: _fallback,
        [STREAM_BRIDGE_SOURCE_METADATA_KEY]: _source,
        ...rest
    } = existing
    track.setMetadata(rest)
}
