import { getPrismaClient } from '../utils/database/prismaClient'
import { RecommendationSource } from '../types'

export interface PerSourceRow {
    source: RecommendationSource | null
    count: number
    acceptedCount: number
    rejectedCount: number
    pendingCount: number
    acceptanceRate: number | null
}

export interface PerModeRow {
    // Loose typing intentional: read aggregation may encounter pre-migration
    // null rows or unexpected values; the strict union is enforced at write time.
    mode: string | null
    count: number
    acceptedCount: number
    rejectedCount: number
    pendingCount: number
    acceptanceRate: number | null
}

export interface Summary {
    totalPicks: number
    accepted: number
    rejected: number
    pending: number
    globalAcceptanceRate: number | null
}

/**
 * Clamps days to [1, 30] range.
 */
function clampDays(days?: number): number {
    const value = days ?? 7
    return Math.max(1, Math.min(30, value))
}

/**
 * Computes the cutoff date based on days in the past.
 */
function getCreatedAtCutoff(days?: number): Date {
    const clampedDays = clampDays(days)
    return new Date(Date.now() - clampedDays * 86_400_000)
}

type AcceptanceCounts = {
    count: number
    acceptedCount: number
    rejectedCount: number
    pendingCount: number
}

/**
 * Single groupBy over [key, isAccepted, isRejected] folded into per-key
 * acceptance counts — replaces the former per-group count loop, which issued
 * three extra queries per distinct key (#1187).
 */
async function getAcceptanceByKey(
    key: 'source' | 'mode',
    guildId: string,
    days?: number,
): Promise<Map<string | null, AcceptanceCounts>> {
    const prisma = getPrismaClient()
    const createdAtGte = getCreatedAtCutoff(days)

    const groups = (await prisma.recommendation.groupBy({
        by: [key, 'isAccepted', 'isRejected'],
        where: {
            guildId,
            createdAt: {
                gte: createdAtGte,
            },
        },
        _count: {
            id: true,
        },
    })) as unknown as Array<{
        source?: string | null
        mode?: string | null
        isAccepted: boolean | null
        isRejected: boolean | null
        _count: { id: number }
    }>

    const byKey = new Map<string | null, AcceptanceCounts>()
    for (const group of groups) {
        const groupKey = (key === 'source' ? group.source : group.mode) ?? null
        const n = group._count.id
        let acc = byKey.get(groupKey)
        if (!acc) {
            acc = {
                count: 0,
                acceptedCount: 0,
                rejectedCount: 0,
                pendingCount: 0,
            }
            byKey.set(groupKey, acc)
        }
        acc.count += n
        if (group.isAccepted) {
            acc.acceptedCount += n
        } else if (group.isRejected) {
            acc.rejectedCount += n
        } else {
            acc.pendingCount += n
        }
    }
    return byKey
}

function toAcceptanceRate(
    acceptedCount: number,
    rejectedCount: number,
): number | null {
    const denominator = acceptedCount + rejectedCount
    return denominator === 0 ? null : acceptedCount / denominator
}

/**
 * Returns one row per distinct source value seen in the Recommendation table
 * for this guild within the window. Null source is its own row.
 */
export async function getPerSourceAcceptance(
    guildId: string,
    days?: number,
): Promise<PerSourceRow[]> {
    const byKey = await getAcceptanceByKey('source', guildId, days)
    return [...byKey.entries()].map(([source, acc]) => ({
        source: source as RecommendationSource | null,
        ...acc,
        acceptanceRate: toAcceptanceRate(acc.acceptedCount, acc.rejectedCount),
    }))
}

/**
 * Returns one row per distinct mode value seen in the Recommendation table
 * for this guild within the window. Null mode is its own row.
 */
export async function getPerModeAcceptance(
    guildId: string,
    days?: number,
): Promise<PerModeRow[]> {
    const byKey = await getAcceptanceByKey('mode', guildId, days)
    return [...byKey.entries()].map(([mode, acc]) => ({
        mode,
        ...acc,
        acceptanceRate: toAcceptanceRate(acc.acceptedCount, acc.rejectedCount),
    }))
}

/**
 * Returns aggregated totals across all sources for this guild within the window.
 */
export async function getSummary(
    guildId: string,
    days?: number,
): Promise<Summary> {
    const prisma = getPrismaClient()
    const createdAtGte = getCreatedAtCutoff(days)

    const getCountValue = (result: number | { count: number }): number =>
        typeof result === 'number' ? result : result.count

    const totalPicks = getCountValue(
        await prisma.recommendation.count({
            where: {
                guildId,
                createdAt: {
                    gte: createdAtGte,
                },
            },
        }),
    )

    const accepted = getCountValue(
        await prisma.recommendation.count({
            where: {
                guildId,
                isAccepted: true,
                createdAt: {
                    gte: createdAtGte,
                },
            },
        }),
    )

    const rejected = getCountValue(
        await prisma.recommendation.count({
            where: {
                guildId,
                isRejected: true,
                createdAt: {
                    gte: createdAtGte,
                },
            },
        }),
    )

    const pending = getCountValue(
        await prisma.recommendation.count({
            where: {
                guildId,
                isAccepted: null,
                isRejected: null,
                createdAt: {
                    gte: createdAtGte,
                },
            },
        }),
    )

    const denominator = accepted + rejected
    const globalAcceptanceRate =
        denominator === 0 ? null : accepted / denominator

    return {
        totalPicks,
        accepted,
        rejected,
        pending,
        globalAcceptanceRate,
    }
}

/**
 * Result of autoplay skip-rate computation.
 *
 * - skipRate: null if no resolved outcomes, otherwise rejected / (accepted + rejected)
 * - sampleSize: count of resolved (accepted + rejected) autoplay recommendations
 * - canTrip: true if sampleSize >= 5 (minimum sample guard)
 */
export interface AutoplaySkipRateResult {
    skipRate: number | null
    sampleSize: number
    acceptedCount: number
    rejectedCount: number
    canTrip: boolean
}

/**
 * Returns the rolling 24-hour autoplay skip-rate for a guild.
 * Requires minimum sample size of 5 resolved outcomes before canTrip=true.
 * Used by the circuit breaker to pause autoplay replenishment on high skip rates.
 */
export async function getAutoplaySkipRateForGuild(
    guildId: string,
): Promise<AutoplaySkipRateResult> {
    const prisma = getPrismaClient()
    const createdAtGte = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours

    const getCountValue = (result: number | { count: number }): number =>
        typeof result === 'number' ? result : result.count

    const acceptedCount = getCountValue(
        await prisma.recommendation.count({
            where: {
                guildId,
                isAccepted: true,
                createdAt: {
                    gte: createdAtGte,
                },
            },
        }),
    )

    const rejectedCount = getCountValue(
        await prisma.recommendation.count({
            where: {
                guildId,
                isRejected: true,
                createdAt: {
                    gte: createdAtGte,
                },
            },
        }),
    )

    const sampleSize = acceptedCount + rejectedCount
    const skipRate = sampleSize === 0 ? null : rejectedCount / sampleSize
    const canTrip = sampleSize >= 5

    return {
        skipRate,
        sampleSize,
        acceptedCount,
        rejectedCount,
        canTrip,
    }
}
