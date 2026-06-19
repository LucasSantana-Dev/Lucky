import { getPrismaClient } from '../../utils/database/prismaClient'
import { errorLog, debugLog } from '../../utils/general/log'

export class TwitchSubscriberRoleService {
    async configure(
        guildId: string,
        twitchBroadcasterId: string,
        twitchBroadcasterLogin: string,
        discordRoleId: string,
    ) {
        const prisma = getPrismaClient()
        try {
            await prisma.twitchSubscriberRole.upsert({
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
                message: `TwitchSubscriberRole configured for guild ${guildId}`,
            })
            return true
        } catch (error) {
            errorLog({
                message: 'TwitchSubscriberRoleService: configure failed',
                error,
            })
            return false
        }
    }

    async removeConfig(guildId: string) {
        const prisma = getPrismaClient()
        try {
            await prisma.twitchSubscriberRole.deleteMany({ where: { guildId } })
            return true
        } catch (error) {
            errorLog({
                message: 'TwitchSubscriberRoleService: removeConfig failed',
                error,
            })
            return false
        }
    }

    async getConfig(guildId: string) {
        const prisma = getPrismaClient()
        try {
            return await prisma.twitchSubscriberRole.findUnique({
                where: { guildId },
            })
        } catch (error) {
            errorLog({
                message: 'TwitchSubscriberRoleService: getConfig failed',
                error,
            })
            return null
        }
    }

    async getAllConfigs() {
        const prisma = getPrismaClient()
        try {
            return await prisma.twitchSubscriberRole.findMany()
        } catch (error) {
            errorLog({
                message: 'TwitchSubscriberRoleService: getAllConfigs failed',
                error,
            })
            return []
        }
    }
}

export const twitchSubscriberRoleService = new TwitchSubscriberRoleService()
