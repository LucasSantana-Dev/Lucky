import { getPrismaClient } from '../utils/database/prismaClient'

const TOP_N = 5
const CARD_TOP_N = 25

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
    // Totals count every start; the top lists rank only what was not skipped,
    // so a track skipped four times cannot top the week (#2690).
    const listened = { ...where, skipped: false }

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
            where: listened,
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
            where: listened,
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

export interface RecapCardTrack {
    title: string
    author: string
    plays: number
    /** Most recent thumbnail URL in the window; null for rows written before thumbnails were stored. */
    thumbnail: string | null
}

/**
 * Up to 25 top tracks for the `lucky-render` collage (#2693), ranked exactly
 * like the embed's list. Thumbnails come from one extra query, not one per
 * track.
 */
export async function getRecapCardTracks(
    guildId: string,
    from: Date,
    to: Date,
): Promise<RecapCardTrack[]> {
    const prisma = getPrismaClient()
    const where = { guildId, playedAt: { gte: from, lt: to } }

    const tracks = await prisma.trackHistory.groupBy({
        by: ['title', 'author'],
        where: { ...where, skipped: false },
        _count: { _all: true },
        orderBy: [
            { _count: { title: 'desc' } },
            { title: 'asc' },
            { author: 'asc' },
        ],
        take: CARD_TOP_N,
    })
    if (tracks.length === 0) return []

    const thumbs = await prisma.trackHistory.findMany({
        where: {
            ...where,
            // A play that counts toward the ranking, not a skipped start.
            skipped: false,
            thumbnail: { not: null },
            OR: tracks.map((t) => ({ title: t.title, author: t.author })),
        },
        orderBy: { playedAt: 'desc' },
        distinct: ['title', 'author'],
        select: { title: true, author: true, thumbnail: true },
    })
    // Keyed by a JSON pair: a delimiter join would let "a|b"+"c" collide
    // with "a"+"b|c".
    const key = (title: string, author: string) =>
        JSON.stringify([title, author])
    const byTrack = new Map(
        thumbs.map((r) => [key(r.title, r.author), r.thumbnail]),
    )

    return tracks.map((t) => ({
        title: t.title,
        author: t.author,
        plays: t._count._all,
        thumbnail: byTrack.get(key(t.title, t.author)) ?? null,
    }))
}
