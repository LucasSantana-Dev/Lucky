import { redisClient } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'

export type ModDigestConfig = {
    guildId: string
    channelId: string
    enabled: boolean
    lastSentAt: number | null
    createdAt: number
}

export type EnableModDigestInput = {
    guildId: string
    channelId: string
    lastSentAt?: number | null
    createdAt?: number
}

const CONFIG_KEY_PREFIX = 'mod-digest:config:'
const INDEX_KEY = 'mod-digest:enabled-guilds'

function isModDigestConfig(value: unknown): value is ModDigestConfig {
    if (!value || typeof value !== 'object') return false

    const candidate = value as Record<string, unknown>
    return (
        typeof candidate.guildId === 'string' &&
        typeof candidate.channelId === 'string' &&
        typeof candidate.enabled === 'boolean' &&
        (candidate.lastSentAt === null ||
            typeof candidate.lastSentAt === 'number') &&
        typeof candidate.createdAt === 'number'
    )
}

export class ModDigestConfigService {
    private getConfigKey(guildId: string): string {
        return `${CONFIG_KEY_PREFIX}${guildId}`
    }

    /**
     * Persist a guild's digest config and add it to the enabled-guilds index.
     * Callers can pre-populate `lastSentAt` (used by /digest schedule to write
     * the post-sample timestamp atomically with enabling, eliminating the
     * scheduler-tick race window).
     */
    async enable(input: EnableModDigestInput): Promise<ModDigestConfig> {
        const config: ModDigestConfig = {
            guildId: input.guildId,
            channelId: input.channelId,
            enabled: true,
            lastSentAt: input.lastSentAt ?? null,
            createdAt: input.createdAt ?? Date.now(),
        }

        await redisClient.set(
            this.getConfigKey(input.guildId),
            JSON.stringify(config),
        )
        await redisClient.sadd(INDEX_KEY, input.guildId)
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

            const parsed: unknown = JSON.parse(raw)
            if (!isModDigestConfig(parsed)) {
                errorLog({
                    message: 'Mod digest config payload failed validation',
                    data: { guildId },
                })
                return null
            }
            return parsed
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
