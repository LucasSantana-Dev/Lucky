import { redisClient } from "../config/redis"
import { debugLog, errorLog } from "../utils/general/log"
import { ENVIRONMENT_CONFIG } from "../config/environmentConfig"

export type RateLimitConfig = {
    windowMs: number // Time window in milliseconds
    maxRequests: number // Maximum requests per window
    keyPrefix: string // Redis key prefix
}

export type RateLimitResult = {
    allowed: boolean
    remaining: number
    resetTime: number
    retryAfter?: number
}

class RateLimitService {
    async checkRateLimit(
        identifier: string,
        config: RateLimitConfig,
    ): Promise<RateLimitResult> {
        try {
            const key = `${config.keyPrefix}:${identifier}`
            const now = Date.now()
            const windowStart = now - config.windowMs

            // Get current requests in the window
            const requestsData = await redisClient.get(key)
            let requests: number[] = []

            if (requestsData) {
                requests = JSON.parse(requestsData) as number[]
                // Filter out requests outside the current window
                requests = requests.filter(
                    (timestamp) => timestamp > windowStart,
                )
            }

            const currentCount = requests.length
            const remaining = Math.max(0, config.maxRequests - currentCount)
            const allowed = currentCount < config.maxRequests

            if (allowed) {
                // Add current request timestamp
                requests.push(now)

                // Store updated requests with TTL
                const ttlSeconds = Math.ceil(config.windowMs / 1000)
                await redisClient.set(key, JSON.stringify(requests), ttlSeconds)
            }

            const resetTime = allowed
                ? now + config.windowMs
                : requests[0] + config.windowMs
            const retryAfter = allowed
                ? undefined
                : Math.ceil((resetTime - now) / 1000)

            return {
                allowed,
                remaining,
                resetTime,
                retryAfter,
            }
        } catch (error) {
            errorLog({ message: "Error checking rate limit:", error })
            // Fail open - allow request if Redis is unavailable
            return {
                allowed: true,
                remaining: config.maxRequests,
                resetTime: Date.now() + config.windowMs,
            }
        }
    }

    async checkCommandRateLimit(
        userId: string,
        commandName: string,
        windowMs: number = ENVIRONMENT_CONFIG.RATE_LIMITS.COMMAND_WINDOW_MS,
        maxRequests: number = ENVIRONMENT_CONFIG.RATE_LIMITS
            .COMMAND_MAX_REQUESTS,
    ): Promise<RateLimitResult> {
        const config: RateLimitConfig = {
            windowMs,
            maxRequests,
            keyPrefix: `cmd_rate_limit:${commandName}`,
        }

        return this.checkRateLimit(userId, config)
    }

    async checkMusicCommandRateLimit(
        userId: string,
        commandName: string,
        windowMs: number = ENVIRONMENT_CONFIG.RATE_LIMITS
            .MUSIC_COMMAND_WINDOW_MS,
        maxRequests: number = ENVIRONMENT_CONFIG.RATE_LIMITS
            .MUSIC_COMMAND_MAX_REQUESTS,
    ): Promise<RateLimitResult> {
        const config: RateLimitConfig = {
            windowMs,
            maxRequests,
            keyPrefix: `music_cmd_rate_limit:${commandName}`,
        }

        return this.checkRateLimit(userId, config)
    }

    async checkDownloadRateLimit(
        userId: string,
        windowMs: number = ENVIRONMENT_CONFIG.RATE_LIMITS.DOWNLOAD_WINDOW_MS,
        maxRequests: number = ENVIRONMENT_CONFIG.RATE_LIMITS
            .DOWNLOAD_MAX_REQUESTS,
    ): Promise<RateLimitResult> {
        const config: RateLimitConfig = {
            windowMs,
            maxRequests,
            keyPrefix: "download_rate_limit",
        }

        return this.checkRateLimit(userId, config)
    }

    /**
     * Check guild-wide rate limit
     */
    async checkGuildRateLimit(
        guildId: string,
        action: string,
        windowMs: number = 60000, // 1 minute
        maxRequests: number = 10,
    ): Promise<RateLimitResult> {
        const config: RateLimitConfig = {
            windowMs,
            maxRequests,
            keyPrefix: `guild_rate_limit:${action}`,
        }

        return this.checkRateLimit(guildId, config)
    }

    /**
     * Check API rate limit (for external services)
     */
    async checkAPIRateLimit(
        service: string,
        windowMs: number = 60000, // 1 minute
        maxRequests: number = 100,
    ): Promise<RateLimitResult> {
        const config: RateLimitConfig = {
            windowMs,
            maxRequests,
            keyPrefix: `api_rate_limit:${service}`,
        }

        return this.checkRateLimit(service, config)
    }

    /**
     * Reset rate limit for an identifier
     */
    async resetRateLimit(
        identifier: string,
        keyPrefix: string,
    ): Promise<boolean> {
        try {
            const key = `${keyPrefix}:${identifier}`
            const success = await redisClient.del(key)

            if (success) {
                debugLog({ message: `Reset rate limit for ${identifier}` })
            }

            return success
        } catch (error) {
            errorLog({ message: "Error resetting rate limit:", error })
            return false
        }
    }

    /**
     * Get current rate limit status
     */
    async getRateLimitStatus(
        identifier: string,
        keyPrefix: string,
        windowMs: number,
    ): Promise<{ count: number; remaining: number; resetTime: number } | null> {
        try {
            const key = `${keyPrefix}:${identifier}`
            const requestsData = await redisClient.get(key)

            if (!requestsData) {
                return null
            }

            const requests = JSON.parse(requestsData) as number[]
            const now = Date.now()
            const windowStart = now - windowMs

            // Filter requests within current window
            const validRequests = requests.filter(
                (timestamp) => timestamp > windowStart,
            )

            return {
                count: validRequests.length,
                remaining: 0, // Would need maxRequests to calculate
                resetTime:
                    validRequests.length > 0
                        ? validRequests[0] + windowMs
                        : now + windowMs,
            }
        } catch (error) {
            errorLog({ message: "Error getting rate limit status:", error })
            return null
        }
    }
}

// Export singleton instance
export const rateLimitService = new RateLimitService()
