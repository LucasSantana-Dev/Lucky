import { redisClient } from './redis'
import { infoLog, errorLog } from '../utils/general/log'

export interface GuildSettings {
  guildId: string
  defaultVolume: number
  maxQueueSize: number
  autoPlayEnabled: boolean
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
  createdAt: Date
  updatedAt: Date
}

export interface AutoplayCounter {
  guildId: string
  count: number
  lastReset: Date
}

export class GuildSettingsService {
  private readonly ttl: number

  constructor(ttl = 7 * 24 * 60 * 60) {
    this.ttl = ttl
  }

  private getRedisKey(guildId: string, type?: string): string {
    return type ? `guild_settings:${guildId}:${type}` : `guild_settings:${guildId}`
  }

  private getDefaultSettings(): GuildSettings {
    return {
      guildId: '',
      defaultVolume: 50,
      maxQueueSize: 100,
      autoPlayEnabled: true,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  async getGuildSettings(guildId: string): Promise<GuildSettings | null> {
    try {
      const settingsData = await redisClient.get(this.getRedisKey(guildId))
      if (!settingsData) {
        return null
      }
      return JSON.parse(settingsData) as GuildSettings
    } catch (error) {
      errorLog({ message: 'Failed to get guild settings', error })
      return null
    }
  }

  async setGuildSettings(
    guildId: string,
    settings: Partial<GuildSettings>,
  ): Promise<boolean> {
    try {
      const existingSettings =
        (await this.getGuildSettings(guildId)) || this.getDefaultSettings()
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

  async incrementAutoplayCounter(guildId: string): Promise<number> {
    try {
      const counter =
        (await this.getAutoplayCounter(guildId)) || {
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

  async resetRepeatCount(guildId: string): Promise<boolean> {
    try {
      return await this.setRepeatCount(guildId, 0)
    } catch (error) {
      errorLog({ message: 'Failed to reset repeat count', error })
      return false
    }
  }

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
      errorLog({ message: 'Failed to clear all autoplay counters', error })
      return false
    }
  }
}

export const guildSettingsService = new GuildSettingsService()
