import { redisClient } from "../config/redis"
import { debugLog, errorLog } from "../utils/general/log"

export type GuildSettings = {
    autoplayEnabled: boolean
    maxAutoplayTracks: number
    defaultVolume: number
    repeatMode: number
    lastUpdated: number
}

export type AutoplayCounter = {
    count: number
    lastReset: number
}

class GuildSettingsService {
    private readonly SETTINGS_TTL = 30 * 24 * 60 * 60 // 30 days
    private readonly COUNTER_TTL = 7 * 24 * 60 * 60 // 7 days

    private getSettingsKey(guildId: string): string {
        return `guild_settings:${guildId}`
    }

    private getAutoplayCounterKey(guildId: string): string {
        return `autoplay_counter:${guildId}`
    }

    private getRepeatCountKey(guildId: string): string {
        return `repeat_count:${guildId}`
    }

    async getGuildSettings(guildId: string): Promise<GuildSettings | null> {
        try {
            const settingsKey = this.getSettingsKey(guildId)
            const settingsData = await redisClient.get(settingsKey)

            if (!settingsData) {
                return null
            }

            return JSON.parse(settingsData) as GuildSettings
        } catch (error) {
            errorLog({
                message: "Error getting guild settings from Redis:",
                error,
            })
            return null
        }
    }

    /**
     * Set guild settings
     */
    async setGuildSettings(
        guildId: string,
        settings: Partial<GuildSettings>,
    ): Promise<boolean> {
        try {
            const settingsKey = this.getSettingsKey(guildId)

            // Get existing settings and merge
            const existingSettings = (await this.getGuildSettings(guildId)) ?? {
                autoplayEnabled: true,
                maxAutoplayTracks: 50,
                defaultVolume: 50,
                repeatMode: 0,
                lastUpdated: Date.now(),
            }

            const updatedSettings: GuildSettings = {
                ...existingSettings,
                ...settings,
                lastUpdated: Date.now(),
            }

            const success = await redisClient.set(
                settingsKey,
                JSON.stringify(updatedSettings),
                this.SETTINGS_TTL,
            )

            if (success) {
                debugLog({ message: `Updated guild settings for ${guildId}` })
            }

            return success
        } catch (error) {
            errorLog({
                message: "Error setting guild settings in Redis:",
                error,
            })
            return false
        }
    }

    /**
     * Get autoplay counter
     */
    async getAutoplayCounter(guildId: string): Promise<number> {
        try {
            const counterKey = this.getAutoplayCounterKey(guildId)
            const counterData = await redisClient.get(counterKey)

            if (!counterData) {
                return 0
            }

            const counter = JSON.parse(counterData) as AutoplayCounter
            return counter.count
        } catch (error) {
            errorLog({
                message: "Error getting autoplay counter from Redis:",
                error,
            })
            return 0
        }
    }

    /**
     * Increment autoplay counter
     */
    async incrementAutoplayCounter(
        guildId: string,
        count: number = 1,
    ): Promise<number> {
        try {
            const counterKey = this.getAutoplayCounterKey(guildId)
            const currentCount = await this.getAutoplayCounter(guildId)
            const newCount = currentCount + count

            const counter: AutoplayCounter = {
                count: newCount,
                lastReset: Date.now(),
            }

            await redisClient.set(
                counterKey,
                JSON.stringify(counter),
                this.COUNTER_TTL,
            )

            debugLog({
                message: `Incremented autoplay counter for ${guildId}: ${newCount}`,
            })
            return newCount
        } catch (error) {
            errorLog({
                message: "Error incrementing autoplay counter in Redis:",
                error,
            })
            return 0
        }
    }

    /**
     * Reset autoplay counter
     */
    async resetAutoplayCounter(guildId: string): Promise<boolean> {
        try {
            const counterKey = this.getAutoplayCounterKey(guildId)

            const counter: AutoplayCounter = {
                count: 0,
                lastReset: Date.now(),
            }

            const success = await redisClient.set(
                counterKey,
                JSON.stringify(counter),
                this.COUNTER_TTL,
            )

            if (success) {
                debugLog({ message: `Reset autoplay counter for ${guildId}` })
            }

            return success
        } catch (error) {
            errorLog({
                message: "Error resetting autoplay counter in Redis:",
                error,
            })
            return false
        }
    }

    /**
     * Set repeat count for guild
     */
    async setRepeatCount(
        guildId: string,
        count: number,
        mode: number,
    ): Promise<boolean> {
        try {
            const repeatKey = this.getRepeatCountKey(guildId)

            const repeatData = {
                count,
                mode,
                lastUpdated: Date.now(),
            }

            const success = await redisClient.set(
                repeatKey,
                JSON.stringify(repeatData),
                this.SETTINGS_TTL,
            )

            if (success) {
                debugLog({
                    message: `Set repeat count for ${guildId}: ${count} times`,
                })
            }

            return success
        } catch (error) {
            errorLog({ message: "Error setting repeat count in Redis:", error })
            return false
        }
    }

    /**
     * Get repeat count for guild
     */
    async getRepeatCount(
        guildId: string,
    ): Promise<{ count: number; mode: number } | null> {
        try {
            const repeatKey = this.getRepeatCountKey(guildId)
            const repeatData = await redisClient.get(repeatKey)

            if (!repeatData) {
                return null
            }

            const parsed = JSON.parse(repeatData)
            return {
                count: parsed.count,
                mode: parsed.mode,
            }
        } catch (error) {
            errorLog({
                message: "Error getting repeat count from Redis:",
                error,
            })
            return null
        }
    }

    /**
     * Clear repeat count for guild
     */
    async clearRepeatCount(guildId: string): Promise<boolean> {
        try {
            const repeatKey = this.getRepeatCountKey(guildId)
            const success = await redisClient.del(repeatKey)

            if (success) {
                debugLog({ message: `Cleared repeat count for ${guildId}` })
            }

            return success
        } catch (error) {
            errorLog({
                message: "Error clearing repeat count in Redis:",
                error,
            })
            return false
        }
    }

    /**
     * Clear all guild data
     */
    async clearGuildData(guildId: string): Promise<boolean> {
        try {
            const settingsKey = this.getSettingsKey(guildId)
            const counterKey = this.getAutoplayCounterKey(guildId)
            const repeatKey = this.getRepeatCountKey(guildId)

            const results = await Promise.all([
                redisClient.del(settingsKey),
                redisClient.del(counterKey),
                redisClient.del(repeatKey),
            ])

            const success = results.every((result) => result)

            if (success) {
                debugLog({ message: `Cleared all guild data for ${guildId}` })
            }

            return success
        } catch (error) {
            errorLog({ message: "Error clearing guild data in Redis:", error })
            return false
        }
    }
}

// Export singleton instance
export const guildSettingsService = new GuildSettingsService()
