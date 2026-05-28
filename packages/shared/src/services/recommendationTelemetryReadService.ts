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

/**
 * Returns one row per distinct source value seen in the Recommendation table
 * for this guild within the window. Null source is its own row.
 */
export async function getPerSourceAcceptance(
    guildId: string,
    days?: number,
): Promise<PerSourceRow[]> {
    const prisma = getPrismaClient()
    const createdAtGte = getCreatedAtCutoff(days)

    // Group by source to get distinct sources and total count per source
    const groupByResult = await prisma.recommendation.groupBy({
        by: ['source'],
        where: {
            guildId,
            createdAt: {
                gte: createdAtGte,
            },
        },
        _count: {
            id: true,
        },
    })

    // For each source, fetch accepted, rejected, and pending counts
    const rows: PerSourceRow[] = []
    for (const group of groupByResult) {
        const source = group.source
        const count = group._count.id

        const getCountValue = (result: any): number =>
            typeof result === 'number' ? result : result.count

        const acceptedCount = getCountValue(
            await prisma.recommendation.count({
                where: {
                    guildId,
                    source,
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
                    source,
                    isRejected: true,
                    createdAt: {
                        gte: createdAtGte,
                    },
                },
            }),
        )

        const pendingCount = getCountValue(
            await prisma.recommendation.count({
                where: {
                    guildId,
                    source,
                    isAccepted: null,
                    isRejected: null,
                    createdAt: {
                        gte: createdAtGte,
                    },
                },
            }),
        )

        const denominator = acceptedCount + rejectedCount
        const acceptanceRate =
            denominator === 0 ? null : acceptedCount / denominator

        rows.push({
            source,
            count,
            acceptedCount,
            rejectedCount,
            pendingCount,
            acceptanceRate,
        })
    }

    return rows
}

/**
 * Returns one row per distinct mode value seen in the Recommendation table
 * for this guild within the window. Null mode is its own row.
 */
export async function getPerModeAcceptance(
    guildId: string,
    days?: number,
): Promise<PerModeRow[]> {
    const prisma = getPrismaClient()
    const createdAtGte = getCreatedAtCutoff(days)

    // Group by mode to get distinct modes and total count per mode
    const groupByResult = await prisma.recommendation.groupBy({
        by: ['mode'],
        where: {
            guildId,
            createdAt: {
                gte: createdAtGte,
            },
        },
        _count: {
            id: true,
        },
    })

    // For each mode, fetch accepted, rejected, and pending counts
    const rows: PerModeRow[] = []
    for (const group of groupByResult) {
        const mode = group.mode
        const count = group._count.id

        const getCountValue = (result: any): number =>
            typeof result === 'number' ? result : result.count

        const acceptedCount = getCountValue(
            await prisma.recommendation.count({
                where: {
                    guildId,
                    mode,
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
                    mode,
                    isRejected: true,
                    createdAt: {
                        gte: createdAtGte,
                    },
                },
            }),
        )

        const pendingCount = getCountValue(
            await prisma.recommendation.count({
                where: {
                    guildId,
                    mode,
                    isAccepted: null,
                    isRejected: null,
                    createdAt: {
                        gte: createdAtGte,
                    },
                },
            }),
        )

        const denominator = acceptedCount + rejectedCount
        const acceptanceRate =
            denominator === 0 ? null : acceptedCount / denominator

        rows.push({
            mode,
            count,
            acceptedCount,
            rejectedCount,
            pendingCount,
            acceptanceRate,
        })
    }

    return rows
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

    const getCountValue = (result: any): number =>
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
