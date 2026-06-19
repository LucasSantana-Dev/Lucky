import { getPrismaClient } from '../../utils/database/prismaClient'
import { errorLog, debugLog } from '../../utils/general/log'

export class TwitchFollowerRoleService {
    async configure(
        guildId: string,
        twitchBroadcasterId: string,
        twitchBroadcasterLogin: string,
        discordRoleId: string,
    ): Promise<boolean> {
        const prisma = getPrismaClient()
        try {
            await prisma.twitchFollowerRole.upsert({
                where: { guildId },
                create: {
                    guildId,
                    twitchBroadcasterId,
                    twitchBroadcasterLogin,
                    discordRoleId,
                },
                update: {
                    twitchBroadcasterId,
                    twitchBroadcasterLogin,
                    discordRoleId,
                },
            })
            debugLog({
                message: `TwitchFollowerRole configured for guild ${guildId}`,
            })
            return true
        } catch (error) {
            errorLog({
                message: 'TwitchFollowerRoleService: configure failed',
                error,
            })
            return false
        }
    }

    async removeConfig(guildId: string): Promise<boolean> {
        const prisma = getPrismaClient()
        try {
            await prisma.twitchFollowerRole.deleteMany({ where: { guildId } })
            return true
        } catch (error) {
            errorLog({
                message: 'TwitchFollowerRoleService: removeConfig failed',
                error,
            })
            return false
        }
    }

    async getConfig(guildId: string) {
        const prisma = getPrismaClient()
        try {
            return await prisma.twitchFollowerRole.findUnique({
                where: { guildId },
            })
        } catch (error) {
            errorLog({
                message: 'TwitchFollowerRoleService: getConfig failed',
                error,
            })
            return null
        }
    }

    async getAllConfigs() {
        const prisma = getPrismaClient()
        try {
            return await prisma.twitchFollowerRole.findMany()
        } catch (error) {
            errorLog({
                message: 'TwitchFollowerRoleService: getAllConfigs failed',
                error,
            })
            return []
        }
    }

    async linkUser(data: {
        discordUserId: string
        twitchUserId: string
        twitchLogin: string
        guildId: string
        isSubscriber?: boolean
    }): Promise<boolean> {
        const prisma = getPrismaClient()
        try {
            await prisma.twitchFollowerLink.upsert({
                where: {
                    discordUserId_guildId: {
                        discordUserId: data.discordUserId,
                        guildId: data.guildId,
                    },
                },
                create: {
                    ...data,
                    isFollower: true,
                    isSubscriber: data.isSubscriber ?? false,
                    lastCheckedAt: new Date(),
                },
                update: {
                    twitchUserId: data.twitchUserId,
                    twitchLogin: data.twitchLogin,
                    isFollower: true,
                    ...(data.isSubscriber !== undefined && {
                        isSubscriber: data.isSubscriber,
                    }),
                    lastCheckedAt: new Date(),
                },
            })
            debugLog({
                message: `TwitchFollowerLink upserted: discord=${data.discordUserId} twitch=${data.twitchUserId} guild=${data.guildId}`,
            })
            return true
        } catch (error) {
            errorLog({
                message: 'TwitchFollowerRoleService: linkUser failed',
                error,
            })
            return false
        }
    }

    async getLinksForGuild(guildId: string) {
        const prisma = getPrismaClient()
        try {
            return await prisma.twitchFollowerLink.findMany({
                where: { guildId },
            })
        } catch (error) {
            errorLog({
                message: 'TwitchFollowerRoleService: getLinksForGuild failed',
                error,
            })
            return []
        }
    }

    async updateFollowerStatus(
        discordUserId: string,
        guildId: string,
        isFollower: boolean,
    ): Promise<void> {
        const prisma = getPrismaClient()
        try {
            await prisma.twitchFollowerLink.updateMany({
                where: { discordUserId, guildId },
                data: { isFollower, lastCheckedAt: new Date() },
            })
        } catch (error) {
            errorLog({
                message:
                    'TwitchFollowerRoleService: updateFollowerStatus failed',
                error,
            })
        }
    }

    async getLinkCount(guildId: string): Promise<number> {
        const prisma = getPrismaClient()
        try {
            return await prisma.twitchFollowerLink.count({ where: { guildId } })
        } catch {
            return 0
        }
    }

    async getSubscriberCount(guildId: string): Promise<number> {
        const prisma = getPrismaClient()
        try {
            return await prisma.twitchFollowerLink.count({
                where: { guildId, isSubscriber: true },
            })
        } catch {
            return 0
        }
    }
}

export const twitchFollowerRoleService = new TwitchFollowerRoleService()
