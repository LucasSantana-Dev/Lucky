import { redisClient } from '../../config/redis'
import { debugLog, errorLog } from '../../utils/general/log'
import type { RateLimitConfig, RateLimitResult } from './types'

/**
 * Rate limit manager for handling rate limiting logic
 */
export class RateLimitManager {
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
            }

            // Filter requests within the current window
            const validRequests = requests.filter(
                (timestamp) => timestamp > windowStart,
            )

            // Check if limit is exceeded
            if (validRequests.length >= config.maxRequests) {
                const oldestRequest = Math.min(...validRequests)
                const resetTime = oldestRequest + config.windowMs
                const retryAfter = Math.ceil((resetTime - now) / 1000)

                return {
                    allowed: false,
                    remaining: 0,
                    resetTime,
                    retryAfter,
                }
            }

            // Add current request
            validRequests.push(now)

            // Store updated requests
            await redisClient.setex(
                key,
                Math.ceil(config.windowMs / 1000),
                JSON.stringify(validRequests),
            )

            return {
                allowed: true,
                remaining: config.maxRequests - validRequests.length,
                resetTime: now + config.windowMs,
            }
        } catch (error) {
            errorLog({ message: 'Rate limit check error:', error })
            // Allow request on error to prevent service disruption
            return {
                allowed: true,
                remaining: config.maxRequests,
                resetTime: Date.now() + config.windowMs,
            }
        }
    }

    async getRateLimitInfo(
        identifier: string,
        config: RateLimitConfig,
    ): Promise<RateLimitResult> {
        try {
            const key = `${config.keyPrefix}:${identifier}`
            const now = Date.now()
            const windowStart = now - config.windowMs

            const requestsData = await redisClient.get(key)
            let requests: number[] = []

            if (requestsData) {
                requests = JSON.parse(requestsData) as number[]
            }

            const validRequests = requests.filter(
                (timestamp) => timestamp > windowStart,
            )
            const remaining = Math.max(
                0,
                config.maxRequests - validRequests.length,
            )
            const resetTime =
                validRequests.length > 0
                    ? Math.min(...validRequests) + config.windowMs
                    : now + config.windowMs

            return {
                allowed: validRequests.length < config.maxRequests,
                remaining,
                resetTime,
            }
        } catch (error) {
            errorLog({ message: 'Rate limit info error:', error })
            return {
                allowed: true,
                remaining: config.maxRequests,
                resetTime: Date.now() + config.windowMs,
            }
        }
    }

    async resetRateLimit(
        identifier: string,
        config: RateLimitConfig,
    ): Promise<boolean> {
        try {
            const key = `${config.keyPrefix}:${identifier}`
            await redisClient.del(key)
            debugLog({ message: `Reset rate limit for ${identifier}` })
            return true
        } catch (error) {
            errorLog({ message: 'Rate limit reset error:', error })
            return false
        }
    }
}
