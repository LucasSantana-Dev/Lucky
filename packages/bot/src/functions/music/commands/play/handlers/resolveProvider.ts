import { QueryType } from 'discord-player'
import type {
    Player,
    PlayerNodeInitializerOptions,
    PlayerNodeInitializationResult,
    SearchResult,
} from 'discord-player'
import type { VoiceBasedChannel } from 'discord.js'
import { warnLog } from '@lucky/shared/utils'
import { addBreadcrumb } from '@lucky/shared/utils/monitoring'

const SPOTIFY_EXTRACTOR_ID = 'com.discord-player.itsmaat.spotifyextractor'
const ATTACHMENT_EXTRACTOR_ID = 'com.discord-player.attachmentextractor'

// Extractors whose validate() ignores queryType and will therefore claim a
// plain text search they cannot serve. Blocked on the text-search fallback
// arms so the query reaches the provider the arm is actually named after.
//
// SpotifyExtractor was the first offender. AttachmentExtractor is the second:
// with the YouTube extractor degraded it captured both the YOUTUBE_SEARCH and
// SOUNDCLOUD_SEARCH arms, so every arm failed as
// "NoResultError (Extractor: com.discord-player.attachmentextractor)" and the
// SoundCloud fallback never actually ran (#1930).
const TEXT_SEARCH_BLOCKED_EXTRACTORS = [
    SPOTIFY_EXTRACTOR_ID,
    ATTACHMENT_EXTRACTOR_ID,
]

/**
 * Some extractors (Spotify's raw search API in particular) return their own
 * top hit as tracks[0] with no relevance re-ranking, so a short/ambiguous
 * query like "Prince" can surface a same-genre act (e.g. Prince Royce)
 * ahead of the artist the query actually names. This promotes a candidate
 * whose title or author exactly matches the query, leaving descriptive
 * queries (where no exact match exists) untouched.
 */
export function preferExactMatch(
    query: string,
): (result: SearchResult) => Promise<SearchResult> {
    const normalizedQuery = query.trim().toLowerCase()

    return async (result) => {
        if (result.hasPlaylist() || result.tracks.length <= 1) return result

        const bestIndex = result.tracks.findIndex((track) => {
            const author = track.author?.trim().toLowerCase()
            const title = track.title?.trim().toLowerCase()
            return author === normalizedQuery || title === normalizedQuery
        })
        if (bestIndex <= 0) return result

        const reordered = [...result.tracks]
        const [bestTrack] = reordered.splice(bestIndex, 1)
        reordered.unshift(bestTrack)
        return result.setTracks(reordered)
    }
}

export type PlayResolutionArm =
    'primary' | 'youtube-fallback' | 'soundcloud-fallback' | 'failed'

interface ResolutionTelemetry {
    resolvedVia: PlayResolutionArm
    latencyMs: number
    requestedProvider: string
    errorClass?: string
}

/**
 * Resolve a query via the discord-player with fallback chain.
 * Emits telemetry breadcrumbs for observability.
 */
export async function resolveQueryWithFallbacks(
    player: Player,
    voiceChannel: VoiceBasedChannel,
    query: string,
    requestedProvider: string,
    searchEngine: QueryType,
    playOptions: PlayerNodeInitializerOptions<unknown>,
): Promise<{
    result: PlayerNodeInitializationResult<unknown>
    telemetry: ResolutionTelemetry
}> {
    const startTime = Date.now()
    const telemetry: ResolutionTelemetry = {
        resolvedVia: 'primary',
        latencyMs: 0,
        requestedProvider,
    }
    const resolvedPlayOptions = {
        ...playOptions,
        afterSearch: preferExactMatch(query),
    }

    try {
        // Attempt primary resolution
        const result = await player.play(
            voiceChannel,
            query,
            resolvedPlayOptions,
        )
        telemetry.latencyMs = Date.now() - startTime
        telemetry.resolvedVia = 'primary'
        return { result, telemetry }
    } catch (primaryError) {
        if (searchEngine !== QueryType.AUTO) {
            warnLog({
                message: 'Primary search failed, falling back to YouTube',
                data: {
                    query,
                    requestedProvider,
                    searchEngine: String(searchEngine),
                    error: String(primaryError),
                },
            })

            try {
                // Attempt YouTube fallback. See TEXT_SEARCH_BLOCKED_EXTRACTORS
                // for why these are excluded.
                const result = await player.play(voiceChannel, query, {
                    ...resolvedPlayOptions,
                    searchEngine: QueryType.YOUTUBE_SEARCH,
                    blockExtractors: TEXT_SEARCH_BLOCKED_EXTRACTORS,
                })
                telemetry.latencyMs = Date.now() - startTime
                telemetry.resolvedVia = 'youtube-fallback'
                return { result, telemetry }
            } catch (_youtubeError) {
                warnLog({
                    message:
                        'YouTube search failed, falling back to SoundCloud',
                    data: { query, error: String(_youtubeError) },
                })

                try {
                    // Attempt SoundCloud fallback — same block reason as above
                    const result = await player.play(voiceChannel, query, {
                        ...resolvedPlayOptions,
                        searchEngine: QueryType.SOUNDCLOUD_SEARCH,
                        blockExtractors: TEXT_SEARCH_BLOCKED_EXTRACTORS,
                    })
                    telemetry.latencyMs = Date.now() - startTime
                    telemetry.resolvedVia = 'soundcloud-fallback'
                    return { result, telemetry }
                } catch (soundcloudError) {
                    // All fallbacks exhausted
                    telemetry.latencyMs = Date.now() - startTime
                    telemetry.resolvedVia = 'failed'
                    telemetry.errorClass = (
                        soundcloudError as Error
                    ).constructor.name
                    throw soundcloudError
                }
            }
        } else {
            // No fallbacks available for AUTO
            telemetry.latencyMs = Date.now() - startTime
            telemetry.resolvedVia = 'failed'
            telemetry.errorClass = (primaryError as Error).constructor.name
            throw primaryError
        }
    }
}

/**
 * Emit telemetry breadcrumb for play resolution.
 * Non-throwing to prevent telemetry from breaking the play flow.
 */
export function emitPlayResolutionTelemetry(
    telemetry: ResolutionTelemetry,
): void {
    try {
        addBreadcrumb(
            `play_provider_resolution: ${telemetry.resolvedVia}`,
            'play',
            'info',
            {
                requestedProvider: telemetry.requestedProvider,
                resolvedVia: telemetry.resolvedVia,
                latencyMs: telemetry.latencyMs,
                ...(telemetry.errorClass
                    ? { errorClass: telemetry.errorClass }
                    : {}),
            },
        )
    } catch {
        // Telemetry must never break the play flow
    }
}
