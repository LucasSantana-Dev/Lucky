import { redisClient } from './redis'
import { errorLog } from '../utils/general/log'
import type { AutoplayCounter } from './GuildSettingsService'

function getRedisKey(guildId: string, type: string): string {
    return `guild_settings:${guildId}:${type}`
}

export async function getAutoplayCounter(
    guildId: string,
    ttl: number,
): Promise<AutoplayCounter | null> {
    try {
        const data = await redisClient.get(
            getRedisKey(guildId, 'autoplay_counter'),
        )
        if (!data) return null
        return JSON.parse(data) as AutoplayCounter
    } catch (error) {
        errorLog({ message: 'Failed to get autoplay counter', error })
        return null
    }
}

export async function setAutoplayCounter(
    guildId: string,
    counter: AutoplayCounter,
    ttl: number,
): Promise<boolean> {
    try {
        await redisClient.setex(
            getRedisKey(guildId, 'autoplay_counter'),
            ttl,
            JSON.stringify(counter),
        )
        return true
    } catch (error) {
        errorLog({ message: 'Failed to set autoplay counter', error })
        return false
    }
}

export async function incrementAutoplayCounter(
    guildId: string,
    ttl: number,
): Promise<number> {
    try {
        const counter = (await getAutoplayCounter(guildId, ttl)) || {
            guildId,
            count: 0,
            lastReset: new Date(),
        }
        counter.count += 1
        await setAutoplayCounter(guildId, counter, ttl)
        return counter.count
    } catch (error) {
        errorLog({ message: 'Failed to increment autoplay counter', error })
        return 0
    }
}

export async function resetAutoplayCounter(
    guildId: string,
    ttl: number,
): Promise<boolean> {
    try {
        return await setAutoplayCounter(
            guildId,
            { guildId, count: 0, lastReset: new Date() },
            ttl,
        )
    } catch (error) {
        errorLog({ message: 'Failed to reset autoplay counter', error })
        return false
    }
}

export async function getRepeatCount(
    guildId: string,
    ttl: number,
): Promise<number> {
    try {
        const data = await redisClient.get(getRedisKey(guildId, 'repeat_count'))
        return data ? parseInt(data, 10) : 0
    } catch (error) {
        errorLog({ message: 'Failed to get repeat count', error })
        return 0
    }
}

export async function setRepeatCount(
    guildId: string,
    count: number,
    ttl: number,
): Promise<boolean> {
    try {
        await redisClient.setex(
            getRedisKey(guildId, 'repeat_count'),
            ttl,
            count.toString(),
        )
        return true
    } catch (error) {
        errorLog({ message: 'Failed to set repeat count', error })
        return false
    }
}

export async function incrementRepeatCount(
    guildId: string,
    ttl: number,
): Promise<number> {
    try {
        const current = await getRepeatCount(guildId, ttl)
        const next = current + 1
        await setRepeatCount(guildId, next, ttl)
        return next
    } catch (error) {
        errorLog({ message: 'Failed to increment repeat count', error })
        return 0
    }
}

export async function resetRepeatCount(
    guildId: string,
    ttl: number,
): Promise<boolean> {
    try {
        return await setRepeatCount(guildId, 0, ttl)
    } catch (error) {
        errorLog({ message: 'Failed to reset repeat count', error })
        return false
    }
}

export async function isRateLimited(
    guildId: string,
    command: string,
    cooldown: number,
): Promise<boolean> {
    try {
        const key = getRedisKey(guildId, `rate_limit:${command}`)
        const lastUsed = await redisClient.get(key)
        if (!lastUsed) {
            await redisClient.setex(key, cooldown, Date.now().toString())
            return false
        }
        return Date.now() - parseInt(lastUsed, 10) < cooldown * 1000
    } catch (error) {
        errorLog({ message: 'Failed to check rate limit', error })
        return false
    }
}

export async function setRateLimit(
    guildId: string,
    command: string,
    cooldown: number,
): Promise<void> {
    try {
        await redisClient.setex(
            getRedisKey(guildId, `rate_limit:${command}`),
            cooldown,
            Date.now().toString(),
        )
    } catch (error) {
        errorLog({ message: 'Failed to set rate limit', error })
    }
}

export async function clearAllAutoplayCounters(): Promise<boolean> {
    try {
        const keys = await redisClient.keys('guild_settings:*:autoplay_counter')
        for (const key of keys) {
            await redisClient.del(key)
        }
        return true
    } catch (error) {
        errorLog({ message: 'Failed to clear all autoplay counters', error })
        return false
    }
}
