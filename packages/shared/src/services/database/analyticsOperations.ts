import type { PrismaClient } from '@prisma/client'
import type { DatabaseAnalytics, DatabaseArtistStats } from './types'
import { assertIsArray } from './models'

type TrackGroupByResult = {
    trackId: string
    title: string
    author: string
    _count: { trackId: number }
}

type ArtistGroupByResult = {
    author: string
    _count: { author: number }
}

export async function queryTopTracks(
    prisma: PrismaClient,
    guildId: string,
    limit: number,
): Promise<DatabaseAnalytics[]> {
    const raw: unknown = await prisma.trackHistory.groupBy({
        by: ['trackId', 'title', 'author'],
        where: { guild: { discordId: guildId } },
        _count: { trackId: true },
        orderBy: { _count: { trackId: 'desc' } },
        take: limit,
    })
    assertIsArray(raw)
    return (raw as TrackGroupByResult[]).map(
        (t): DatabaseAnalytics => ({
            trackId: String(t.trackId),
            title: String(t.title),
            author: String(t.author),
            playCount: Number(t._count.trackId),
        }),
    )
}

export async function queryTopArtists(
    prisma: PrismaClient,
    guildId: string,
    limit: number,
): Promise<DatabaseArtistStats[]> {
    const raw: unknown = await prisma.trackHistory.groupBy({
        by: ['author'],
        where: { guild: { discordId: guildId } },
        _count: { author: true },
        orderBy: { _count: { author: 'desc' } },
        take: limit,
    })
    assertIsArray(raw)
    return (raw as ArtistGroupByResult[]).map(
        (a): DatabaseArtistStats => ({
            author: String(a.author),
            playCount: Number(a._count.author),
        }),
    )
}

