/**
 * Rate limiting types and interfaces
 */

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

export type RateLimitRule = {
    name: string
    config: RateLimitConfig
    description: string
}

export type RateLimitStats = {
    totalRequests: number
    blockedRequests: number
    averageResponseTime: number
    lastReset: number
}
