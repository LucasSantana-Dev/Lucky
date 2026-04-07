import { redisClient } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'

export type ModDigestConfig = {
    guildId: string
    channelId: string
    enabled: boolean
    lastSentAt: number | null
    createdAt: number
}

const CONFIG_KEY_PREFIX = 'mod-digest:config:'
const INDEX_KEY = 'mod-digest:enabled-guilds'

export class ModDigestConfigService {
    private getConfigKey(guildId: string): string {
        return `${CONFIG_KEY_PREFIX}${guildId}`
    }

    async enable(guildId: string, channelId: string): Promise<ModDigestConfig> {
        const existing = await this.get(guildId)
        const config: ModDigestConfig = {
            guildId,
            channelId,
            enabled: true,
            lastSentAt: existing?.lastSentAt ?? null,
            createdAt: existing?.createdAt ?? Date.now(),
        }

        await redisClient.set(this.getConfigKey(guildId), JSON.stringify(config))
        await redisClient.sadd(INDEX_KEY, guildId)
        return config
    }

    async disable(guildId: string): Promise<boolean> {
        const existing = await this.get(guildId)
        if (!existing) return false

        await redisClient.del(this.getConfigKey(guildId))
        await redisClient.srem(INDEX_KEY, guildId)
        return true
    }

    async get(guildId: string): Promise<ModDigestConfig | null> {
        try {
            const raw = await redisClient.get(this.getConfigKey(guildId))
            if (!raw) return null
            return JSON.parse(raw) as ModDigestConfig
        } catch (error) {
            errorLog({
                message: 'Failed to read mod digest config',
                error,
                data: { guildId },
            })
            return null
        }
    }

    async listEnabledGuildIds(): Promise<string[]> {
        try {
            return await redisClient.smembers(INDEX_KEY)
        } catch (error) {
            errorLog({
                message: 'Failed to list enabled mod digest guilds',
                error,
            })
            return []
        }
    }

    async markSent(guildId: string, sentAt: number = Date.now()): Promise<void> {
        const existing = await this.get(guildId)
        if (!existing) return

        const updated: ModDigestConfig = { ...existing, lastSentAt: sentAt }
        await redisClient.set(this.getConfigKey(guildId), JSON.stringify(updated))
    }
}

export const modDigestConfigService = new ModDigestConfigService()
