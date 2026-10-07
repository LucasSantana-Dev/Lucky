import { getPrismaClient } from '../utils/database/prismaClient'

const TOP_N = 5

/**
 * What a guild listened to over one window. Versioned because it is also the
 * request body of the `lucky-render` card service
 * (decisions/2026-10-07-lucky-render-rust-sidecar.md). No user ids.
 */
export interface RecapPayload {
    schemaVersion: 1
    guildId: string
    /** Window start, inclusive (ISO 8601). */
    from: string
    /** Window end, exclusive (ISO 8601). */
    to: string
    plays: number
    skips: number
    autoplayPlays: number
    /** Sum of recorded play durations; plays without a duration add 0. */
    listenedSeconds: number
    topTracks: Array<{ title: string; author: string; plays: number }>
    topArtists: Array<{ name: string; plays: number }>
}

/**
 * Aggregates a guild's track history over `[from, to)` in SQL. It reads the
 * table directly instead of going through TrackHistoryService's read helpers,
 * which expire rows after 7 days and cap reads at 100 rows (#2678).
 */
export async function getWeeklyRecap(
    guildId: string,
    from: Date,
    to: Date,
): Promise<RecapPayload> {
    const prisma = getPrismaClient()
    const where = { guildId, playedAt: { gte: from, lt: to } }

    const [totals, skips, autoplayPlays, tracks, artists] = await Promise.all([
        prisma.trackHistory.aggregate({
            where,
            _count: { _all: true },
            _sum: { playDuration: true },
        }),
        prisma.trackHistory.count({ where: { ...where, skipped: true } }),
        prisma.trackHistory.count({ where: { ...where, isAutoplay: true } }),
        prisma.trackHistory.groupBy({
            by: ['title', 'author'],
            where,
            _count: { _all: true },
            orderBy: [
                { _count: { title: 'desc' } },
                { title: 'asc' },
                { author: 'asc' },
            ],
            take: TOP_N,
        }),
        prisma.trackHistory.groupBy({
            by: ['author'],
            where,
            _count: { _all: true },
            orderBy: [{ _count: { author: 'desc' } }, { author: 'asc' }],
            take: TOP_N,
        }),
    ])

    return {
        schemaVersion: 1,
        guildId,
        from: from.toISOString(),
        to: to.toISOString(),
        plays: totals._count._all,
        skips,
        autoplayPlays,
        listenedSeconds: totals._sum.playDuration ?? 0,
        topTracks: tracks.map((t) => ({
            title: t.title,
            author: t.author,
            plays: t._count._all,
        })),
        topArtists: artists.map((a) => ({
            name: a.author,
            plays: a._count._all,
        })),
    }
}
