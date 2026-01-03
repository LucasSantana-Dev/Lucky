import { redisClient } from '../../config/redis'
import { debugLog, errorLog } from '../../utils/general/log'
import type { GuildSettings, GuildSettingsConfig } from './types'

/**
 * Guild settings manager
 */
export class GuildSettingsManager {
    constructor(private readonly config: GuildSettingsConfig) {}

    private getSettingsKey(guildId: string): string {
        return `guild_settings:${guildId}`
    }

    async getGuildSettings(guildId: string): Promise<GuildSettings | null> {
        try {
            const key = this.getSettingsKey(guildId)
            const settingsData = await redisClient.get(key)

            if (!settingsData) {
                return null
            }

            return JSON.parse(settingsData) as GuildSettings
        } catch (error) {
            errorLog({ message: 'Failed to get guild settings:', error })
            return null
        }
    }

    async setGuildSettings(
        guildId: string,
        settings: GuildSettings,
    ): Promise<boolean> {
        try {
            const key = this.getSettingsKey(guildId)
            const settingsData = JSON.stringify(settings)

            const success = await redisClient.setex(
                key,
                this.config.settingsTtl,
                settingsData,
            )

            if (success) {
                debugLog({ message: `Updated guild settings for ${guildId}` })
            }

            return success
        } catch (error) {
            errorLog({ message: 'Failed to set guild settings:', error })
            return false
        }
    }

    async updateGuildSettings(
        guildId: string,
        updates: Partial<GuildSettings>,
    ): Promise<boolean> {
        try {
            const currentSettings = await this.getGuildSettings(guildId)
            if (!currentSettings) {
                return false
            }

            const updatedSettings = {
                ...currentSettings,
                ...updates,
                lastUpdated: Date.now(),
            }

            return await this.setGuildSettings(guildId, updatedSettings)
        } catch (error) {
            errorLog({ message: 'Failed to update guild settings:', error })
            return false
        }
    }

    async deleteGuildSettings(guildId: string): Promise<boolean> {
        try {
            const key = this.getSettingsKey(guildId)
            const success = await redisClient.del(key)

            if (success) {
                debugLog({ message: `Deleted guild settings for ${guildId}` })
            }

            return success
        } catch (error) {
            errorLog({ message: 'Failed to delete guild settings:', error })
            return false
        }
    }

    async getDefaultSettings(): Promise<GuildSettings> {
        return {
            autoplayEnabled: false,
            maxAutoplayTracks: this.config.defaultMaxAutoplayTracks,
            defaultVolume: this.config.defaultVolume,
            repeatMode: this.config.defaultRepeatMode,
            lastUpdated: Date.now(),
        }
    }
}
