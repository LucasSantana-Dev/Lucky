import { QueryType } from 'discord-player'
import type { VoiceBasedChannel } from 'discord.js'
import { warnLog } from '@lucky/shared/utils'
import { addBreadcrumb } from '@lucky/shared/utils/monitoring'

export type PlayResolutionArm =
    | 'primary'
    | 'youtube-fallback'
    | 'soundcloud-fallback'
    | 'failed'

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
    player: any,
    voiceChannel: VoiceBasedChannel,
    query: string,
    requestedProvider: string,
    searchEngine: QueryType,
    playOptions: any,
): Promise<{ result: any; telemetry: ResolutionTelemetry }> {
    const startTime = Date.now()
    let telemetry: ResolutionTelemetry = {
        resolvedVia: 'primary',
        latencyMs: 0,
        requestedProvider,
    }

    try {
        // Attempt primary resolution
        const result = await player.play(voiceChannel, query, playOptions)
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
                // Attempt YouTube fallback
                const result = await player.play(voiceChannel, query, {
                    ...(playOptions as Record<string, unknown>),
                    searchEngine: QueryType.YOUTUBE_SEARCH,
                })
                telemetry.latencyMs = Date.now() - startTime
                telemetry.resolvedVia = 'youtube-fallback'
                return { result, telemetry }
            } catch (youtubeError) {
                warnLog({
                    message:
                        'YouTube search failed, falling back to SoundCloud',
                    data: { query },
                })

                try {
                    // Attempt SoundCloud fallback
                    const result = await player.play(voiceChannel, query, {
                        ...(playOptions as Record<string, unknown>),
                        searchEngine: QueryType.SOUNDCLOUD_SEARCH,
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
