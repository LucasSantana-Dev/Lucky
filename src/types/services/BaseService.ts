/**
 * Base service class with common patterns
 */

import type { RedisClient } from '../../config/redis'

export interface ServiceConfig {
    ttl?: number
    maxSize?: number
    cleanupInterval?: number
}

export abstract class BaseService<TConfig extends ServiceConfig> {
    protected readonly config: TConfig
    protected readonly redisClient: RedisClient

    constructor(config: TConfig, redisClient: RedisClient) {
        this.config = config
        this.redisClient = redisClient
    }

    protected async executeWithFallback<T>(
        operation: () => Promise<T>,
        fallback: T,
        _operationName: string,
    ): Promise<T> {
        try {
            return await operation()
        } catch (_error) {
            // Log error using proper logging service
            // console.warn(`${_operationName} failed, using fallback:`, _error)
            return fallback
        }
    }

    protected getRedisKey(prefix: string, identifier: string): string {
        return `${prefix}:${identifier}`
    }

    protected async isHealthy(): Promise<boolean> {
        return this.redisClient.isHealthy()
    }
}
