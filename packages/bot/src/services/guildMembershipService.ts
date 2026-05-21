import type { Client, Guild } from 'discord.js'
import { getPrismaClient, errorLog, infoLog } from '@lucky/shared/utils'

/**
 * Records a guild join: upserts the Guild row with joinedAt (clearing any
 * leftAt) and appends an immutable JOIN event to the membership log.
 */
export async function recordGuildJoin(guild: Guild): Promise<void> {
    const prisma = getPrismaClient()
    const joinedAt = guild.joinedTimestamp
        ? new Date(guild.joinedTimestamp)
        : new Date()
    try {
        await prisma.$transaction([
            prisma.guild.upsert({
                where: { discordId: guild.id },
                create: {
                    discordId: guild.id,
                    name: guild.name,
                    icon: guild.icon ?? null,
                    ownerId: guild.ownerId,
                    joinedAt,
                    leftAt: null,
                },
                update: {
                    name: guild.name,
                    icon: guild.icon ?? null,
                    ownerId: guild.ownerId,
                    joinedAt,
                    leftAt: null,
                },
            }),
            prisma.guildMembershipEvent.create({
                data: {
                    guildDiscordId: guild.id,
                    guildName: guild.name,
                    kind: 'JOIN',
                    occurredAt: joinedAt,
                },
            }),
        ])
    } catch (error) {
        errorLog({
            message: 'guildMembershipService: failed to record JOIN',
            data: { guildId: guild.id, name: guild.name },
            error,
        })
    }
}

/**
 * Records a guild departure: stamps leftAt on the Guild row (if it exists)
 * and appends a LEAVE event.
 */
export async function recordGuildLeave(
    guildDiscordId: string,
    guildName: string,
): Promise<void> {
    const prisma = getPrismaClient()
    const leftAt = new Date()
    try {
        await prisma.$transaction([
            prisma.guild.updateMany({
                where: { discordId: guildDiscordId },
                data: { leftAt },
            }),
            prisma.guildMembershipEvent.create({
                data: {
                    guildDiscordId,
                    guildName,
                    kind: 'LEAVE',
                    occurredAt: leftAt,
                },
            }),
        ])
    } catch (error) {
        errorLog({
            message: 'guildMembershipService: failed to record LEAVE',
            data: { guildId: guildDiscordId, name: guildName },
            error,
        })
    }
}

/**
 * On startup, backfill joinedAt for any guild the bot is currently in but
 * which has no recorded join (older row from before this feature, or join
 * event missed during downtime). Idempotent: rows that already have
 * joinedAt are left alone.
 */
export async function syncGuildsOnReady(client: Client): Promise<void> {
    const prisma = getPrismaClient()
    const cache = client.guilds.cache
    let synced = 0
    for (const guild of cache.values()) {
        try {
            const existing = await prisma.guild.findUnique({
                where: { discordId: guild.id },
                select: { joinedAt: true },
            })
            if (existing?.joinedAt) continue
            const joinedAt = guild.joinedTimestamp
                ? new Date(guild.joinedTimestamp)
                : new Date()
            await prisma.guild.upsert({
                where: { discordId: guild.id },
                create: {
                    discordId: guild.id,
                    name: guild.name,
                    icon: guild.icon ?? null,
                    ownerId: guild.ownerId,
                    joinedAt,
                    leftAt: null,
                },
                update: {
                    joinedAt,
                    leftAt: null,
                    name: guild.name,
                    icon: guild.icon ?? null,
                    ownerId: guild.ownerId,
                },
            })
            synced += 1
        } catch (error) {
            errorLog({
                message: 'guildMembershipService: failed to backfill guild',
                data: { guildId: guild.id, name: guild.name },
                error,
            })
        }
    }
    infoLog({
        message: `guildMembershipService: backfilled joinedAt for ${synced} of ${cache.size} cached guilds`,
    })
}
