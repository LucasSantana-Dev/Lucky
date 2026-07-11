import { getPrismaClient } from '../utils/database/prismaClient.js'

const prisma = getPrismaClient()

/** Configuration for channel cleanup (purge or TTL). */
export type ChannelCleanupConfig = {
    id: string
    guildId: string
    channelId: string
    // "purge_interval" | "ttl" — kept as string to match the Prisma column.
    mode: string
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

    /**
     * Gets purge_interval configs that are due, honoring EACH config's own
     * intervalMinutes (a global window would purge a 60-minute channel on
     * every scheduler tick — review P1).
     */
    async getPurgeConfigsDue(): Promise<ChannelCleanupConfig[]> {
        const configs = await prisma.channelCleanupConfig.findMany({
            where: { enabled: true, mode: 'purge_interval' },
        })
        const now = Date.now()
        return configs.filter((config) => {
            if (!config.intervalMinutes || config.intervalMinutes < 1) {
                return false
            }
            if (!config.lastRunAt) return true
            return (
                now - config.lastRunAt.getTime() >=
                config.intervalMinutes * 60 * 1000
            )
        })
    }

    /**
     * All enabled TTL-mode configs. The scheduler sweeps these each tick to
     * delete messages older than their TTL — a durable backstop for deletes
     * orphaned when the bot restarts mid-TTL (setTimeout state is lost).
     */
    async getTtlConfigs(): Promise<ChannelCleanupConfig[]> {
        return await prisma.channelCleanupConfig.findMany({
            where: { enabled: true, mode: 'ttl' },
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
