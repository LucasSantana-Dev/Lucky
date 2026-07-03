import { getPrismaClient } from '../utils/database/prismaClient.js'

const prisma = getPrismaClient()

/** Configuration for channel cleanup (purge or TTL). */
export type ChannelCleanupConfig = {
    id: string
    guildId: string
    channelId: string
    mode: 'purge_interval' | 'ttl'
    intervalMinutes: number | null
    ttlSeconds: number | null
    enabled: boolean
    lastRunAt: Date | null
    createdAt: Date
    updatedAt: Date
}

/** Data for upserting cleanup configuration. */
type UpsertConfigData = {
    mode: 'purge_interval' | 'ttl'
    intervalMinutes?: number | null
    ttlSeconds?: number | null
    enabled?: boolean
}

/** Manages channel cleanup configuration. */
export class ChannelCleanupService {
    /** Retrieves cleanup configuration for a specific channel. */
    async getConfig(
        guildId: string,
        channelId: string,
    ): Promise<ChannelCleanupConfig | null> {
        return await prisma.channelCleanupConfig.findUnique({
            where: { guildId_channelId: { guildId, channelId } },
        })
    }

    /** Retrieves all enabled cleanup configs for a guild. */
    async getGuildConfigs(guildId: string): Promise<ChannelCleanupConfig[]> {
        return await prisma.channelCleanupConfig.findMany({
            where: { guildId, enabled: true },
        })
    }

    /** Creates or updates cleanup configuration for a channel. */
    async upsertConfig(
        guildId: string,
        channelId: string,
        data: UpsertConfigData,
    ): Promise<ChannelCleanupConfig> {
        return await prisma.channelCleanupConfig.upsert({
            where: { guildId_channelId: { guildId, channelId } },
            create: { guildId, channelId, ...data },
            update: data,
        })
    }

    /** Disables cleanup for a channel. */
    async disableCleanup(guildId: string, channelId: string): Promise<void> {
        await prisma.channelCleanupConfig.updateMany({
            where: { guildId, channelId },
            data: { enabled: false },
        })
    }

    /** Lists all cleanup configs for a guild. */
    async listConfigs(guildId: string): Promise<ChannelCleanupConfig[]> {
        return await prisma.channelCleanupConfig.findMany({
            where: { guildId },
            orderBy: { createdAt: 'desc' },
        })
    }

    /** Gets all purge_interval configs that are due for execution. */
    async getPurgeConfigsDue(minutes: number = 5): Promise<ChannelCleanupConfig[]> {
        const cutoffTime = new Date(Date.now() - minutes * 60 * 1000)
        return await prisma.channelCleanupConfig.findMany({
            where: {
                enabled: true,
                mode: 'purge_interval',
                OR: [
                    { lastRunAt: null },
                    { lastRunAt: { lt: cutoffTime } },
                ],
            },
        })
    }

    /** Marks a purge config as executed. */
    async markPurgeExecuted(id: string): Promise<ChannelCleanupConfig> {
        return await prisma.channelCleanupConfig.update({
            where: { id },
            data: { lastRunAt: new Date() },
        })
    }
}

/** Singleton instance of ChannelCleanupService. */
export const channelCleanupService = new ChannelCleanupService()
