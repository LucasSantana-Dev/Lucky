import { getPrismaClient } from '@lucky/shared/utils/database/prismaClient'
import { errorLog, warnLog } from '@lucky/shared/utils/general/log'
import { recommendationSourceToPrisma } from '../../utils/music/autoplay/recommendationSourceMapping'
import {
    serializeBasis,
    type RecommendationBasis,
} from '../../utils/music/autoplay/recommendationBasis'
import type { SkipReason } from '../../utils/music/skipReasonMap'

export interface RecordPickInput {
    guildId: string
    discordUserId?: string
    trackId: string
    title: string
    author: string
    url: string
    thumbnail?: string
    basis: RecommendationBasis
    confidence?: number
    mode?: 'similar' | 'discover' | 'popular'
}

export interface RecordOutcomeArgs {
    guildId: string
    trackId: string
    outcome: 'accepted' | 'rejected'
}

export interface RecordSkipReasonArgs {
    recommendationId: string
    skipReason: SkipReason
}

/**
 * Records a music recommendation pick into the database.
 * Non-blocking: swallows DB errors and logs them without throwing.
 */
export async function recordRecommendationPick(
    input: RecordPickInput,
): Promise<void> {
    try {
        const prisma = getPrismaClient()
        if (!prisma) {
            return
        }
        const prismaSource = recommendationSourceToPrisma(input.basis.source)
        const reason = serializeBasis(input.basis)

        await prisma.recommendation.create({
            data: {
                guildId: input.guildId,
                discordUserId: input.discordUserId ?? null,
                trackId: input.trackId,
                title: input.title,
                author: input.author,
                url: input.url,
                thumbnail: input.thumbnail ?? null,
                source: prismaSource,
                signals: input.basis.signals,
                reason,
                confidence: input.confidence ?? null,
                mode: input.mode ?? null,
            },
        })
    } catch (err) {
        errorLog({
            message:
                '[recordRecommendationPick] failed to insert Recommendation row',
            error: err,
        })
    }
}

/**
 * Records the outcome (accepted or rejected) of a music recommendation.
 * Finds the most recent Recommendation for the given guildId and trackId,
 * then updates it with the outcome.
 *
 * Non-blocking: swallows DB errors and logs them without throwing.
 * If no matching recommendation is found, logs a warning and returns.
 */
export async function recordRecommendationOutcome(
    args: RecordOutcomeArgs,
): Promise<void> {
    try {
        const prisma = getPrismaClient()
        if (!prisma) {
            return
        }

        const recommendation = await prisma.recommendation.findFirst({
            where: {
                guildId: args.guildId,
                trackId: args.trackId,
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: 1,
        })

        if (!recommendation) {
            warnLog({
                message: `[recordRecommendationOutcome] no Recommendation found for guildId=${args.guildId}, trackId=${args.trackId}`,
            })
            return
        }

        const updateData =
            args.outcome === 'accepted'
                ? { isAccepted: true }
                : { isRejected: true }

        await prisma.recommendation.update({
            where: { id: recommendation.id },
            data: updateData,
        })
    } catch (err) {
        errorLog({
            message:
                '[recordRecommendationOutcome] failed to update Recommendation row',
            error: err,
        })
    }
}

/**
 * Records the skip reason for a recommendation via emoji reaction on the now-playing control.
 * Non-blocking: swallows DB errors and logs them without throwing.
 * Does not affect the skip flow if persistence fails.
 */
export async function recordRecommendationSkipReason(
    args: RecordSkipReasonArgs,
): Promise<void> {
    try {
        const prisma = getPrismaClient()

        await prisma.recommendation.update({
            where: { id: args.recommendationId },
            data: { skipReason: args.skipReason },
        })
    } catch (err) {
        errorLog({
            message:
                '[recordRecommendationSkipReason] failed to update Recommendation row',
            error: err,
        })
    }
}
