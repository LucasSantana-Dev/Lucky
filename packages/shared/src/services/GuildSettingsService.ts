import { redisClient } from './redis'
import { infoLog, errorLog } from '../utils/general/log'

/** Guild-specific music and command settings cached in Redis. */
export interface GuildSettings {
    guildId: string
    defaultVolume: number
    maxQueueSize: number
    autoPlayEnabled: boolean
    autoplayMode?: 'similar' | 'discover' | 'popular'
    autoplayGenres?: string[]
    repeatMode: number
    shuffleEnabled: boolean
    prefix: string
    embedColor: string
    language: string
    allowDownloads: boolean
    allowPlaylists: boolean
    allowSpotify: boolean
    commandCooldown: number
    downloadCooldown: number
    djRoleId?: string
    idleTimeoutMinutes?: number
    voteSkipThreshold?: number
    createdAt: Date
    updatedAt: Date
}

/** Autoplay recommendation counter tracking for a guild. */
export interface AutoplayCounter {
    guildId: string
    count: number
    lastReset: Date
}

/** Manages guild settings and counters stored in Redis. */
export class GuildSettingsService {
    private readonly ttl: number

    constructor(ttl = 7 * 24 * 60 * 60) {
        this.ttl = ttl
    }

    private getRedisKey(guildId: string, type?: string): string {
        return type
            ? `guild_settings:${guildId}:${type}`
            : `guild_settings:${guildId}`
    }

    private getDefaultSettings(): GuildSettings {
        return {
            guildId: '',
            defaultVolume: 50,
            maxQueueSize: 100,
            autoPlayEnabled: true,
            autoplayMode: 'similar',
            autoplayGenres: [],
            repeatMode: 0,
            shuffleEnabled: false,
            prefix: '/',
            embedColor: '0x5865F2',
            language: 'en',
            allowDownloads: true,
            allowPlaylists: true,
            allowSpotify: true,
            commandCooldown: 3,
            downloadCooldown: 10,
            djRoleId: undefined,
            idleTimeoutMinutes: 0,
            voteSkipThreshold: 50,
            createdAt: new Date(),
            updatedAt: new Date(),
        }
    }

    /** Retrieves guild settings from Redis cache. */
    async getGuildSettings(guildId: string): Promise<GuildSettings | null> {
        try {
            const settingsData = await redisClient.get(
                this.getRedisKey(guildId),
            )
            if (!settingsData) {
                return null
            }
            return JSON.parse(settingsData) as GuildSettings
        } catch (error) {
            errorLog({ message: 'Failed to get guild settings', error })
            return null
        }
    }

    /** Sets guild settings, fully replacing existing values. */
    async setGuildSettings(
        guildId: string,
        settings: Partial<GuildSettings>,
    ): Promise<boolean> {
        try {
            const existingSettings =
                (await this.getGuildSettings(guildId)) ||
                this.getDefaultSettings()
            const updatedSettings: GuildSettings = {
                ...existingSettings,
                ...settings,
                guildId,
                updatedAt: new Date(),
            }

            await redisClient.setex(
                this.getRedisKey(guildId),
                this.ttl,
                JSON.stringify(updatedSettings),
            )

            infoLog({ message: `Updated guild settings for ${guildId}` })
            return true
        } catch (error) {
            errorLog({ message: 'Failed to set guild settings', error })
            return false
        }
    }

    /** Updates guild settings, merging with existing values. */
    async updateGuildSettings(
        guildId: string,
        updates: Partial<GuildSettings>,
    ): Promise<boolean> {
        try {
            const currentSettings = (await this.getGuildSettings(guildId)) ?? {
                ...this.getDefaultSettings(),
                guildId,
            }

            const updatedSettings = {
                ...currentSettings,
                ...updates,
                guildId,
                updatedAt: new Date(),
            }

            await redisClient.setex(
                this.getRedisKey(guildId),
                this.ttl,
                JSON.stringify(updatedSettings),
            )

            infoLog({ message: `Updated guild settings for ${guildId}` })
            return true
        } catch (error) {
            errorLog({ message: 'Failed to update guild settings', error })
            return false
        }
    }

    /** Deletes all guild settings from cache. */
    async deleteGuildSettings(guildId: string): Promise<boolean> {
        try {
            await redisClient.del(this.getRedisKey(guildId))
            infoLog({ message: `Deleted guild settings for ${guildId}` })
            return true
        } catch (error) {
            errorLog({ message: 'Failed to delete guild settings', error })
            return false
        }
    }

    /** Gets the autoplay recommendation counter for a guild. */
    async getAutoplayCounter(guildId: string): Promise<AutoplayCounter | null> {
        try {
            const counterData = await redisClient.get(
                this.getRedisKey(guildId, 'autoplay_counter'),
            )
            if (!counterData) {
                return null
            }
            return JSON.parse(counterData) as AutoplayCounter
        } catch (error) {
            errorLog({ message: 'Failed to get autoplay counter', error })
            return null
        }
    }

