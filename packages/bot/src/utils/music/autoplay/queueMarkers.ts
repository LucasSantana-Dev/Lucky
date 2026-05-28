import type { Track } from 'discord-player'
import type { RecommendationBasis } from './recommendationBasis'
import { serializeBasis } from './recommendationBasis'
import { recordRecommendationPick } from '../../../services/musicRecommendation/recommendationTelemetry'

/**
 * Mark a track as autoplay-generated with optional metadata.
 * Handles both mutable and sealed discord-player metadata objects.
 */
export function markAsAutoplayTrack(
    track: Track,
    recommendationReason: string,
    requestedById?: string,
): void {
    const descriptor = Object.getOwnPropertyDescriptor(track, 'metadata')

    if (descriptor?.configurable === false) {
        // discord-player seals metadata as a non-configurable property on some
        // track objects — Object.defineProperty would throw `Cannot redefine`.
        // Mutate the object the getter/value returns directly (stable reference).
        const meta = (
            track as unknown as { metadata?: Record<string, unknown> }
        ).metadata
        if (meta && typeof meta === 'object' && !Object.isFrozen(meta)) {
            meta['isAutoplay'] = true
            meta['recommendationReason'] = recommendationReason
            if (requestedById !== undefined)
                meta['requestedById'] = requestedById
        }
        return
    }

    const existingMetadata =
        (track as unknown as { metadata?: Record<string, unknown> }).metadata ??
        {}
    const existingRequestedById =
        typeof existingMetadata.requestedById === 'string'
            ? existingMetadata.requestedById
            : undefined

    Object.defineProperty(track, 'metadata', {
        value: {
            ...existingMetadata,
            isAutoplay: true,
            recommendationReason,
            requestedById: requestedById ?? existingRequestedById,
        },
        writable: true,
        configurable: true,
        enumerable: true,
    })
}

/**
 * Mark a track as autoplay-generated AND record the pick to the recommendation telemetry database.
 * Combines the metadata mutation with non-blocking telemetry write in a single call.
 *
 * Both operations are non-throwing: the metadata mutation is synchronous and safe;
 * recordRecommendationPick swallows DB errors internally.
 *
 * @param track - The discord-player Track object to mark
 * @param basis - The RecommendationBasis (source + signals) for this pick
 * @param guildId - The guild where the track is being queued
 * @param discordUserId - Optional: the Discord user who initiated the replenish
 * @param mode - Optional: the active autoplay mode (similar | discover | popular)
 */
export async function markAndRecordAutoplayTrack(
    track: Track,
    basis: RecommendationBasis,
    guildId: string,
    discordUserId?: string,
    mode?: 'similar' | 'discover' | 'popular',
): Promise<void> {
    // Mark the track synchronously with serialized reason
    const serializedReason = serializeBasis(basis)
    markAsAutoplayTrack(track, serializedReason, discordUserId)

    // Fire telemetry asynchronously (non-blocking)
    // recordRecommendationPick is non-throwing, so we don't need try/catch
    await recordRecommendationPick({
        guildId,
        discordUserId,
        trackId: track.id || track.url,
        title: track.title ?? '',
        author: track.author ?? '',
        url: track.url,
        thumbnail: undefined,
        basis,
        mode,
    })
}
