import { redisClient } from '../../config/redis'
import { debugLog, errorLog } from '../../utils/general/log'
import type { AutoplayCounter, GuildSettingsConfig } from './types'

/**
 * Counter manager for autoplay and repeat tracking
 */
export class CounterManager {
    constructor(private readonly config: GuildSettingsConfig) {}

    private getAutoplayCounterKey(guildId: string): string {
        return `autoplay_counter:${guildId}`
    }

    private getRepeatCountKey(guildId: string): string {
        return `repeat_count:${guildId}`
    }

    async getAutoplayCounter(guildId: string): Promise<AutoplayCounter | null> {
        try {
            const key = this.getAutoplayCounterKey(guildId)
            const counterData = (await redisClient.get(key)) as string | null

            if (!counterData) {
                return null
            }

            return JSON.parse(counterData) as AutoplayCounter
        } catch (error) {
            errorLog({ message: 'Failed to get autoplay counter:', error })
            return null
        }
    }

    async setAutoplayCounter(
        guildId: string,
        counter: AutoplayCounter,
    ): Promise<boolean> {
        try {
            const key = this.getAutoplayCounterKey(guildId)
            const counterData = JSON.stringify(counter)

            const success = await redisClient.setex(
                key,
                this.config.counterTtl,
                counterData,
            )

            if (success) {
                debugLog({ message: `Updated autoplay counter for ${guildId}` })
            }

            return success
        } catch (error) {
            errorLog({ message: 'Failed to set autoplay counter:', error })
            return false
        }
    }

    async incrementAutoplayCounter(guildId: string): Promise<number> {
        try {
            const counter = await this.getAutoplayCounter(guildId)
            const newCounter: AutoplayCounter = {
                count: (counter?.count ?? 0) + 1,
                lastReset: counter?.lastReset ?? Date.now(),
            }

            await this.setAutoplayCounter(guildId, newCounter)
            return newCounter.count
        } catch (error) {
            errorLog({
                message: 'Failed to increment autoplay counter:',
                error,
            })
            return 0
        }
    }

    async resetAutoplayCounter(guildId: string): Promise<boolean> {
        try {
            const counter: AutoplayCounter = {
                count: 0,
                lastReset: Date.now(),
            }

            return await this.setAutoplayCounter(guildId, counter)
        } catch (error) {
            errorLog({ message: 'Failed to reset autoplay counter:', error })
            return false
        }
    }

    async getRepeatCount(guildId: string): Promise<number> {
        try {
            const key = this.getRepeatCountKey(guildId)
            const countData = await redisClient.get(key)

            if (!countData) {
                return 0
            }

            return parseInt(countData, 10)
        } catch (error) {
            errorLog({ message: 'Failed to get repeat count:', error })
            return 0
        }
    }

    async setRepeatCount(guildId: string, count: number): Promise<boolean> {
        try {
            const key = this.getRepeatCountKey(guildId)
            const success = await redisClient.setex(
                key,
                this.config.counterTtl,
                count.toString(),
            )

            if (success) {
                debugLog({ message: `Updated repeat count for ${guildId}` })
            }

            return success
        } catch (error) {
            errorLog({ message: 'Failed to set repeat count:', error })
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
            errorLog({ message: 'Failed to increment repeat count:', error })
            return 0
        }
    }

    async resetRepeatCount(guildId: string): Promise<boolean> {
        try {
            return await this.setRepeatCount(guildId, 0)
        } catch (error) {
            errorLog({ message: 'Failed to reset repeat count:', error })
            return false
        }
    }

    async clearAllAutoplayCounters(): Promise<boolean> {
        try {
            const pattern = 'autoplay_counter:*'
            const keys = await redisClient.keys(pattern)

            if (keys.length === 0) {
                return true
            }

            for (const key of keys) {
                await redisClient.del(key)
            }

            debugLog({ message: `Cleared ${keys.length} autoplay counters` })
            return true
        } catch (error) {
            errorLog({ message: 'Failed to clear all autoplay counters:', error })
            return false
        }
    }
}