    /** Sets the autoplay recommendation counter for a guild. */
    async setAutoplayCounter(
        guildId: string,
        counter: AutoplayCounter,
    ): Promise<boolean> {
        try {
            await redisClient.setex(
                this.getRedisKey(guildId, 'autoplay_counter'),
                this.ttl,
                JSON.stringify(counter),
            )
            return true
        } catch (error) {
            errorLog({ message: 'Failed to set autoplay counter', error })
            return false
        }
    }

    /** Increments and returns the autoplay counter for a guild. */
    async incrementAutoplayCounter(guildId: string): Promise<number> {
        try {
            const counter = (await this.getAutoplayCounter(guildId)) || {
                guildId,
                count: 0,
                lastReset: new Date(),
            }

            counter.count += 1
            await this.setAutoplayCounter(guildId, counter)

            return counter.count
        } catch (error) {
            errorLog({ message: 'Failed to increment autoplay counter', error })
            return 0
        }
    }

    /** Resets the autoplay counter for a guild to zero. */
    async resetAutoplayCounter(guildId: string): Promise<boolean> {
        try {
            const counter: AutoplayCounter = {
                guildId,
                count: 0,
                lastReset: new Date(),
            }
            return await this.setAutoplayCounter(guildId, counter)
        } catch (error) {
            errorLog({ message: 'Failed to reset autoplay counter', error })
            return false
        }
    }

    /** Gets the repeat counter for a guild. */
    async getRepeatCount(guildId: string): Promise<number> {
        try {
            const countData = await redisClient.get(
                this.getRedisKey(guildId, 'repeat_count'),
            )
            return countData ? parseInt(countData, 10) : 0
        } catch (error) {
            errorLog({ message: 'Failed to get repeat count', error })
            return 0
        }
    }

    /** Sets the repeat counter for a guild. */
    async setRepeatCount(guildId: string, count: number): Promise<boolean> {
        try {
            await redisClient.setex(
                this.getRedisKey(guildId, 'repeat_count'),
                this.ttl,
                count.toString(),
            )
            return true
        } catch (error) {
            errorLog({ message: 'Failed to set repeat count', error })
            return false
        }
    }

    /** Increments and returns the repeat counter for a guild. */
    async incrementRepeatCount(guildId: string): Promise<number> {
        try {
            const currentCount = await this.getRepeatCount(guildId)
            const newCount = currentCount + 1
            await this.setRepeatCount(guildId, newCount)
            return newCount
        } catch (error) {
            errorLog({ message: 'Failed to increment repeat count', error })
            return 0
        }
    }

    /** Resets the repeat counter for a guild to zero. */
    async resetRepeatCount(guildId: string): Promise<boolean> {
        try {
            return await this.setRepeatCount(guildId, 0)
        } catch (error) {
            errorLog({ message: 'Failed to reset repeat count', error })
            return false
        }
    }

    /** Clears all guild session state (settings, counters, repeat count). */
    async clearGuildSessions(guildId: string): Promise<boolean> {
        try {
            const settingsDeleted = await this.deleteGuildSettings(guildId)
            const counterReset = await this.resetAutoplayCounter(guildId)
            const repeatReset = await this.resetRepeatCount(guildId)

            return settingsDeleted && counterReset && repeatReset
        } catch (error) {
            errorLog({ message: 'Failed to clear guild sessions', error })
            return false
        }
    }

    /** Checks if a command is rate-limited for a guild. */
    async isRateLimited(
        guildId: string,
        command: string,
        cooldown: number,
    ): Promise<boolean> {
        try {
            const key = this.getRedisKey(guildId, `rate_limit:${command}`)
            const lastUsed = await redisClient.get(key)

            if (!lastUsed) {
                await redisClient.setex(key, cooldown, Date.now().toString())
                return false
            }

            const timeSinceLastUse = Date.now() - parseInt(lastUsed, 10)
            return timeSinceLastUse < cooldown * 1000
        } catch (error) {
            errorLog({ message: 'Failed to check rate limit', error })
            return false
        }
    }

    /** Sets the rate limit for a command in a guild. */
    async setRateLimit(
        guildId: string,
        command: string,
        cooldown: number,
    ): Promise<void> {
        try {
            const key = this.getRedisKey(guildId, `rate_limit:${command}`)
            await redisClient.setex(key, cooldown, Date.now().toString())
        } catch (error) {
            errorLog({ message: 'Failed to set rate limit', error })
        }
    }

    /** Clears all autoplay counters across all guilds. */
    async clearAllAutoplayCounters(): Promise<boolean> {
        try {
            const pattern = 'guild_settings:*:autoplay_counter'
            const keys = await redisClient.keys(pattern)
            if (keys.length > 0) {
                for (const key of keys) {
                    await redisClient.del(key)
                }
            }
            return true
        } catch (error) {
            errorLog({
                message: 'Failed to clear all autoplay counters',
                error,
            })
            return false
        }
    }
}

/** Singleton instance of GuildSettingsService. */
export const guildSettingsService = new GuildSettingsService()
