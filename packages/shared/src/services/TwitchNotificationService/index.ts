import { getPrismaClient } from '../../utils/database/prismaClient'
import { errorLog, debugLog } from '../../utils/general/log'
import type { TwitchNotification } from '../../generated/prisma/client.js'

export type TwitchNotificationRow = Pick<
    TwitchNotification,
    'id' | 'guildId' | 'twitchUserId' | 'twitchLogin' | 'discordChannelId'
> & {
    guild?: { discordId: string }
}

export class TwitchNotificationService {
    async add(
        guildId: string,
        discordChannelId: string,
        twitchUserId: string,
        twitchLogin: string,
    ): Promise<boolean> {
        try {
            const prisma = getPrismaClient()
            await prisma.twitchNotification.upsert({
                where: {
                    guildId_twitchUserId: { guildId, twitchUserId },
                },
                create: {
                    guildId,
                    discordChannelId,
                    twitchUserId,
                    twitchLogin,
                },
                update: { discordChannelId, twitchLogin },
            })
            debugLog({
                message: `Twitch notification added: ${twitchLogin} (${twitchUserId}) -> channel ${discordChannelId} in guild ${guildId}`,
            })
            return true
        } catch (error) {
            errorLog({
                message: 'Failed to add Twitch notification',
                error,
            })
            return false
        }
    }

    async remove(guildId: string, twitchUserId: string): Promise<boolean> {
        try {
            const prisma = getPrismaClient()
            await prisma.twitchNotification.deleteMany({
                where: { guildId, twitchUserId },
            })
            debugLog({
                message: `Twitch notification removed: ${twitchUserId} from guild ${guildId}`,
            })
            return true
        } catch (error) {
            errorLog({
                message: 'Failed to remove Twitch notification',
                error,
            })
            return false
        }
    }

    async listByGuild(guildId: string): Promise<TwitchNotificationRow[]> {
        try {
            const prisma = getPrismaClient()
            return await prisma.twitchNotification.findMany({
                where: { guildId },
                orderBy: { twitchLogin: 'asc' },
            })
        } catch (error) {
            errorLog({
                message: 'Failed to list Twitch notifications',
                error,
            })
            return []
        }
    }

    async getNotificationsByTwitchUserId(
        twitchUserId: string,
    ): Promise<TwitchNotificationRow[]> {
        try {
            const prisma = getPrismaClient()
            return await prisma.twitchNotification.findMany({
                where: { twitchUserId },
                include: { guild: true },
            })
        } catch (error) {
            errorLog({
                message: 'Failed to get Twitch notifications by user id',
                error,
            })
            return []
        }
    }

    async getDistinctTwitchUserIds(): Promise<string[]> {
        try {
            const prisma = getPrismaClient()
            const rows = await prisma.twitchNotification.findMany({
                select: { twitchUserId: true },
                distinct: ['twitchUserId'],
            })
            return rows.map((r) => r.twitchUserId)
        } catch (error) {
            errorLog({
                message: 'Failed to get distinct Twitch user ids',
                error,
            })
            return []
        }
    }
}

export const twitchNotificationService = new TwitchNotificationService()
