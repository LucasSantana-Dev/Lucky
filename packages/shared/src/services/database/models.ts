import type { PrismaClient } from '@prisma/client'

export type UserModel = {
    id: string
    discordId: string
    username: string
    avatar: string | null
    createdAt: Date
    updatedAt: Date
}

export type GuildModel = {
    id: string
    discordId: string
    name: string
    icon: string | null
    ownerId: string
    createdAt: Date
    updatedAt: Date
}

export type TrackHistoryModel = {
    id: string
    guildId: string
    trackId: string
    title: string
    author: string
    duration: string
    url: string
    thumbnail: string | null
    source: string
    playedAt: Date
    createdAt: Date
    playedBy: string | null
    isAutoplay: boolean
    playlistName: string | null
    playDuration: number | null
    skipped: boolean | null
    isPlaylist: boolean | null
}

export type CommandUsageModel = {
    id: string
    userId: string | null
    guildId: string | null
    command: string
    category: string
    success: boolean
    errorCode: string | null
    duration: number | null
    createdAt: Date
}

function assertIsUserModel(value: unknown): asserts value is UserModel {
    if (
        !value ||
        typeof value !== 'object' ||
        !('id' in value) ||
        !('discordId' in value)
    ) {
        throw new Error('Invalid UserModel')
    }
}

function assertIsGuildModel(value: unknown): asserts value is GuildModel {
    if (
        !value ||
        typeof value !== 'object' ||
        !('id' in value) ||
        !('discordId' in value)
    ) {
        throw new Error('Invalid GuildModel')
    }
}

function assertIsTrackHistoryModel(
    value: unknown,
): asserts value is TrackHistoryModel {
    if (
        !value ||
        typeof value !== 'object' ||
        !('id' in value) ||
        !('trackId' in value)
    ) {
        throw new Error('Invalid TrackHistoryModel')
    }
}

function assertIsCommandUsageModel(
    value: unknown,
): asserts value is CommandUsageModel {
    if (
        !value ||
        typeof value !== 'object' ||
        !('id' in value) ||
        !('command' in value)
    ) {
        throw new Error('Invalid CommandUsageModel')
    }
}

export function assertIsArray<T>(value: unknown): asserts value is T[] {
    if (!Array.isArray(value)) {
        throw new Error('Invalid array result')
    }
}

export async function typedUserUpsert(
    prisma: PrismaClient,
    params: {
        where: { discordId: string }
        update: { username: string; avatar?: string }
        create: { discordId: string; username: string; avatar?: string }
    },
): Promise<UserModel> {
    const result: unknown = await prisma.user.upsert(params)
    assertIsUserModel(result)
    return result
}

export async function typedUserFindUnique(
    prisma: PrismaClient,
    params: { where: { discordId: string } },
): Promise<UserModel | null> {
    const result: unknown = await prisma.user.findUnique(params)
    if (!result) return null
    assertIsUserModel(result)
    return result
}

export async function typedGuildUpsert(
    prisma: PrismaClient,
    params: {
        where: { discordId: string }
        update: { name: string; icon?: string }
        create: {
            discordId: string
            name: string
            ownerId: string
            icon?: string
        }
    },
): Promise<GuildModel> {
    const result: unknown = await prisma.guild.upsert(params)
    assertIsGuildModel(result)
    return result
}

export async function typedGuildFindUnique(
    prisma: PrismaClient,
    params: { where: { discordId: string } },
): Promise<GuildModel | null> {
    const result: unknown = await prisma.guild.findUnique(params)
    if (!result) return null
    assertIsGuildModel(result)
    return result
}

export async function typedTrackHistoryCreate(
    prisma: PrismaClient,
    params: Parameters<PrismaClient['trackHistory']['create']>[0],
): Promise<TrackHistoryModel> {
    const result: unknown = await prisma.trackHistory.create(params)
    assertIsTrackHistoryModel(result)
    return result
}

export async function typedTrackHistoryFindMany(
    prisma: PrismaClient,
    params: {
        where: { guild: { discordId: string } }
        orderBy: { playedAt: 'desc' }
        take: number
    },
): Promise<TrackHistoryModel[]> {
    const result: unknown = await prisma.trackHistory.findMany(params)
    assertIsArray<TrackHistoryModel>(result)
    return result
}

export async function typedCommandUsageCreate(
    prisma: PrismaClient,
    params: Parameters<PrismaClient['commandUsage']['create']>[0],
): Promise<CommandUsageModel> {
    const result: unknown = await prisma.commandUsage.create(params)
    assertIsCommandUsageModel(result)
    return result
}

export async function typedRateLimitFindUnique(
    prisma: PrismaClient,
    params: { where: { key: string } },
): Promise<{ resetAt: Date; count: number } | null> {
    const result: unknown = await prisma.rateLimit.findUnique(params)
    if (!result) return null
    if (
        typeof result !== 'object' ||
        result === null ||
        !('resetAt' in result) ||
        !('count' in result)
    ) {
        throw new Error('Invalid rate limit result')
    }
    const resetAtValue = (result as { resetAt: unknown }).resetAt
    const countValue = (result as { count: unknown }).count
    if (!(resetAtValue instanceof Date) || typeof countValue !== 'number') {
        throw new Error('Invalid rate limit values')
    }
    return { resetAt: resetAtValue, count: countValue }
}
